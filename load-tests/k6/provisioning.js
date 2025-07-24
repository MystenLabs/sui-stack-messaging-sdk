import http from "k6/http";
import { config } from "./config.js";
import { metrics, recordMetric } from "./metrics.js";

const PROVISIONING_API_URL = "http://localhost:4321";

/**
 * Validates that the user configuration can be achieved with the given constraints
 * @returns {Object} Validation result with success status and error message if applicable
 */
function validateUserConfiguration() {
  const { activeUsers, passiveUsers } = config;

  // Calculate required channels for each user type
  const activeChannelsNeeded = Math.ceil(
    activeUsers.total / activeUsers.perChannel
  );
  const passiveChannelsNeeded = Math.ceil(
    passiveUsers.total / passiveUsers.perChannel
  );

  // Find the maximum number of channels needed
  const maxChannelsNeeded = Math.max(
    activeChannelsNeeded,
    passiveChannelsNeeded
  );

  // Check if we have enough users to fill all channels
  const totalActiveUsersNeeded = maxChannelsNeeded * activeUsers.perChannel;
  const totalPassiveUsersNeeded = maxChannelsNeeded * passiveUsers.perChannel;

  const errors = [];

  if (activeUsers.total < totalActiveUsersNeeded) {
    errors.push(
      `Insufficient active users: need ${totalActiveUsersNeeded} but only have ${activeUsers.total}. ` +
        `Either increase ACTIVE_USERS_TOTAL to ${totalActiveUsersNeeded} or decrease ACTIVE_USERS_PER_CHANNEL to ${Math.ceil(
          activeUsers.total / maxChannelsNeeded
        )}`
    );
  }

  if (passiveUsers.total < totalPassiveUsersNeeded) {
    errors.push(
      `Insufficient passive users: need ${totalPassiveUsersNeeded} but only have ${passiveUsers.total}. ` +
        `Either increase PASSIVE_USERS_TOTAL to ${totalPassiveUsersNeeded} or decrease PASSIVE_USERS_PER_CHANNEL to ${Math.ceil(
          passiveUsers.total / maxChannelsNeeded
        )}`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    channelsNeeded: maxChannelsNeeded,
    activeChannelsNeeded,
    passiveChannelsNeeded,
    totalActiveUsersNeeded,
    totalPassiveUsersNeeded,
  };
}

function generateUsers(variant, count) {
  const url = `${PROVISIONING_API_URL}/users/generate/${variant}?count=${count}`;
  const res = http.post(url);
  if (res.status !== 200) {
    console.error(`Failed to generate ${variant} users:`, res.body);
    return null;
  }
  return JSON.parse(res.body).users;
}

function fundUsers() {
  const url = `${PROVISIONING_API_URL}/users/fund`;
  const payload = JSON.stringify({
    sui_address: config.fundingAccount.address,
    secret_key: config.fundingAccount.secretKey,
    amount_per_user: config.fundingAccount.amountPerUser,
  });
  const params = { headers: { "Content-Type": "application/json" } };
  const res = http.post(url, payload, params);
  if (res.status !== 200) {
    console.error("Failed to fund users:", res.body);
    return false;
  }
  console.log(JSON.parse(res.body).message);
  return true;
}

function fetchUsers(variant, isFunded, limit = 100) {
  let url = `${PROVISIONING_API_URL}/users/with-secrets?variant=${variant}&limit=${limit}`;
  if (isFunded !== undefined) {
    url += `&is_funded=${isFunded}`;
  }
  const res = http.get(url);
  if (res.status !== 200) {
    console.error(`Failed to fetch ${variant} users:`, res.body);
    return [];
  }
  return JSON.parse(res.body).items;
}

function createChannel(channelName, initialMembers, creatorSecretKey) {
  const url = `${PROVISIONING_API_URL}/contract/channel`;
  const payload = JSON.stringify({
    secret_key: creatorSecretKey,
    channel_name: channelName,
    initial_members: initialMembers,
  });
  const params = { headers: { "Content-Type": "application/json" } };
  const res = http.post(url, payload, params);
  recordMetric(
    res,
    metrics.createChannel_latency,
    metrics.errorRate_createChannel
  );

  // Gas cost metrics
  if (res.headers["X-Gas-Cost"] && res.headers["X-Gas-Cost"] !== "0") {
    metrics.sendMessage_gas.add(parseFloat(res.headers["X-Gas-Cost"]));
  }

  if (res.status !== 200) {
    console.error("Failed to create channel:", res.body);
    return null;
  }
  return JSON.parse(res.body).channel;
}

// Function to create channels in batches for better parallelization
function createChannelsInBatch(channelConfigs, batchSize = 10) {
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < channelConfigs.length; i += batchSize) {
    const batch = channelConfigs.slice(i, i + batchSize);
    console.log(
      `Creating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        channelConfigs.length / batchSize
      )} (${batch.length} channels) in parallel...`
    );

    // Prepare batch requests for http.batch
    const batchRequests = batch.map((config) => ({
      method: "POST",
      url: `${PROVISIONING_API_URL}/contract/channel`,
      body: JSON.stringify({
        secret_key: config.creatorUser.secret_key,
        channel_name: config.channelName,
        initial_members: config.members,
      }),
      params: {
        headers: { "Content-Type": "application/json" },
      },
    }));

    // Execute batch requests in parallel using http.batch
    const batchResponses = http.batch(batchRequests);

    // Process responses and record metrics
    batchResponses.forEach((response, index) => {
      const config = batch[index];
      recordMetric(
        response,
        metrics.createChannel_latency,
        metrics.errorRate_createChannel
      );

      // Gas cost metrics
      if (
        response.headers["X-Gas-Cost"] &&
        response.headers["X-Gas-Cost"] !== "0"
      ) {
        metrics.createChannel_gas.add(
          parseFloat(response.headers["X-Gas-Cost"])
        );
      }

      if (response.status === 200) {
        try {
          const channelData = JSON.parse(response.body);
          results.push(channelData);
        } catch (error) {
          console.error(
            `Failed to parse response for channel ${config.channelName}:`,
            error
          );
          results.push(null);
        }
      } else {
        console.error(
          `Failed to create channel ${config.channelName}:`,
          response.body
        );
        results.push(null);
      }
    });
  }

  const endTime = Date.now();
  const successfulChannels = results.filter((result) => result !== null).length;
  console.log(
    `Channel creation completed in ${
      (endTime - startTime) / 1000
    }s. Successfully created ${successfulChannels}/${
      channelConfigs.length
    } channels.`
  );

  return results;
}

export function setupTestEnvironment() {
  console.log("Setting up the test environment...");

  // 0. Validate configuration before proceeding
  const validation = validateUserConfiguration();
  if (!validation.isValid) {
    console.error("Configuration validation failed:");
    validation.errors.forEach((error) => console.error(`- ${error}`));
    throw new Error(
      "Invalid user configuration. Please fix the configuration errors above."
    );
  }

  console.log(`Configuration validated successfully:`);
  console.log(`- Will create ${validation.channelsNeeded} channels`);
  console.log(
    `- Active users: ${config.activeUsers.total} total, ${config.activeUsers.perChannel} per channel`
  );
  console.log(
    `- Passive users: ${config.passiveUsers.total} total, ${config.passiveUsers.perChannel} per channel`
  );
  console.log(
    `- User distribution: Active users ${validation.activeChannelsNeeded} channels, Passive users ${validation.passiveChannelsNeeded} channels`
  );
  console.log(
    `- Total users needed: ${validation.totalActiveUsersNeeded} active, ${validation.totalPassiveUsersNeeded} passive`
  );

  // 1. Generate users if needed
  let activeUsers = fetchUsers("active", undefined, config.activeUsers.total);
  if (activeUsers.length < config.activeUsers.total) {
    console.log(
      `Generating ${
        config.activeUsers.total - activeUsers.length
      } active users...`
    );
    generateUsers("active", config.activeUsers.total - activeUsers.length);
  }

  let passiveUsers = fetchUsers(
    "passive",
    undefined,
    config.passiveUsers.total
  );
  if (passiveUsers.length < config.passiveUsers.total) {
    console.log(
      `Generating ${
        config.passiveUsers.total - passiveUsers.length
      } passive users...`
    );
    generateUsers("passive", config.passiveUsers.total - passiveUsers.length);
  }

  // 2. Fund active users
  const activeUsersToFund = fetchUsers(
    "active",
    false,
    config.activeUsers.total
  );
  if (activeUsersToFund.length > 0) {
    console.log(`Funding ${activeUsersToFund.length} active users...`);
    fundUsers();
  }

  // 3. Fetch all provisioned users
  const allActiveUsers = fetchUsers("active", true, config.activeUsers.total);
  const allPassiveUsers = fetchUsers(
    "passive",
    false,
    config.passiveUsers.total
  );

  // 4. Create channels and distribute users WITHOUT reuse
  const requiredChannels = validation.channelsNeeded;

  console.log(
    `Creating ${requiredChannels} channels with ${config.activeUsers.perChannel} active and ${config.passiveUsers.perChannel} passive users per channel (NO USER REUSE)...`
  );

  // Prepare channel creation configurations
  const channelConfigs = [];

  for (let i = 0; i < requiredChannels; i++) {
    const channelName = `channel-${i}`;

    // Select active users for this channel (NO REUSE - sequential assignment)
    const activeStartIndex = i * config.activeUsers.perChannel;
    const activeMembers = allActiveUsers.slice(
      activeStartIndex,
      activeStartIndex + config.activeUsers.perChannel
    );

    // Select passive users for this channel (NO REUSE - sequential assignment)
    const passiveStartIndex = i * config.passiveUsers.perChannel;
    const passiveMembers = allPassiveUsers.slice(
      passiveStartIndex,
      passiveStartIndex + config.passiveUsers.perChannel
    );

    // Validate that we have enough users for this channel
    if (activeMembers.length < config.activeUsers.perChannel) {
      throw new Error(
        `Insufficient active users for channel ${i}: need ${config.activeUsers.perChannel}, but only have ${activeMembers.length} available starting from index ${activeStartIndex}`
      );
    }

    if (passiveMembers.length < config.passiveUsers.perChannel) {
      throw new Error(
        `Insufficient passive users for channel ${i}: need ${config.passiveUsers.perChannel}, but only have ${passiveMembers.length} available starting from index ${passiveStartIndex}`
      );
    }

    // Combine members for this channel
    const channelMembers = [...activeMembers, ...passiveMembers].map(
      (u) => u.sui_address
    );

    // Use the first active user as the channel creator
    const creatorUser = activeMembers[0];

    // Remove the creator from initial_members since they'll be added automatically
    const membersWithoutCreator = channelMembers.filter(
      (addr) => addr !== creatorUser.sui_address
    );

    channelConfigs.push({
      channelName: channelName,
      members: membersWithoutCreator,
      creatorUser: creatorUser,
    });
  }

  // Execute channel creation in parallel batches
  console.log(
    `Starting parallel creation of ${channelConfigs.length} channels in batches...`
  );
  createChannelsInBatch(channelConfigs, 10); // Process 10 channels at a time

  console.log("Setup complete!");
  console.log(`Summary:`);
  console.log(`- Created ${channelConfigs.length} channels`);
  console.log(
    `- Distributed ${allActiveUsers.length} active users across ${Math.ceil(
      allActiveUsers.length / config.activeUsers.perChannel
    )} channels`
  );
  console.log(
    `- Distributed ${allPassiveUsers.length} passive users across ${Math.ceil(
      allPassiveUsers.length / config.passiveUsers.perChannel
    )} channels`
  );
  console.log(`- No user reuse: Each user belongs to exactly one channel`);

  return {
    activeUsers: allActiveUsers,
    passiveUsers: allPassiveUsers,
  };
}
