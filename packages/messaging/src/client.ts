import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { SealClient } from '@mysten/seal';
import { ClientWithExtensions } from '@mysten/sui/experimental';
import { WalrusClient } from '@mysten/walrus';

import {
	_new as newChannel,
	addEncryptedKey,
	share as shareChannel,
	withDefaults,
	withInitialMembers,
	Channel,
	CreatorCap,
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
import { StorageAdapter } from './storage/adapters/storage';
import { WalrusStorageAdapter } from './storage/adapters/walrus/walrus';
import {
	CreateChannelFlow,
	CreateChannelFlowBuildOpts,
	CreateChannelFlowGenerateAndSealKeyOpts,
	EncryptedSymmetricKey,
	EnvelopeEncryption,
	MessagingEncryptor,
} from './encryption';
import { EncryptionKey } from './contracts/sui_messaging/encryption_key';
import { InferBcsType } from '@mysten/bcs';

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
	// TODO: Replace with an LRU cache with a max size
	#encryptedChannelDEKCache: Map<string, EncryptedSymmetricKey> = new Map(); // channelId --> EncryptedSymmetricKey
	#channelObjectCache: Map<string, InferBcsType<typeof Channel>> = new Map(); // channelId --> Channel
	#creatorCapObjectCache: Map<string, InferBcsType<typeof CreatorCap>> = new Map(); // channelId --> CreatorCap

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
					: (c: WalrusClient) =>
							new WalrusStorageAdapter(c, {
								publisher: '',
								aggregator: '',
							});

				// Handle encryptor configuration
				const encryptor = options.encryptor
					? (c: SealClient) => options.encryptor!(c)
					: (c: SealClient) =>
							new EnvelopeEncryption({
								sealClient: c,
								suiClient: client,
								sealApproveContract: packageConfig.sealApproveContract,
								sessionKeyConfig: {
									signer: options.signer,
									ttlMin: packageConfig.sealSessionKeyTTLmins,
								},
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
	}: { initialMembers: string[] } & { signer: Signer }): Promise<{
		digest: string;
		channelID: string;
	}> {
		const createChannelTxBuilder = this.createChannelBuilder({
			signer,
			transaction: new Transaction(),
		});
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
		const dek = await this.#encryptor(this.#suiClient).generateEncryptedChannelDEK({
			channelId: channelID,
		});
		const addDekTx = new Transaction();
		addDekTx.add(
			addEncryptedKey({
				arguments: {
					self: addDekTx.object(channelID),
					creatorCap: createChannelCtx.creatorCap,
					encryptedKeyBytes: addDekTx.pure.vector('u8', dek),
				},
			}),
		);
		await this.#executeTransaction(addDekTx, signer, 'add encrypted DEK to channel');

		return { digest, channelID };
	}

	createChannelFlow(): CreateChannelFlow {
		const build = ({
			creatorAddress,
			useDefaults = true,
			initialMemberAddresses = [],
		}: CreateChannelFlowBuildOpts) => {
			const tx = new Transaction();
			const [channel, creatorCap] = tx.add(newChannel());

			if (useDefaults) {
				tx.add(
					withDefaults({
						arguments: { self: channel, creatorCap },
					}),
				);
			}

			if (initialMemberAddresses.length > 0) {
				tx.add(
					withInitialMembers({
						arguments: { self: channel, creatorCap, initialMembers: initialMemberAddresses },
					}),
				);
			}
			// Finalize by sharing the channel and transferring the creator cap
			tx.add(shareChannel({ arguments: { self: channel, creatorCap } }));
			tx.transferObjects([creatorCap], creatorAddress);

			return tx;
		};

		const generateAndSealKey = async ({ digest }: CreateChannelFlowGenerateAndSealKeyOpts) => {
			const createdChannelId = await this.#getCreatedChannelId(digest);
			const sealedKey = await this.#encryptor(this.#suiClient).generateEncryptedChannelDEK({
				channelId: createdChannelId,
			});
		};
	}

	async sendMessage(
		channelId: string,
		memberCapId: string,
		sender: string,
		message: string,
		attachments?: File[],
	) {
		return async (tx: Transaction) => {
			const channel = tx.object(channelId);
			const memberCap = tx.object(memberCapId);
			const encryptedKey = await this.#getEncryptedChannelDEK(channelId);

			// Encrypt the message text
			const encryptor = this.#encryptor(this.#suiClient);
			const { encryptedBytes: ciphertext, nonce: textNonce } = await encryptor.encryptText({
				text: message,
				channelId,
				sender,
				memberCapId,
				encryptedKey,
			});

			// Encrypt and upload attachments
			const attachmentsVec = await this.#createAttachmentsVec(
				tx,
				channelId,
				memberCapId,
				sender,
				attachments,
			);

			tx.add(
				sendMessage({
					package: this.#packageConfig.packageId,
					arguments: {
						self: channel,
						memberCap,
						ciphertext: tx.pure.vector('u8', ciphertext),
						nonce: tx.pure.vector('u8', textNonce),
						attachments: attachmentsVec,
					},
				}),
			);
		};
	}

	async #createAttachmentsVec(
		tx: Transaction,
		channelId: string,
		memberCapId: string,
		sender: string,
		attachments?: File[],
	): Promise<TransactionResult> {
		const attachmentType = this.#packageConfig.packageId
			? // todo: this needs better handling - it's needed for the integration tests
				Attachment.name.replace('@local-pkg/sui_messaging', this.#packageConfig.packageId)
			: Attachment.name;

		if (!attachments || attachments.length === 0) {
			return tx.moveCall({
				package: '0x1',
				module: 'vector',
				function: 'empty',
				arguments: [],
				typeArguments: [attachmentType],
			});
		}

		const encryptor = this.#encryptor(this.#suiClient);
		const encryptedKey = await this.#getEncryptedChannelDEK(channelId);

		// 1. Encrypt all attachment data in parallel
		const encryptedDataPayloads = await Promise.all(
			attachments.map(async (file) => {
				return encryptor.encryptAttachmentData({
					file,
					channelId,
					memberCapId,
					encryptedKey,
					sender,
				});
			}),
		);

		// 2. Upload encrypted data to storage in parallel
		const attachmentRefs = await this.#storage(this.#suiClient).upload(
			encryptedDataPayloads.map((p) => p.encryptedBytes),
			{ storageType: 'quilts' },
		);

		// 3. Encrypt all metadata in parallel
		const encryptedMetadataPayloads = await Promise.all(
			attachments.map((file) => {
				return encryptor.encryptAttachmentMetadata({
					file,
					channelId,
					memberCapId,
					encryptedKey,
					sender,
				});
			}),
		);

		// 4. Build the move vector for the transaction
		return tx.makeMoveVec({
			type: attachmentType,
			elements: attachmentRefs.ids.map((blobRef, i) => {
				const dataNonce = encryptedDataPayloads[i].nonce;
				const metadata = encryptedMetadataPayloads[i];
				const metadataNonce = metadata.nonce;
				return tx.add(
					newAttachment({
						package: this.#packageConfig.packageId,
						arguments: {
							blobRef: tx.pure.string(blobRef),
							encryptedMetadata: tx.pure.vector('u8', metadata.encryptedBytes),
							dataNonce: tx.pure.vector('u8', dataNonce),
							metadataNonce: tx.pure.vector('u8', metadataNonce),
							keyVersion: tx.pure('u32', encryptedKey.version),
						},
					}),
				);
			}),
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
		attachments?: File[];
	} & { signer: Signer }): Promise<{ digest: string; messageId: string }> {
		const tx = new Transaction();
		const sendMessageTxBuilder = await this.sendMessage(
			channelId,
			memberCapId,
			signer.toSuiAddress(),
			message,
			attachments,
		);
		await sendMessageTxBuilder(tx);
		const { digest, effects } = await this.#executeTransaction(tx, signer, 'send message');

		const messageId = effects.changedObjects.find((obj) => obj.idOperation === 'Created')?.id;
		if (messageId === undefined) {
			throw new MessagingClientError('Message id not found on the transaction effects');
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

	async #getEncryptedChannelDEK(channelId: string): Promise<EncryptedSymmetricKey> {
		// Check cache first
		const cachedKey = this.#encryptedChannelDEKCache.get(channelId);
		if (cachedKey) {
			return cachedKey;
		}

		// The type of the dynamic field's key
		const keyType = `${this.#packageConfig.packageId}::channel::EncryptionDEKKey`;

		// The key's value, BCS-serialized. For a struct with no fields, this is an empty Uint8Array.
		const keyValue = new Uint8Array([]);

		// Fetch the latest channel key from chain
		const dekFieldID = await deriveDynamicFieldID(channelId, keyType, keyValue);
		const dekObjectRes = await this.#suiClient.core.getObject({
			objectId: dekFieldID,
		});
		// Extract the encrypted DEK bytes and version from the object
		const dekObjectBytes = await dekObjectRes.object.content;
		const dekObject = EncryptionKey.parse(dekObjectBytes);
		const encryptedKey: EncryptedSymmetricKey = {
			$kind: 'Encrypted',
			encryptedBytes: new Uint8Array(dekObject.encrypted_key_bytes),
			version: dekObject.version,
		};

		this.#encryptedChannelDEKCache.set(channelId, encryptedKey);
		return encryptedKey;
	}

	async #getCreatedChannelId(digest: string): Promise<string> {
		const {
			transaction: { effects },
		} = await this.#suiClient.core.waitForTransaction({ digest });

		const createdChannelObjectIds = effects?.changedObjects
			.filter((obj) => obj.idOperation === 'Created' && obj.inputOwner?.$kind === 'Shared') // input or output Owner?
			.map((obj) => obj.id);

		if (createdChannelObjectIds.length !== 1) {
			throw new MessagingClientError(
				`Only one shared object should be found in transaction effects for transaction (${digest})`,
			);
		}
		return createdChannelObjectIds[0];
	}

	// async #getChannelAndCreatorCap(digest: string) {
	// 	const {
	// 		transaction: { effects },
	// 	} = await this.#suiClient.core.waitForTransaction({ digest });

	// 	const createdChannelObjectIds = effects?.changedObjects
	// 		.filter((obj) => obj.idOperation === 'Created' && obj.inputOwner?.$kind === 'Shared') // input or output Owner?
	// 		.map((obj) => obj.id);

	// 	if (createdChannelObjectIds.length !== 1) {
	// 		throw new MessagingClientError(
	// 			`Only one shared object should be found in transaction effects for transaction (${digest})`,
	// 		);
	// 	}
	// 	const channelId = createdChannelObjectIds[0];

	// 	const createdCreatorCapObjectIds = effects?.changedObjects
	// 		.filter((obj) => obj.idOperation === 'Created' && obj.inputOwner?.$kind === 'AddressOwner') // input or output Owner?
	// 		.map((obj) => obj.id);

	// 	if (createdCreatorCapObjectIds.length !== 1) {
	// 		throw new MessagingClientError(
	// 			`Only one addressOwned object should be found in transaction effects for transaction (${digest})`,
	// 		);
	// 	}
	// 	const creatorCapId = createdCreatorCapObjectIds[0];

	// 	const createdObjects = await this.#suiClient.core.getObjects({
	// 		objectIds: [channelId, creatorCapId],
	// 	});
	// 	const channelObject = createdObjects.objects.find(
	// 		(obj) => !(obj instanceof Error) && obj.type === `${this.#packageConfig}::channel::Channel`,
	// 	);
	// 	if (channelObject instanceof Error || !channelObject) {
	// 		throw new MessagingClientError(
	// 			`Channel object not found in transaction effects for transaction (${digest})`,
	// 		);
	// 	}
	// 	const creatorCapObject = createdObjects.objects.find(
	// 		(obj) =>
	// 			!(obj instanceof Error) && obj.type === `${this.#packageConfig}::channel::CreatorCap`,
	// 	);

	// 	if (creatorCapObject instanceof Error || !creatorCapObject) {
	// 		throw new MessagingClientError(
	// 			`CreatorCap object not found in transaction effects for transaction (${digest})`,
	// 		);
	// 	}

	// 	return {
	// 		channel: Channel.parse(await channelObject.content),
	// 		creatorCap: CreatorCap.parse(await creatorCapObject.content),
	// 	};
	// }
}
