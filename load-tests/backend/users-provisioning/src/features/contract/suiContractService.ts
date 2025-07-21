import "dotenv/config";
import { bcs } from "@mysten/sui/bcs";
import type { SuiObjectResponse } from "@mysten/sui/client";
import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  Transaction,
  type TransactionObjectArgument,
  type TransactionResult,
} from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { config } from "../../appConfig.js";
import { executeTransaction } from "../../utils.js";

// --- Move Type Definitions ---
const SUI_MESSAGING_PACKAGE_ID = config.suiContractPackageId;

const CREATOR_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::CreatorCap`;
const MEMBER_CAP_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::MemberCap`;
const CHANNEL_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::channel::Channel`;
const ROLE_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::permissions::Role`;
const ATTACHMENT_TYPE = `${SUI_MESSAGING_PACKAGE_ID}::attachment::Attachment`;

// --- Type Definitions ---
export type Attachment = {
  blobRef: string;
  wrappedDel: Uint8Array;
  nonce: Uint8Array;
  kekVersion: number;
  encryptedFilename: Uint8Array;
  encryptedMimetype: Uint8Array;
  encryptedFilesize: Uint8Array;
};

export type Message = {
  sender: string;
  ciphertext: Uint8Array;
  wrappedDek: Uint8Array;
  nonce: Uint8Array;
  kekVersion: number;
  attachments: Attachment[];
};

export type Channel = {
  id: string;
  version: number;
  rolesTableId: string;
  membersTableId: string;
  messagesTableId: string;
  messagesCount: number;
  lastMessage: Message;
  wrappedKek: Uint8Array;
  kekVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
};

/**
 * Service for handling Sui Contract interactions
 */
export class SuiContractService {
  private suiClient: SuiClient;

  constructor() {
    this.suiClient = new SuiClient({ url: config.suiFullNode });
  }

  /**
   * Creates a new channel with default settings.
   * @returns The new channel's ID and the creator capability ID.
   */
  async createChannelWithDefaults(
    senderKeypair: Ed25519Keypair,
    channelName: string,
    initialMemberAddresses?: string[]
  ): Promise<{ channelId: string; creatorCapId: string }> {
    console.log(`\n--- Creating channel "${channelName}" with defaults ---`);
    const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

    let tx = new Transaction();
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

    // add initial members
    if (!!initialMemberAddresses && initialMemberAddresses.length > 0) {
      tx = this.addInitialMembers(
        tx,
        channel,
        creator_cap,
        initialMemberAddresses
      );
    }

    tx.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::share`,
      arguments: [channel],
    });
    tx.transferObjects([creator_cap], senderAddress);

    const result = await executeTransaction(this.suiClient, tx, senderKeypair);

    const sharedObject: any = result.objectChanges?.find(
      (o: any) => o.type === "created" && o.objectType === CHANNEL_TYPE
    );
    if (!sharedObject)
      throw new Error("Channel creation did not return a shared object.");

    const creatorCapObject: any = result.objectChanges?.find(
      (o: any) => o.type === "created" && o.objectType === CREATOR_CAP_TYPE
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
  async sendMessage(
    senderKeypair: Ed25519Keypair,
    channelId: string,
    memberCapId: string,
    message: string
  ) {
    console.log(`\n--- Sending message to channel ${channelId} ---`);

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
      target: `${SUI_MESSAGING_PACKAGE_ID}::api::send_message`,
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

    await executeTransaction(this.suiClient, tx, senderKeypair);
    console.log(
      `Message "${message}" sent successfully to channel ${channelId}.`
    );
  }

  async fetchLatestChannelMemberships(
    userAddress: string,
    limit: number = 10
  ): Promise<{ memberCapId: string; channelId: string }[]> {
    const response = await this.suiClient.getOwnedObjects({
      owner: userAddress,
      filter: { StructType: MEMBER_CAP_TYPE },
      options: { showContent: true },
      limit,
    });

    const latestMemberCaps = response.data;

    if (latestMemberCaps.length === 0) {
      console.log("No channel memberships found for this user.");
      return [];
    }

    console.log(
      `Found ${latestMemberCaps.length} channel membership(s). Fetching details...`
    );

    const channelIds = latestMemberCaps.map(
      (cap: any) => cap.data.content.fields.channel_id
    );

    return latestMemberCaps.map((cap, index) => ({
      memberCapId: cap.data!.objectId,
      channelId: channelIds[index],
    }));
  }

  async fetchLatestMessagesByChannelId(
    channelId: string,
    limit: number = 10
  ): Promise<Message[]> {
    console.log(
      `Fetching latest ${limit} messages for channel ${channelId}...`
    );

    const channelObjetResponse = await this.suiClient.getObject({
      id: channelId,
      options: { showContent: true },
    });

    const messageTableId = (channelObjetResponse.data?.content as any).fields
      .messages.fields.contents.fields.id.id;

    const messages = await this.fetchLatestMessagesByTableId(
      messageTableId,
      limit
    );
    return messages;
  }

  async fetchLatestMessagesByTableId(
    messsageTableId: string,
    limit: number = 10
  ): Promise<Message[]> {
    const response = await this.suiClient.getDynamicFields({
      parentId: messsageTableId,
      limit,
    });
    const messageIds = response.data.map((field) => field.objectId);
    const messageObjectsResponse = await this.suiClient.multiGetObjects({
      ids: messageIds,
      options: { showContent: true },
    });
    return messageObjectsResponse.map((objRes: any) => {
      console.log(JSON.stringify(objRes, null, 2));
      const fields = objRes.data.content.fields.value.fields;
      return {
        sender: fields.sender,
        ciphertext: fields.ciphertext,
        wrappedDek: fields.wrapped_dek,
        nonce: fields.nonce,
        kekVersion: fields.kek_version,
        attachments: fields.attachments,
      };
    });
  }

  // --- Internal Methods ---
  private addInitialMembers(
    tx: Transaction,
    channel: TransactionObjectArgument,
    creatorCap: TransactionObjectArgument,
    addresses: string[]
  ): Transaction {
    const membersKeysArg = addresses.map((addr) => tx.pure.address(addr));
    const memberValsArg = addresses.map((addr) => tx.pure.string("Restricted"));

    const membersMap = tx.moveCall({
      target: `0x2::vec_map::from_keys_values`,
      typeArguments: ["address", "0x1::string::String"],
      arguments: [
        tx.makeMoveVec({ type: "address", elements: membersKeysArg }),
        tx.makeMoveVec({
          type: "0x1::string::String",
          elements: memberValsArg,
        }),
      ],
    });

    tx.moveCall({
      target: `${SUI_MESSAGING_PACKAGE_ID}::channel::with_initial_members`,
      arguments: [
        channel, // tx.object(channelId),
        creatorCap, // tx.object(creatorCapId),
        membersMap,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });

    return tx;
  }
}
