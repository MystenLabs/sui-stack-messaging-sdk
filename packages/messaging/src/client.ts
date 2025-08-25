import { Transaction, TransactionArgument, TransactionResult } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';
import { bcs } from '@mysten/sui/bcs';
import { SealClient } from '@mysten/seal';
import { ClientWithExtensions } from '@mysten/sui/experimental';
import { WalrusClient } from '@mysten/walrus';
import {
	_new as newChannel,
	addEncryptedKey,
	withDefaults,
	withInitialMembers,
} from './contracts/sui_messaging/channel';
import { sendMessage } from './contracts/sui_messaging/api';
import { _new as newAttachment, Attachment } from './contracts/sui_messaging/attachment';

import {
	ChannelMembershipsRequest,
	MessagingCompatibleClient,
	MessagingPackageConfig,
} from './types';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants';
import { MessagingClientError } from './error';
import { CreateChannelBuilder, CreateChannelBuilderOptions } from './flows/createChannelBuilder';
import { StorageAdapter } from "./storage/adapters/storage";
import { WalrusStorageAdapter } from "./storage/adapters/walrus/walrus";
import { EnvelopeEncryption, MessagingEncryptor } from './encryption';


export interface MessagingClientExtensionOptions {
	packageConfig?: MessagingPackageConfig;
	network?: 'mainnet' | 'testnet';
	encryptor?: (client: ClientWithExtensions<any>) => MessagingEncryptor;
	storage?: (client: ClientWithExtensions<any>) => StorageAdapter;
	signer: Signer;
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
					: (c: SealClient) => new EnvelopeEncryption({
						sealClient: c,
						suiClient: client,
						sealApproveContract: packageConfig.sealApproveContract,
						sessionKeyConfig: {
							signer: options.signer,
							ttlMin: packageConfig.sealSessionKeyTTLmins,
						}
					});

				return new MessagingClient({
					suiClient: client,
					storage,
					encryptor,
					packageConfig,
					signer: options.signer,
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
	 * 								.withDefaults()
	 * 								.withInitialMembers()
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
	 * @returns
	 */
	createChannel(initialMembers: string[]) {
		return (tx: Transaction) => {
			// Create a new channel
			const [channel, creatorCap] = tx.add(newChannel());

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

			return [channel, creatorCap];
		};
	}

	createChannelTransaction(
		signer: Signer,
		initialMembers: string[],
		transaction: Transaction = new Transaction(),
	): Transaction {
		return this.createChannelBuilder({ signer, transaction })
			.init()
			.withDefaults()
			.withInitialMembers(initialMembers)
			.build();
	}

	async executeCreateChanneltransaction({
		signer,
		initialMembers,
	}: { initialMembers: string[]; } & { signer: Signer }): Promise<{
		digest: string;
		channelID: string;
	}> {
		const createChannelTxBuilder = this.createChannelBuilder({ signer, transaction: new Transaction() });
		const createChannelFlow = createChannelTxBuilder
			.init()
			.withDefaults()
			.withInitialMembers(initialMembers);
		const createChannelCtx = createChannelFlow.context(); // TODO: this looks weird 
		const tx = createChannelFlow.build();

		// Execute the transaction
		const { digest, effects } = await this.#executeTransaction(tx, signer, 'create channel');

		// Extract the channel ID from the transaction effects
		// TODO: is there no way to get this by the specific type? (packageId::channel::Channel)
		const channelID = effects.changedObjects.find(
			(obj) => obj.idOperation === 'Created' && obj.outputOwner?.$kind === 'Shared',
		)?.id;
		if (channelID === undefined) {
			throw new MessagingClientError(
				'shared channel object id not found on the transaction effects',
			);
		}
		// TODO: is there no way to get the creatorCap that was created in the above tx by the specific type? 
		// (packageId::channel::Channel)

		// Generate and add an encrypted DEK for the channel
		const dek = await this.#encryptor(this.#suiClient).generateEncryptedChannelDEK({ channelId: channelID });
		const addDekTx = new Transaction();
		addDekTx.add(
			addEncryptedKey({
				arguments: {
					self: addDekTx.object(channelID),
					creatorCap: createChannelCtx.creatorCap,
					encryptedKeyBytes: addDekTx.pure.vector("u8", dek)
				},
			}),
		);
		await this.#executeTransaction(addDekTx, signer, 'add encrypted DEK to channel');



		return { digest, channelID };
	}

	async sendMessage(
		channelId: string,
		memberCapId: string,
		message: string,
		attachments?: Uint8Array[],
	) {
		return async (tx: Transaction) => {

			// TODO: Use Seal to generate and wrap a KEK (Key Encryption Key)
			const nonce = tx.pure(bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes());
			const messageBytes = tx.pure(
				bcs.vector(bcs.U8).serialize(new TextEncoder().encode(message)),
			);
			const channel = tx.object(channelId);
			const memberCap = tx.object(memberCapId);

			const attachmentsVec = await this.#createAttachmentsVec(tx, nonce, attachments);

			tx.add(
				sendMessage({
					package: this.#packageConfig.packageId,
					arguments: {
						self: channel,
						memberCap,
						ciphertext: messageBytes,
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
		attachments?: Uint8Array[],
	): Promise<TransactionResult> {
		const attachmentType = this.#packageConfig.packageId ?
			// todo: this needs better handling - it's needed for the integration tests
			Attachment.name.replace("@local-pkg/sui_messaging", this.#packageConfig.packageId) :
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

		const attachmentRefs = await this.#storage(this.#suiClient).upload(attachments, { storageType: 'quilts' });

		const textEncoder = new TextEncoder();
		return tx.makeMoveVec({
			type: attachmentType,
			elements: attachmentRefs.ids.map((attachment) => {
				return tx.add(
					newAttachment({
						package: this.#packageConfig.packageId,
						arguments: {
							blobRef: tx.pure.string(attachment),
							nonce,
							keyVersion: 1,
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
	): Promise<{ digest: string, messageId: string }> {

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

		if (!!waitForTransaction) {
			await this.#suiClient.core.waitForTransaction({
				digest,
			});
		}

		return { digest, effects };
	}
}
