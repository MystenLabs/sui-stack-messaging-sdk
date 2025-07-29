import "dotenv/config";
import { bcs } from "@mysten/sui/bcs";
import type { GasCostSummary, SuiObjectResponse } from "@mysten/sui/client";
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
  lastMessage: Message | null;
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
  public lastDuration: number = 0;
  public lastGasCost: number = 0;

  constructor(suiClient: SuiClient) {
    this.suiClient = suiClient;
  }

  private async measure<T>(promise: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await promise();
    this.lastDuration = Date.now() - start;
    return result;
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
    return this.measure(async () => {
      // console.log(`\n--- Creating channel "${channelName}" with defaults ---`);
      const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

      let tx = new Transaction();
      const wrapped_kek = tx.pure(
        bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes()
      );

      const [channel, creator_cap] = tx.moveCall({
        target: `${SUI_MESSAGING_PACKAGE_ID}::channel::new`,
        arguments: [tx.object(SUI_CLOCK_OBJECT_ID)],
      });

      tx.moveCall({
        target: `${SUI_MESSAGING_PACKAGE_ID}::channel::add_wrapped_kek`,
        arguments: [channel, creator_cap, wrapped_kek],
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

      const result = await executeTransaction(
        this.suiClient,
        tx,
        senderKeypair
      );

      const sharedObject: any = result.objectChanges?.find(
        (o: any) => o.type === "created" && o.objectType === CHANNEL_TYPE
      );
      if (!sharedObject)
        throw new Error("Channel creation did not return a shared object.");

      const creatorCapObject: any = result.objectChanges?.find(
        (o: any) => o.type === "created" && o.objectType === CREATOR_CAP_TYPE
      );
      if (!creatorCapObject) throw new Error("CreatorCap was not created.");

      // console.log(
      // `Channel "${channelName}" created successfully. Shared ID: ${sharedObject.objectId}`
      // );

      // Set gas cost
      this.lastGasCost = result.effects
        ? this.calculateGasCost(result.effects.gasUsed)
        : 0;

      return {
        channelId: sharedObject.objectId,
        creatorCapId: creatorCapObject.objectId,
      };
    });
  }

  /**
   * Sends a test message to a channel.
   */
  async sendMessage(
    senderKeypair: Ed25519Keypair,
    channelId: string,
    memberCapId: string,
    message: string,
    maxRetries: number = 2
  ) {
    return this.measure(async () => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const tx = new Transaction();
          const ciphertext = tx.pure(
            bcs.vector(bcs.U8).serialize(Buffer.from(message)).toBytes()
          );
          const wrapped_dek = tx.pure(
            bcs.vector(bcs.U8).serialize([0, 1, 0, 1]).toBytes()
          );
          const nonce = tx.pure(
            bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes()
          );

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

          const result = await executeTransaction(
            this.suiClient,
            tx,
            senderKeypair
          );

          this.lastGasCost = result.effects
            ? this.calculateGasCost(result.effects.gasUsed)
            : 0;

          return; // Success
        } catch (error: any) {
          lastError = error;

          // Check if it's a version conflict error
          if (
            error.message?.includes("not available for consumption") ||
            error.message?.includes("Could not find the referenced object")
          ) {
            if (attempt < maxRetries - 1) {
              // Wait before retry with exponential backoff
              await new Promise((resolve) =>
                setTimeout(resolve, Math.pow(2, attempt) * 100)
              );
              continue;
            }
          }

          throw error;
        }
      }

      throw lastError || new Error("Max retries exceeded");
    });
  }

  /**
   * Fetches a channel object by its ID.
   * @param channelId The ID of the channel to fetch
   * @returns The channel object with all its metadata
   */
  async fetchChannelById(channelId: string): Promise<Channel> {
    return this.measure(async () => {
      // console.log(`Fetching channel object for ${channelId}...`);

      const channelObjectResponse = await this.suiClient.getObject({
        id: channelId,
        options: { showContent: true },
      });

      if (!channelObjectResponse.data?.content) {
        throw new Error(`Channel ${channelId} not found`);
      }

      const fields = (channelObjectResponse.data.content as any).fields;

      // Extract messages table ID from the nested structure
      const messageTableId = fields.messages.fields.contents.fields.id.id;

      return {
        id: channelId,
        version: fields.version,
        rolesTableId: fields.roles.fields.contents.fields.id.id,
        membersTableId: fields.members.fields.contents.fields.id.id,
        messagesTableId: messageTableId,
        messagesCount: fields.messages_count,
        lastMessage: fields.last_message || null,
        wrappedKek: fields.wrapped_kek,
        kekVersion: fields.kek_version,
        createdAtMs: fields.created_at_ms,
        updatedAtMs: fields.updated_at_ms,
      };
    });
  }

  async fetchChannelObjects(channelIds: string[]): Promise<Channel[]> {
    // console.log(`Fetching channel objects for IDs: ${channelIds.join(", ")}`);
    const response = await this.suiClient.multiGetObjects({
      ids: channelIds,
      options: { showContent: true },
    });

    const channelObjects: Channel[] = response.map((channelObjRes) => {
      if (channelObjRes.error) {
        console.error(
          `- Error fetching channel: ${JSON.stringify(channelObjRes.error)}`
        );
      }

      // TODO: proper typescript
      const content = channelObjRes.data?.content as unknown as any;
      const fields = content.fields;
      const id = fields.id.id;
      const version = fields.version;
      const rolesTableId = fields.roles.fields.id.id;
      const membersTableId = fields.members.fields.id.id;
      const messagesTableId = fields.messages.fields.contents.fields.id.id;
      const messagesCount = fields.messages_count;
      const lastMessage = fields.last_message
        ? fields.last_message.fields
        : null;
      const wrappedKek = fields.wrapped_kek;
      const kekVersion = fields.kek_version;
      const createdAtMs = fields.created_at_ms;
      const updatedAtMs = fields.updated_at_ms;

      return {
        id,
        version,
        rolesTableId,
        membersTableId,
        messagesTableId,
        messagesCount,
        lastMessage,
        wrappedKek,
        kekVersion,
        createdAtMs,
        updatedAtMs,
      };
    });
    return channelObjects;
  }

  /**
   * Fetches channel memberships with enhanced channel metadata.
   * @param userAddress The user's address
   * @param limit Maximum number of memberships to return
   * @returns Array of memberships with channel metadata
   */
  async fetchLatestChannelMembershipsWithMetadata(
    userAddress: string,
    limit: number = 10
  ): Promise<{ memberCapId: string; channelId: string; channel: Channel }[]> {
    return this.measure(async () => {
      const memberships = await this.fetchLatestChannelMemberships(
        userAddress,
        limit
      );

      // Fetch channel objects for each membership
      const channels = await this.fetchChannelObjects(
        memberships.map((membership) => membership.channelId)
      );

      const membershipsWithMetadata = memberships.map((membership) => ({
        ...membership,
        channel: channels.find(
          (channel) => channel.id === membership.channelId
        )!,
      }));
      return membershipsWithMetadata;
    });
  }

  async fetchLatestChannelMemberships(
    userAddress: string,
    limit: number = 10
  ): Promise<{ memberCapId: string; channelId: string }[]> {
    return this.measure(async () => {
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

      // console.log(
      // `Found ${latestMemberCaps.length} channel membership(s). Fetching details...`
      // );

      // const channelIds = latestMemberCaps.map(
      //   (cap: any) => cap.data.content.fields.channel_id
      // );

      return latestMemberCaps.map((cap, index) => ({
        memberCapId: cap.data!.objectId,
        channelId: (cap.data!.content! as unknown as any).fields!.channel_id,
      }));
    });
  }

  async fetchLatestMessagesByChannelId(
    channelId: string,
    limit: number = 10
  ): Promise<Message[]> {
    return this.measure(async () => {
      // console.log(
      // `Fetching latest ${limit} messages for channel ${channelId}...`
      // );

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
    });
  }

  async fetchLatestMessagesByTableId(
    messsageTableId: string,
    limit: number = 10
  ): Promise<Message[]> {
    return this.measure(async () => {
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

  private calculateGasCost(gasUsed: GasCostSummary): number {
    return (
      parseInt(gasUsed.computationCost) +
      parseInt(gasUsed.storageCost) -
      parseInt(gasUsed.storageRebate)
    );
  }
}
