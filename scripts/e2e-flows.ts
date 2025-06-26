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
async function setupTestEnvironment() {
  const client = new SuiClient({ url: SUI_NODE_URL });
  const senderKeypair = new Ed25519Keypair();
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

  try {
    await requestSuiFromFaucetV2({
      host: getFaucetHost(NETWORK as "localnet" | "devnet" | "testnet"),
      recipient: senderAddress,
    });
    console.log(`Faucet funds requested for sender: ${senderAddress}`);
  } catch (error) {
    console.warn(
      `Could not request faucet funds (rate limiting may apply): ${error}`
    );
  }

  const recipientKeypair = new Ed25519Keypair();
  const recipientAddress = recipientKeypair.getPublicKey().toSuiAddress();

  return { client, senderKeypair, recipientAddress };
}

/**
 * Creates a new channel with default settings.
 * @returns The new channel's ID and the creator capability ID.
 */
async function createChannelWithDefaults(
  client: SuiClient,
  senderKeypair: Ed25519Keypair,
  channelName: string
): Promise<{ channelId: string; creatorCapId: string }> {
  console.log(`\n--- Creating channel "${channelName}" with defaults ---`);
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  const wrapped_kek = tx.pure(
    bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes()
  );

  const [channel, creator_cap, promise] = tx.moveCall({
    target: `${SUI_MESSAGING_PACKAGE_ID}::channel::new`,
    arguments: [tx.object(SUI_CLOCK_OBJECT_ID)],
  });

  tx.moveCall({
    target: `${SUI_MESSAGING_PACKAGE_ID}::channel::add_wrapped_kek`,
    arguments: [channel, creator_cap, promise, wrapped_kek],
  });

  tx.moveCall({
    target: `${SUI_MESSAGING_PACKAGE_ID}::channel::with_defaults`,
    arguments: [channel, creator_cap],
  });

  tx.moveCall({
    target: `${SUI_MESSAGING_PACKAGE_ID}::channel::share`,
    arguments: [channel],
  });
  tx.transferObjects([creator_cap], senderAddress);

  const result = await executeTransaction(client, tx, senderKeypair);

  const sharedObject: any = result.objectChanges?.find(
    (o) => o.type === "created" && o.objectType === CHANNEL_TYPE
  );
  if (!sharedObject)
    throw new Error("Channel creation did not return a shared object.");

  const creatorCapObject: any = result.objectChanges?.find(
    (o) => o.type === "created" && o.objectType === CREATOR_CAP_TYPE
  );
  if (!creatorCapObject) throw new Error("CreatorCap was not created.");

  console.log(
    `Channel "${channelName}" created successfully. Shared ID: ${sharedObject.objectId}`
  );

  return {
    channelId: sharedObject.objectId,
    creatorCapId: creatorCapObject.objectId,
  };
}

/**
 * Sends a test message to a channel.
 */
async function sendMessage(
  client: SuiClient,
  senderKeypair: Ed25519Keypair,
  channelId: string,
  memberCapId: string,
  message: string
) {
  console.log(`\n--- Sending message to channel ${channelId} ---`);
  const channelObject = await client.getObject({
    id: channelId,
    options: { showContent: true },
  });
  const kek_version = (channelObject.data?.content as any)?.fields.kek_version;

  const tx = new Transaction();
  const ciphertext = tx.pure(
    bcs.vector(bcs.U8).serialize(Buffer.from(message)).toBytes()
  );
  const wrapped_dek = tx.pure(
    bcs.vector(bcs.U8).serialize([0, 1, 0, 1]).toBytes()
  );
  const nonce = tx.pure(bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes());

  const attachmentsVec = tx.moveCall({
    target: `0x1::vector::empty`,
    typeArguments: [ATTACHMENT_TYPE],
    arguments: [],
  });

  tx.moveCall({
    target: `${SUI_MESSAGING_PACKAGE_ID}::channel::send_message`,
    arguments: [
      tx.object(channelId),
      tx.object(memberCapId),
      ciphertext,
      wrapped_dek,
      nonce,
      attachmentsVec,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });

  await executeTransaction(client, tx, senderKeypair);
  console.log(
    `Message "${message}" sent successfully to channel ${channelId}.`
  );
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

/**
 * Main orchestrator function for the end-to-end test flow.
 */
async function main() {
  console.log("--- Starting Sui Messaging E2E Test ---");

  try {
    const { client, senderKeypair } = await setupTestEnvironment();
    const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

    // Step 1: Create two separate channels
    const { channelId: channelId1 } = await createChannelWithDefaults(
      client,
      senderKeypair,
      "General Chat"
    );
    const { channelId: channelId2 } = await createChannelWithDefaults(
      client,
      senderKeypair,
      "Dev Announcements"
    );

    // Step 2: Send messages to both channels
    // First, get all member caps for the sender
    const allMemberCapsResponse = await client.getOwnedObjects({
      owner: senderAddress,
      filter: { StructType: MEMBER_CAP_TYPE },
      options: { showContent: true },
    });
    const allMemberCaps = allMemberCapsResponse.data;

    // Find the specific member cap for Channel 1 and send a message
    const memberCap1 = allMemberCaps.find(
      (cap) =>
        cap.data?.content?.dataType === "moveObject" &&
        (cap.data.content.fields as unknown as MemberCapFields)?.channel_id ===
          channelId1
    );
    if (memberCap1) {
      await sendMessage(
        client,
        senderKeypair,
        channelId1,
        memberCap1.data!.objectId,
        "Welcome to the General channel!"
      );
      await sendMessage(
        client,
        senderKeypair,
        channelId1,
        memberCap1.data!.objectId,
        "How is everyone doing today?"
      );
    } else {
      console.error(`Could not find MemberCap for Channel 1 (${channelId1})`);
    }

    // Find the specific member cap for Channel 2 and send a message
    const memberCap2 = allMemberCaps.find(
      (cap) =>
        cap.data?.content?.dataType === "moveObject" &&
        (cap.data.content.fields as unknown as MemberCapFields)?.channel_id ===
          channelId2
    );
    if (memberCap2) {
      await sendMessage(
        client,
        senderKeypair,
        channelId2,
        memberCap2.data!.objectId,
        "Release v1.2 is scheduled for next Tuesday."
      );
    } else {
      console.error(`Could not find MemberCap for Channel 2 (${channelId2})`);
    }

    // Step 3: List all messages from all channels the user is a member of
    await logAllMessagesForUserChannels(client, senderAddress);

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
