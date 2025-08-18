import {Transaction, TransactionArgument, TransactionResult} from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';

import {
  _new as newChannel,
  addWrappedKek,
  withDefaults,
  withInitialMembers,
  withInitialMessage,
} from './contracts/sui_messaging/channel';
import { sendMessage } from "./contracts/sui_messaging/api";
import {_new as newAttachment, Attachment} from "./contracts/sui_messaging/attachment";

import {
  ChannelMembershipsRequest,
  MessagingCompatibleClient,
  MessagingPackageConfig,
} from './types';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants';
import { MessagingClientError } from './error';
import { CreateChannelBuilder, CreateChannelBuilderOptions } from './flows/createChannelBuilder';
import {StorageAdapter} from "./storage/adapters/storage";
import {WalrusStorageAdapter} from "./storage/adapters/walrus/walrus";
import {ClientWithExtensions} from "@mysten/sui/experimental";
import {WalrusClient} from "@mysten/walrus";

export interface MessagingClientExtensionOptions {
  packageConfig?: MessagingPackageConfig;
  network?: 'mainnet' | 'testnet';
  storage?: (client: ClientWithExtensions<any>) => StorageAdapter;
}

export interface MessagingClientOptions extends MessagingClientExtensionOptions {
  suiClient: MessagingCompatibleClient;
  storage: (client: WalrusClient) => StorageAdapter;
}

export class MessagingClient {
  #suiClient: MessagingCompatibleClient;
  #packageConfig: MessagingPackageConfig;
  #storage: (client: ClientWithExtensions<any>) => StorageAdapter;

  constructor(public options: MessagingClientOptions) {
    this.#suiClient = options.suiClient;
    this.#storage = options.storage;

    if (options.network && !options.packageConfig) {
      const network = options.network;
      switch (network) {
        case 'testnet':
          this.#packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
          break;
        case 'mainnet':
          this.#packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
          break;
        default:
          throw new MessagingClientError(`Unsupported network: ${network}`);
      }
    } else {
      this.#packageConfig = options.packageConfig!;
    }
  }

  static experimental_asClientExtension(options: MessagingClientExtensionOptions) {
    return {
      name: 'messaging' as const,
      register: (client: MessagingCompatibleClient) => {
        const walrusClient = (client as any).walrus;

        if (options.storage && walrusClient) {
          return new MessagingClient({
            suiClient: client,
            storage: (c) => options.storage!(c),
            ...options,
          });
        } else if (walrusClient) {
          return new MessagingClient({
            suiClient: client,
            storage: (c) => new WalrusStorageAdapter(c, {
              publisher: "",
              aggregator: "",
            }),
            ...options,
          });
        } else {
          // Fallback if no walrus client
          throw new Error("WalrusClient extension is required for MessagingClient");
        }
      },
    };
  }

  // ===== Read Path =====

  async fetchChannelMemberships(request: ChannelMembershipsRequest) {
    return this.#suiClient.core.getOwnedObjects({
      ...request,
      type: this.#packageConfig.memberCapType,
    });
  }

  // ===== Write Path =====

  /**
   * @usage
   * ```
   * const flow = client.createChannelBuilder(signer);
   * const createChannelTx = flow
   *                        .init()
   *                        .addEncryptedKey()
   *                        .withDefaults()
   *                        .withInitialMembers()
   *                        .withInitialMessage()
   *                        .build()
   * ```
   *
   * @returns CreateChannelBuilder
   */
  createChannelBuilder(options: CreateChannelBuilderOptions): CreateChannelBuilder {
    options.packageId = options.packageId ?? this.#packageConfig.packageId;
    return new CreateChannelBuilder(options);
  }

  /**
   *  Default
   *
   * @param initialMembers
   * @param initialMessage
   * @returns
   */
  createChannel(initialMembers: string[], initialMessage?: string) {
    return (tx: Transaction) => {
      // Create a new channel
      const [channel, creatorCap] = tx.add(newChannel());

      // TODO: Use Seal to generate and wrap a KEK (Key Encryption Key)

      const wrappedKek = tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes());
      tx.add(
        addWrappedKek({
          package: this.#packageConfig.packageId,
          arguments: {
            self: channel,
            creatorCap,
            wrappedKek,
          },
        }),
      );

      // Use defaults
      tx.add(
        withDefaults({
          package: this.#packageConfig.packageId,
          arguments: {
            self: channel,
            creatorCap,
          },
        }),
      );

      // Add initial members with default roles
      tx.add(
        withInitialMembers({
          package: this.#packageConfig.packageId,
          arguments: {
            self: channel,
            creatorCap,
            initialMembers,
          },
        }),
      );

      // Add initial message if provided
      if (initialMessage) {
        const messageBytes = tx.pure(
          bcs.vector(bcs.U8).serialize(new TextEncoder().encode(initialMessage)),
        );
        const nonce = tx.pure(bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes());
        tx.add(
          withInitialMessage({
            package: this.#packageConfig.packageId,
            arguments: {
              self: channel,
              creatorCap,
              ciphertext: messageBytes,
              wrappedDek: wrappedKek,
              nonce,
            },
          }),
        );
      }

      return [channel, creatorCap];
    };
  }

  createChannelTransaction(
    signer: Signer,
    initialMembers: string[],
    initialMessage?: string,
    transaction: Transaction = new Transaction(),
  ): Transaction {
    return this.createChannelBuilder({ signer, transaction })
      .init()
      .addEncryptedKey()
      .withDefaults()
      .withInitialMembers(initialMembers)
      .withInitialMessage(initialMessage ?? '')
      .build();
  }

  async executeCreateChannelTransaction({
    signer,
    initialMembers,
    initialMessage,
  }: { initialMembers: string[]; initialMessage?: string } & { signer: Signer }): Promise<{
    digest: string;
    channelId: string;
  }> {
    const tx = this.createChannelTransaction(signer, initialMembers, initialMessage);

    // Execute the transaction
    const { digest, effects } = await this.#executeTransaction(tx, signer, 'create channel');
    const channelId = effects.changedObjects.find(
      (obj) => obj.idOperation === 'Created' && obj.outputOwner?.$kind === 'Shared',
    )?.id;
    if (channelId === undefined) {
      throw new MessagingClientError(
        'shared channel object id not found on the transaction effects',
      );
    }

    return { digest, channelId };
  }

  async sendMessage(
    channelId: string,
    memberCapId: string,
    message: string,
    attachments?: Uint8Array[],
  ) {
    return async (tx: Transaction) => {

      // TODO: Use Seal to generate and wrap a KEK (Key Encryption Key)
      const wrappedDek = tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes());
      const nonce = tx.pure(bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes());
      const messageBytes = tx.pure(
        bcs.vector(bcs.U8).serialize(new TextEncoder().encode(message)),
      );
      const channel = tx.object(channelId);
      const memberCap = tx.object(memberCapId);

      const attachmentsVec = await this.#createAttachmentsVec(tx, nonce, wrappedDek, attachments);

      tx.add(
        sendMessage({
          package: this.#packageConfig.packageId,
          arguments: {
            self: channel,
            memberCap,
            ciphertext: messageBytes,
            wrappedDek,
            nonce,
            attachments: attachmentsVec,
          }
        })
      );
    };
  }

  async #createAttachmentsVec(
    tx: Transaction,
    nonce: TransactionArgument,
    wrappedDek: TransactionArgument,
    attachments?: Uint8Array[],
  ): Promise<TransactionResult> {
    const attachmentType = this.#packageConfig.packageId ?
      // todo: this needs better handling - it's needed for the integration tests
      Attachment.name.replace("@local-pkg/sui_messaging", this.#packageConfig.packageId):
      Attachment.name;

    if (!attachments || attachments.length === 0) {
      return tx.moveCall({
        package: '0x1',
        module: 'vector',
        function: 'empty',
        arguments: [],
        typeArguments: [attachmentType],
      });
    }

    const attachmentRefs = await this.#storage(this.#suiClient).upload(attachments, {storageType: 'quilts'});

    const textEncoder = new TextEncoder();
    return tx.makeMoveVec({
      type: attachmentType,
      elements: attachmentRefs.ids.map((attachment) => {
        return tx.add(
          newAttachment({
            package: this.#packageConfig.packageId,
            arguments: {
              blobRef: tx.pure.string(attachment),
              wrappedDek,
              nonce,
              kekVersion: 1,
              encryptedFilename: tx.pure(bcs.vector(bcs.U8).serialize(textEncoder.encode("1"))),
              encryptedMimetype: tx.pure(bcs.vector(bcs.U8).serialize(textEncoder.encode("2"))),
              encryptedFilesize: tx.pure(bcs.vector(bcs.U8).serialize(textEncoder.encode("3"))),
            }
          })
        );
      })
    });
  }

  async executeSendMessageTransaction({
      signer,
      channelId,
      memberCapId,
      message,
      attachments,
    }: {
      channelId: string;
      memberCapId: string;
      message: string;
      attachments?: Uint8Array[]
    } & { signer: Signer }
  ): Promise<{digest: string, messageId: string}> {

    const tx = new Transaction();
    const sendMessageTxBuilder =
      await this.sendMessage(channelId, memberCapId, message, attachments);
    await sendMessageTxBuilder(tx);
    const { digest, effects } = await this.#executeTransaction(tx, signer, 'send message');

    const messageId = effects.changedObjects.find(
      (obj) => obj.idOperation === 'Created',
    )?.id;
    if (messageId === undefined) {
      throw new MessagingClientError(
        'shared channel object id not found on the transaction effects',
      );
    }

    return { digest, messageId };
  }

  // ===== Private Methods =====
  async #executeTransaction(
    transaction: Transaction,
    signer: Signer,
    action: string,
    waitForTransaction: boolean = true,
  ) {
    transaction.setSenderIfNotSet(signer.toSuiAddress());

    const { digest, effects } = await signer.signAndExecuteTransaction({
      transaction,
      client: this.#suiClient,
    });

    if (effects?.status.error) {
      throw new MessagingClientError(`Failed to ${action} (${digest}): ${effects?.status.error}`);
    }

    if (waitForTransaction) {
      await this.#suiClient.core.waitForTransaction({
        digest,
      });
    }

    return { digest, effects };
  }
}
