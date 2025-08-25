import { Transaction } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { SealClient } from '@mysten/seal';
import {ClientWithExtensions} from "@mysten/sui/experimental";
import {WalrusClient} from "@mysten/walrus";

import {
	_new as newChannel,
	addEncryptedKey,
	withDefaults,
	withInitialMembers,
} from './contracts/sui_messaging/channel';
import { sendMessage } from "./contracts/sui_messaging/api";
import {_new as newAttachment, Attachment} from "./contracts/sui_messaging/attachment";

import {
	ChannelMembershipsRequest,
	MessagingCompatibleClient,
	MessagingPackageConfig,
	SendMessageOptions,
} from './types';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants';
import { MessagingClientError } from './error';
import { CreateChannelBuilder, CreateChannelBuilderOptions } from './flows/createChannelBuilder';
import {StorageAdapter} from "./storage/adapters/storage";
import {WalrusStorageAdapter} from "./storage/adapters/walrus/walrus";
import { EnvelopeEncryption, MessagingEncryptor } from './encryption';


export interface MessagingClientExtensionOptions {
	packageConfig?: MessagingPackageConfig;
	network?: 'mainnet' | 'testnet';
	encryptor?: (client: ClientWithExtensions<any>) => MessagingEncryptor;
	storage?: (client: ClientWithExtensions<any>) => StorageAdapter;
}

export interface MessagingClientOptions extends MessagingClientExtensionOptions {
	suiClient: MessagingCompatibleClient;
	encryptor: (client: SealClient) => MessagingEncryptor;
	storage: (client: WalrusClient) => StorageAdapter;
}

export class MessagingClient {
	#suiClient: MessagingCompatibleClient;
	#packageConfig: MessagingPackageConfig;
	#encryptor: (client: ClientWithExtensions<any>) => MessagingEncryptor;
	#storage: (client: ClientWithExtensions<any>) => StorageAdapter;

	constructor(public options: MessagingClientOptions) {
		this.#suiClient = options.suiClient;
		this.#encryptor = options.encryptor;
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
        const sealClient = (client as any).seal;

        if (!walrusClient) {
          throw new MessagingClientError('WalrusClient extension is required for MessagingClient');
        }

        if (!sealClient) {
          throw new MessagingClientError('SealClient extension is required for MessagingClient');
        }

        let packageConfig = options.packageConfig;
        if (options.network && !packageConfig) {
          switch (options.network) {
            case 'testnet':
              packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
              break;
            case 'mainnet':
              packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
              break;
            default:
              throw new MessagingClientError(`Unsupported network: ${options.network}`);
          }
        }

        if (!packageConfig) {
          throw new MessagingClientError('Either packageConfig or network must be provided');
        }

        // Handle storage configuration
        const storage = options.storage 
          ? (c: WalrusClient) => options.storage!(c)
          : (c: WalrusClient) => new WalrusStorageAdapter(c, {
              publisher: "",
              aggregator: "",
            });

        // Handle encryptor configuration
        const encryptor = options.encryptor
          ? (c: SealClient) => options.encryptor!(c)
          : (_: SealClient) => {
              throw new MessagingClientError('Encryptor is required for MessagingClient');
            };

        return new MessagingClient({
          suiClient: client,
          storage,
          encryptor,
          packageConfig,
        });
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
	 * 								.init()
	 * 								.addEncryptedKey()
	 * 								.withDefaults()
	 * 								.withInitialMembers()
	 * 								.withInitialMessage()
	 * 								.build()
	 *
	 * ```
	 *
	 * @returns CreateChannelBuilder
	 */
	createChannelBuilder(options: CreateChannelBuilderOptions): CreateChannelBuilder {
		return new CreateChannelBuilder(options);
	}

	/**
	 *	Default
	 *
	 * @param initialMembers
	 * @param initialMessage
	 * @returns
	 */
	createChannel(initialMembers: string[], initialMessage?: string) {
		return (tx: Transaction) => {
			// Create a new channel
			const [channel, creatorCap] = tx.add(newChannel());

			// TODO: Use Seal to generate and wrap a KEK (Key Encryption Key

			const wrappedKek = tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes());
			tx.add(
				addWrappedKek({
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
					arguments: {
						self: channel,
						creatorCap,
					},
				}),
			);

			// Add initial members with default roles
			tx.add(
				withInitialMembers({
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

	async executeCreateChanneltransaction({
		signer,
		initialMembers,
		initialMessage,
	}: { initialMembers: string[]; initialMessage?: string } & { signer: Signer }): Promise<{
		digest: string;
		channelID: string;
	}> {
		const tx = this.createChannelTransaction(signer, initialMembers, initialMessage);

		// Execute the transaction
		const { digest, effects } = await this.#executeTransaction(tx, signer, 'create channel');
		const channelID = effects.changedObjects.find(
			(obj) => obj.idOperation === 'Created' && obj.outputOwner?.$kind === 'Shared',
		)?.id;
		if (channelID === undefined) {
			throw new MessagingClientError(
				'shared channel object id not found on the transaction effects',
			);
		}

		return { digest, channelID };
	}

	sendMessageTransaction({
		channelId,
		memberCapId,
		encryptedChannelKey,
		messageText,
		attachments,
	}: SendMessageOptions) {
		const textData = new TextEncoder().encode(messageText);
		const textNonce = crypto.getRandomValues(new Uint8Array(5));
		// TODO: proper encryption

		// TODO: attachments
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

		if (!!waitForTransaction) {
			await this.#suiClient.core.waitForTransaction({
				digest,
			});
		}

		return { digest, effects };
	}
}
