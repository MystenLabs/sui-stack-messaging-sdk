import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { bcs } from "@mysten/sui/bcs";
import { getFaucetHost, requestSuiFromFaucetV2 } from "@mysten/sui/faucet";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { executeTransaction } from "./utils";

// --- Configuration ---
// FIXME: Replace this with your actual deployed package ID
const SUI_MESSAGING_PACKAGE_ID =
  "0x53c1fcfaffe8ba44ad673e993ddac61d1ed376cb8526fba9b2109edc0914bbbc";
const SUI_NODE_URL = "http://127.0.0.1:9000"; // Local Sui Node
const NETWORK = "localnet";

// --- Type Definitions ---
// These type strings are derived from the Move code.
const CREATOR_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::CreatorCap`;
const MEMBER_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::MemberCap`;
const CHANNEL_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::Channel`;
const ROLE_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::permissions::Role`;
const ATTACHMENT_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::attachment::Attachment`;

/**
 * Sets up a Sui client and generates keypairs for the test.
 * It also funds the sender account from the local faucet using the new V2 API.
 * * @updated
 */
async function setupTestEnvironment() {
  const client = new SuiClient({ url: SUI_NODE_URL });
  const senderKeypair = new Ed25519Keypair();
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

  try {
    // Updated to use requestSuiFromFaucetV2 directly
    await requestSuiFromFaucetV2({
      host: getFaucetHost(NETWORK),
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
 * Finds the MemberCap for a given channel owned by a specific address.
 * This is necessary because the MemberCap is transferred to the user's account
 * and needs to be located for subsequent transactions.
 */
async function findMemberCap(
  client: SuiClient,
  owner: string,
  channelId: string
): Promise<string | null> {
  let cursor: string | null = null;
  while (true) {
    const ownedObjects = await client.getOwnedObjects({
      owner,
      filter: { StructType: MEMBER_CAP_TYPE },
      options: { showContent: true },
      cursor,
    });

    for (const obj of ownedObjects.data) {
      if (obj.data?.content?.dataType === "moveObject") {
        const fields = obj.data.content.fields as any;
        if (fields.channel_id === channelId) {
          return obj.data.objectId;
        }
      }
    }

    if (!ownedObjects.hasNextPage) {
      break;
    }
    cursor = ownedObjects.nextCursor ?? null;
  }
  return null;
}

/**
 * Main function to run the end-to-end test flow.
 */
async function main() {
  console.log("--- Starting Sui Messaging E2E Test ---");

  const { client, senderKeypair, recipientAddress } =
    await setupTestEnvironment();
  const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

  let channelId: string;
  let creatorCapId: string;

  // === Transaction 1: Create a new Channel with default configuration ===
  console.log("\n--- Step 1: Creating a new channel with defaults ---");
  try {
    const txb1 = new Transaction();
    const wrapped_kek = txb1.pure(
      bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes()
    );

    // Call channel::new
    const [channel, creator_cap, promise] = txb1.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::new`,
      arguments: [txb1.object(SUI_CLOCK_OBJECT_ID)],
    });

    // Call channel::add_wrapped_kek
    txb1.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::add_wrapped_kek`,
      arguments: [channel, creator_cap, promise, wrapped_kek],
    });

    // Call channel::with_defaults
    txb1.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::with_defaults`,
      arguments: [channel, creator_cap],
    });

    // Share the channel and transfer the CreatorCap to the sender
    txb1.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::share`,
      arguments: [channel],
    });
    txb1.transferObjects([creator_cap], senderAddress);

    const result = await executeTransaction(client, txb1, senderKeypair);

    const createdObjects = result.objectChanges?.filter(
      (o) => o.type === "created" || o.type === "mutated"
    );

    const sharedObject: any = result.objectChanges?.find(
      (o) => o.type === "created" && o.objectType === CHANNEL_TYPE
    );
    channelId = sharedObject!.objectId;

    const creatorCapObject = createdObjects?.find(
      (o) => o.objectType === CREATOR_CAP_TYPE
    );
    creatorCapId = creatorCapObject!.objectId;

    console.log(`Channel created successfully. Shared ID: ${channelId}`);
    console.log(`CreatorCap transferred to sender. ID: ${creatorCapId}`);
  } catch (error) {
    console.error("Step 1 failed!", error);
    return;
  }

  // === Transaction 2: Set initial roles ===
  console.log("\n--- Step 2: Setting initial roles ---");
  try {
    const txb2 = new Transaction();

    // We construct the VecMap on-chain as TransactionArguments cannot be nested in `pure`.
    const rolesVecMap = txb2.moveCall({
      target: `0x2::vec_map::empty`,
      typeArguments: ["0x1::string::String", ROLE_TYPE],
      arguments: [],
    });

    const allPermissions = txb2.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::permissions::all`,
      arguments: [],
    });

    const adminRole = txb2.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::permissions::new_role`,
      arguments: [allPermissions],
    });

    txb2.moveCall({
      target: `0x2::vec_map::insert`,
      typeArguments: ["0x1::string::String", ROLE_TYPE],
      arguments: [rolesVecMap, txb2.pure.string("Admin"), adminRole],
    });

    txb2.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::with_initial_roles`,
      arguments: [
        txb2.object(channelId),
        txb2.object(creatorCapId),
        rolesVecMap,
      ],
    });

    const txRes = await executeTransaction(client, txb2, senderKeypair);

    console.log('Successfully added "Admin" role to the channel.');
  } catch (error) {
    console.error("Step 2 failed!", error);
    return;
  }

  // === Transaction 3: Set initial members ===
  console.log("\n--- Step 3: Setting initial members ---");
  try {
    const txb3 = new Transaction();

    const membersVecMap = txb3.moveCall({
      target: `0x2::vec_map::empty`,
      typeArguments: ["address", "0x1::string::String"],
      arguments: [],
    });

    txb3.moveCall({
      target: `0x2::vec_map::insert`,
      typeArguments: ["address", "0x1::string::String"],
      arguments: [
        membersVecMap,
        txb3.pure.address(recipientAddress),
        txb3.pure.string("Admin"),
      ],
    });

    txb3.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::with_initial_members`,
      arguments: [
        txb3.object(channelId),
        txb3.object(creatorCapId),
        membersVecMap,
        txb3.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    const txRes = await executeTransaction(client, txb3, senderKeypair);

    console.log(
      `Successfully added recipient ${recipientAddress} as an "Admin".`
    );
  } catch (error) {
    console.error("Step 3 failed!", error);
    return;
  }

  // === Transaction 4: Send message to channel ===
  console.log("\n--- Step 4: Sending a message to the channel ---");
  try {
    const memberCapId = await findMemberCap(client, senderAddress, channelId);
    if (!memberCapId) {
      throw new Error("Could not find MemberCap for the sender.");
    }
    console.log(`Found sender's MemberCap ID: ${memberCapId}`);

    const channelObject = await client.getObject({
      id: channelId,
      options: { showContent: true },
    });
    const kek_version = (channelObject.data?.content as any)?.fields
      .kek_version;

    const txb4 = new Transaction();
    const ciphertext = txb4.pure(
      bcs.vector(bcs.U8).serialize([4, 4, 4, 4]).toBytes()
    );
    const wrapped_dek = txb4.pure(
      bcs.vector(bcs.U8).serialize([0, 1, 0, 1]).toBytes()
    );
    const nonce = txb4.pure(
      bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes()
    );

    // Create a vector for attachments
    const attachmentsVec = txb4.moveCall({
      target: `0x1::vector::empty`,
      typeArguments: [ATTACHMENT_TYPE],
      arguments: [],
    });

    // Add 2 attachments, as in the Move test
    for (let i = 0; i < 2; i++) {
      const attachment = txb4.moveCall({
        target: `${SUI_MESSAGING_PACKAGE_ID}::attachment::new`,
        arguments: [
          txb4.pure.string(i.toString()),
          txb4.pure(bcs.vector(bcs.U8).serialize([1, 2, 3, 4]).toBytes()),
          txb4.pure(bcs.vector(bcs.U8).serialize([5, 6, 7, 8]).toBytes()),
          txb4.pure.u64(kek_version),
          txb4.pure(bcs.vector(bcs.U8).serialize([9, 10, 11, 12]).toBytes()),
          txb4.pure(bcs.vector(bcs.U8).serialize([13, 14, 15, 16]).toBytes()),
          txb4.pure(bcs.vector(bcs.U8).serialize([17, 18, 19, 20]).toBytes()),
        ],
      });

      txb4.moveCall({
        target: `0x1::vector::push_back`,
        typeArguments: [ATTACHMENT_TYPE],
        arguments: [attachmentsVec, attachment],
      });
    }

    txb4.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::send_message`,
      arguments: [
        txb4.object(channelId),
        txb4.object(memberCapId),
        ciphertext,
        wrapped_dek,
        nonce,
        attachmentsVec,
        txb4.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    await executeTransaction(client, txb4, senderKeypair);
    console.log("Message sent successfully.");
  } catch (error) {
    console.error("Step 4 failed!", error);
    return;
  }

  console.log("\n--- Sui Messaging E2E Test Completed Successfully ---");
}

main().catch((error) => {
  console.error("Test script encountered an unhandled error:", error);
  process.exit(1);
});
