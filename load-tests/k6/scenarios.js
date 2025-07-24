import { check, group, sleep } from "k6";
import http from "k6/http";
import {
  randomIntBetween,
  randomItem,
} from "https://jslib.k6.io/k6-utils/1.2.0/index.js";

import { config } from "./config.js";
import { metrics, recordMetric } from "./metrics.js";
import { parseDurationAsMs } from "./utils.js";

function fetchChannelMemberships(userAddress) {
  const url = `${config.provisioningApiUrl}/contract/channel/memberships/${userAddress}?limit=10`;
  const res = http.get(url);
  recordMetric(
    res,
    metrics.fetchChannelMemberships_latency,
    metrics.errorRate_fetchMemberships
  );
  if (res.status !== 200) {
    console.error(`Failed to fetch memberships for ${userAddress}:`, res.body);
    return [];
  }
  return JSON.parse(res.body).memberships;
}

function fetchChannelMembershipsWithMetadata(userAddress) {
  const url = `${config.provisioningApiUrl}/contract/channel/memberships/${userAddress}/with-metadata?limit=10`;
  const res = http.get(url);
  recordMetric(
    res,
    metrics.fetchChannelMembershipsWithMetadata_latency,
    metrics.errorRate_fetchMembershipsWithMetadata
  );
  if (res.status !== 200) {
    console.error(
      `Failed to fetch memberships with metadata for ${userAddress}:`,
      res.body
    );
    return [];
  }
  return JSON.parse(res.body).memberships;
}

function sendMessage(secretKey, channelId, memberCapId, message) {
  const url = `${config.provisioningApiUrl}/contract/channel/message`;
  const payload = JSON.stringify({
    secret_key: secretKey,
    channel_id: channelId,
    member_cap_id: memberCapId,
    message: message,
  });

  const params = { headers: { "Content-Type": "application/json" } };
  let res = http.post(url, payload, params);

  recordMetric(res, metrics.sendMessage_latency, metrics.errorRate_sendMessage);
  // Gas cost metrics
  if (res.headers["X-Gas-Cost"] && res.headers["X-Gas-Cost"] !== "0") {
    metrics.sendMessage_gas.add(parseFloat(res.headers["X-Gas-Cost"]));
  }
}

function fetchChannelMessages(channelId) {
  const url = `${config.provisioningApiUrl}/contract/channel/${channelId}/messages?limit=10`;
  const res = http.get(url);
  recordMetric(
    res,
    metrics.fetchChannelMessages_latency,
    metrics.errorRate_fetchMessages
  );
  if (res.status !== 200) {
    console.error(
      `Failed to fetch messages for channel ${channelId}:`,
      res.body
    );
    return [];
  }
  return JSON.parse(res.body).messages;
}

function fetchChannelMessagesByTableId(tableId) {
  const url = `${config.provisioningApiUrl}/contract/messages/table/${tableId}?limit=10`;
  const res = http.get(url);
  recordMetric(
    res,
    metrics.fetchChannelMessagesByTableId_latency,
    metrics.errorRate_fetchMessagesByTableId
  );
  if (res.status !== 200) {
    console.error(`Failed to fetch messages for table ${tableId}:`, res.body);
    return [];
  }
  return JSON.parse(res.body).messages;
}

export function activeUserWorkflow(data) {
  // Use modulo to cycle through available users if there are more VUs than users
  const userIndex = (__VU - 1) % data.activeUsers.length;
  const user = data.activeUsers[userIndex];

  let channelId = null;
  let memberCapId = null;

  const memberships = fetchChannelMemberships(user.sui_address);
  if (memberships.length === 0) {
    console.log(`User ${user.sui_address} has no channels to message.`);
    return;
  }

  // Select random channel to fetch messages from
  const randomMembership = randomItem(memberships);

  channelId = randomMembership.channelId;
  memberCapId = randomMembership.memberCapId;

  const sessionStart = Date.now();
  let messagesSent = 0;
  while (Date.now() - sessionStart < parseDurationAsMs(config.duration)) {
    sendMessage(
      user.secret_key,
      channelId,
      memberCapId,
      `Hello from ${user.sui_address}`
    );
    messagesSent++;
    // sleep(
    //   randomIntBetween(
    //     config.activeUsers.thinkTimeSecMin,
    //     config.activeUsers.thinkTimeSecMax
    //   )
    // );
    sleep(config.passiveUsers.pollingInterval);
  }
  console.log(`User ${user.sui_address} sent ${messagesSent} messages`);
}

export function passiveUserWorkflow(data) {
  // For passive users, we need to account for the fact that VUs are numbered starting from 1
  // and we want to assign passive users to VUs that come after active users
  const passiveUserIndex = (__VU - 1) % data.passiveUsers.length;
  const user = data.passiveUsers[passiveUserIndex];

  let tableId = null;

  const memberships = fetchChannelMembershipsWithMetadata(user.sui_address);
  if (memberships.length === 0) {
    console.log(
      `User ${user.sui_address} has no channels to fetch messages from.`
    );
    return;
  }

  // Select random channel to fetch messages from
  const randomMembership = randomItem(memberships);
  if (!randomMembership.channel || !randomMembership.channel.messagesTableId) {
    console.error(
      `User ${user.sui_address} has no channel to fetch messages from.`
    );
    return;
  }

  tableId = randomMembership.channel.messagesTableId;

  // Poll for new messages
  const sessionStart = Date.now();
  let pollCount = 0;
  while (Date.now() - sessionStart < parseDurationAsMs(config.duration)) {
    const messages = fetchChannelMessagesByTableId(tableId); // TODO: proper cursor based pagination
    pollCount++;
    sleep(config.passiveUsers.pollingInterval);
  }
}
