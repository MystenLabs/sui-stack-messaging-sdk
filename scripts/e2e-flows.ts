import "dotenv/config";
import {
  SuiClient,
  SuiObjectData,
  SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { executeTransaction } from "./utils";
import { channel } from "diagnostics_channel";
import {
  createChannelWithDefaults,
  fetchLatestChannelMemberships,
  fetchLatestMessagesByChannelId,
  sendMessage,
} from "./contract_api";

// --- Configuration ---
const SUI_MESSAGING_PACKAGE_ID = process.env.PACKAGE_ID;
const SUI_NODE_URL = process.env.SUI_NODE_URL || "http://127.0.0.1:9000";
const NETWORK = process.env.NETWORK || "localnet";

// Validate that the required environment variables are set
if (!SUI_MESSAGING_PACKAGE_ID) {
  throw new Error(
    "PACKAGE_ID is not set in your .env file. Please run the `publish.sh` script first."
  );
}

if (NETWORK !== "localnet" && NETWORK !== "devnet" && NETWORK !== "testnet") {
  throw new Error("Wrong Network type");
}

// --- Type Definitions ---
const CREATOR_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::CreatorCap`;
const MEMBER_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::MemberCap`;
const CHANNEL_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::Channel`;
const ROLE_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::permissions::Role`;
const ATTACHMENT_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::attachment::Attachment`;

// --- Interfaces for Type Safety ---
interface MemberCapFields {
  id: { id: string };
  channel_id: string;
}

interface Message {
  id: { id: string };
  name: string;
  value: {
    type: string;
    fields: MessageFields;
  };
}

interface MessageFields {
  ciphertext: number[];
  sender: string;
  // other message fields can be added here if needed
}

interface ChannelFields {
  id: { id: string };
  messages: {
    fields: {
      contents: {
        fields: {
          id: { id: string };
          size: string;
        };
      };
    };
  };
  last_message: { fields: MessageFields } | null;
}

/**
 * Sets up a Sui client and generates keypairs for the test.
 */
async function setupTestEnvironment(
  channels_count: number,
  senders_count: number,
  lurkers_count: number
): Promise<{
  client: SuiClient;
  channels: {
    senders: Ed25519Keypair[];
    lurkers: Ed25519Keypair[];
  }[];
}> {
  const client = new SuiClient({ url: SUI_NODE_URL });

  let channels = [];

  for (let i = 0; i < channels_count; i++) {
    let senderKeypairs: Ed25519Keypair[] = [];
    for (let i = 0; i < senders_count; i++) {
      let senderKeypair = new Ed25519Keypair();
      let senderAddress = senderKeypair.getPublicKey().toSuiAddress();
      senderKeypairs.push(senderKeypair);
      try {
        await requestSuiFromFaucetV2({
          host: getFaucetHost(NETWORK as "localnet" | "devnet" | "testnet"),
          recipient: senderAddress,
        });
        console.log(`Faucet funds requested for sender: ${senderAddress}`);
        if (NETWORK === "localnet") {
          // wait 1 sec
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.warn(
          `Could not request faucet funds (rate limiting may apply): ${error}`
        );
      }
    }

    let lurkerKeypairs: Ed25519Keypair[] = [];
    for (let i = 0; i < senders_count; i++) {
      let lurkerKeypair = new Ed25519Keypair();
      lurkerKeypairs.push(lurkerKeypair);
    }

    channels.push({ senders: senderKeypairs, lurkers: lurkerKeypairs });
  }

  return { client, channels };
}

/**
 * Fetches all messages from a channel's TableVec.
 */
async function fetchAllMessages(
  client: SuiClient,
  channelFields: ChannelFields
) {
  const messageTableId = channelFields.messages.fields.contents.fields.id.id;

  const messages = [];
  let cursor: string | null = null;
  while (true) {
    const response = await client.getDynamicFields({
      parentId: messageTableId,
      cursor,
    });

    const messageIds = response.data.map((field) => field.objectId);
    if (messageIds.length > 0) {
      const messageObjects = await client.multiGetObjects({
        ids: messageIds,
        options: { showContent: true },
      });
      messages.push(...messageObjects.map((obj) => obj.data?.content));
    }

    if (!response.hasNextPage) break;
    cursor = response.nextCursor;
  }
  return messages.filter(Boolean); // Filter out any null/undefined results
}

/**
 * Finds all channel memberships for a user and logs all messages for each channel.
 */
async function logAllMessagesForUserChannels(
  client: SuiClient,
  userAddress: string
) {
  console.log(
    `\n--- Fetching all channel memberships and messages for user: ${userAddress} ---`
  );

  const memberCaps = [];
  let cursor: string | null = null;
  while (true) {
    const response = await client.getOwnedObjects({
      owner: userAddress,
      filter: { StructType: MEMBER_CAP_TYPE },
      options: { showContent: true },
      cursor,
    });
    memberCaps.push(...response.data);
    if (!response.hasNextPage) break;
    cursor = response.nextCursor ?? null;
  }

  if (memberCaps.length === 0) {
    console.log("No channel memberships found for this user.");
    return;
  }

  console.log(
    `Found ${memberCaps.length} channel membership(s). Fetching details...`
  );

  const channelIds = [
    ...new Set(
      memberCaps
        .map((cap) =>
          cap.data?.content?.dataType === "moveObject"
            ? (cap.data.content.fields as unknown as MemberCapFields)
                ?.channel_id
            : undefined
        )
        .filter((id): id is string => !!id)
    ),
  ];
  if (channelIds.length === 0) {
    console.log("Could not extract channel IDs from memberships.");
    return;
  }

  const channelObjects = await client.multiGetObjects({
    ids: channelIds,
    options: { showContent: true },
  });

  for (const channelObject of channelObjects) {
    if (channelObject.error) {
      console.error(
        `- Error fetching channel: ${JSON.stringify(channelObject.error)}`
      );
      continue;
    }

    const content = channelObject.data?.content;
    if (content?.dataType !== "moveObject") continue;

    const fields = content.fields as unknown as ChannelFields;
    const channelId = fields.id.id;

    console.log(`\n- Channel [${channelId}]:`);
    const messages = await fetchAllMessages(client, fields);

    if (messages.length > 0) {
      for (const message of messages) {
        // @ts-expect-error(FIXME: Add proper Types)
        const { sender, ciphertext } = message.fields.value.fields;
        const decodedMessage = Buffer.from(ciphertext).toString("utf-8");
        console.log(`  └─ From ${sender}: "${decodedMessage}"`);
      }
    } else {
      console.log(`  └─ No messages yet.`);
    }
  }
}

async function one_to_one_flow() {
  const { client, channels } = await setupTestEnvironment(1, 2, 0);
  const senderKeypair = channels[0].senders[0];
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();
  const recipientKeypair = channels[0].senders[1];
  const recipientAddress = recipientKeypair.getPublicKey().toSuiAddress();

  // Step 1: Create 1-2-1 channel
  const { channelId } = await createChannelWithDefaults(
    client,
    senderKeypair,
    "General Chat",
    [recipientAddress]
  );

  // Step 2: Send messages
  // 2.1: Fetch latest channels for sender
  const latestChannels = await fetchLatestChannelMemberships(
    client,
    senderAddress
  );
  // 2.2: Find the channel ID for the created channel
  const channel = latestChannels.find((c) => c.channelId === channelId);
  if (!channel) {
    console.error(
      `Channel with ID ${channelId} not found in latest channels for sender ${senderAddress}.`
    );
    return;
  }
  // 2.3: Send a message
  const memberCapId = channel.memberCapId;
  const message = `Hello from ${senderAddress} to ${recipientAddress}!`;
  await sendMessage(client, senderKeypair, channelId, memberCapId, message);

  // Step 3: fetch messages for recipient
  // 3.1: Fetch latest channels for recipient
  const recipientChannels = await fetchLatestChannelMemberships(
    client,
    recipientAddress
  );
  // 3.2: Find the channel ID for the created channel
  const recipientChannel = recipientChannels.find(
    (c) => c.channelId === channelId
  );
  if (!recipientChannel) {
    console.error(
      `Channel with ID ${channelId} not found in latest channels for recipient ${recipientAddress}.`
    );
    return;
  }
  // 3.3: Fetch all messages for the recipient's channel
  const messages = await fetchLatestMessagesByChannelId(
    client,
    recipientChannel.channelId
  );

  // 3.4: Assert the sent message is fetched
  if (messages.length === 0) {
    console.error(
      `No messages found in channel ${channelId} for recipient ${recipientAddress}.`
    );
    return;
  }
  const sentMessage = messages.find((msg) => {
    const { sender, ciphertext } = msg;
    const decodedMessage = Buffer.from(ciphertext).toString("utf-8");
    return sender === senderAddress && decodedMessage === message;
  });

  // 3.5: Log the received message
  if (!sentMessage) {
    console.error(
      `Sent message "${message}" not found in channel ${channelId} for recipient ${recipientAddress}.`
    );
    return;
  }
  const { sender, ciphertext } = sentMessage;
  const decodedMessage = Buffer.from(ciphertext).toString("utf-8");

  console.log(
    `Message "${decodedMessage}" successfully received from ${senderAddress} to ${recipientAddress} in channel ${channelId}.`
  );
}

async function multi_channels(
  channels_count: number,
  active_members_per_channel: number,
  lurkers_per_channel: number
) {
  const { client, channels } = await setupTestEnvironment(
    channels_count,
    active_members_per_channel,
    lurkers_per_channel
  );

  // Create channels and add some initial members
  let channelIds: string[] = [];
  let creatorCapIds: string[] = [];
  for (const channel of channels) {
    // use first active member as the creator
    const { channelId, creatorCapId } = await createChannelWithDefaults(
      client,
      channel.senders[0],
      `General Chat`,
      channel.senders
        .slice(1)
        .concat(channel.lurkers)
        .map((keypair) => keypair.getPublicKey().toSuiAddress())
    );

    channelIds.push(channelId);
    creatorCapIds.push(creatorCapId);
  }

  // Simulate active members sending messages to a channel they are a part of
  // Do each channel in parallel, but each active member in sequence
  await Promise.all(
    channelIds.map(async (channelId, index) => {
      const activeMembers = channels[index].senders;
      const lurkers = channels[index].lurkers;

      for (const member of activeMembers) {
        const memberCapResponse = await client.getOwnedObjects({
          owner: member.getPublicKey().toSuiAddress(),
          filter: { StructType: MEMBER_CAP_TYPE },
          options: { showContent: true },
        });
        const memberCap = memberCapResponse.data.find(
          (cap) =>
            cap.data?.content?.dataType === "moveObject" &&
            (cap.data.content.fields as unknown as MemberCapFields)
              .channel_id === channelId
        );

        if (memberCap) {
          await sendMessage(
            client,
            member,
            channelId,
            memberCap.data!.objectId,
            `Hello from ${member.getPublicKey().toSuiAddress()}!`
          );
        } else {
          console.error(
            `MemberCap not found for ${member
              .getPublicKey()
              .toSuiAddress()} in channel ${channelId}`
          );
        }
      }

      // Lurkers will not send messages, but we can log their presence
      console.log(
        `Lurkers in channel ${channelId}: ${lurkers
          .map((l) => l.getPublicKey().toSuiAddress())
          .join(", ")}`
      );
    })
  );
}

/**
 * Main orchestrator function for the end-to-end test flow.
 */
async function main() {
  console.log("--- Starting Sui Messaging E2E Test ---");

  await one_to_one_flow();

  // await multi_channels(10, 2, 8);

  try {
    console.log("\n--- Sui Messaging E2E Test Completed Successfully ---");
  } catch (error) {
    console.error(
      "\n--- Test script encountered an unhandled error: ---",
      error
    );
    process.exit(1);
  }
}

main();
