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
	CreatorCap,
	transferMemberCap,
	transferMemberCaps,
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
import { StorageAdapter } from './storage/adapters/storage';
import { WalrusStorageAdapter } from './storage/adapters/walrus/walrus';
import { EncryptedSymmetricKey, EnvelopeEncryption, MessagingEncryptor } from './encryption';

import { EncryptionKey } from './contracts/sui_messaging/encryption_key';
import { RawTransactionArgument } from './contracts/utils';

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

// Create Channel Flow interfaces
export interface CreateChannelFlowOpts {
	creatorAddress: string;
	initialMemberAddresses?: string[];
}

export interface CreateChannelFlowGenerateAndAttachEncryptionKeyOpts {
	digest: string; // Transaction digest from the channel creation transaction
}

export interface CreateChannelFlowGetGeneratedCreatorCapOpts {
	digest: string; // Transaction digest from the channel creation transaction
}

export interface CreateChannelFlow {
	build: () => Transaction;
	getGeneratedCreatorCap: (
		opts: CreateChannelFlowGetGeneratedCreatorCapOpts,
	) => Promise<(typeof CreatorCap)['$inferType']>;
	generateAndAttachEncryptiondKey: (
		opts: CreateChannelFlowGenerateAndAttachEncryptionKeyOpts,
	) => Promise<Transaction>;
	getGeneratedEncryptionKey: () => {
		channelId: string;
		encryptedKeyBytes: Uint8Array<ArrayBuffer>;
	};
}

export class MessagingClient {
	#suiClient: MessagingCompatibleClient;
	#packageConfig: MessagingPackageConfig;
	#encryptor: (client: ClientWithExtensions<any>) => MessagingEncryptor;
	#storage: (client: ClientWithExtensions<any>) => StorageAdapter;
	// TODO: Leave the responsibility of caching to the caller
	#encryptedChannelDEKCache: Map<string, EncryptedSymmetricKey> = new Map(); // channelId --> EncryptedSymmetricKey

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
				// TODO: figure out the Types, so we avoid the use of any
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
	 * const flow = client.createChannelFlow();
	 *
	 * // Step-by-step execution
	 * const tx = flow.build({ creatorAddress: signer.toSuiAddress(), initialMemberAddresses: ['0x...'] });
	 * const { digest } = await signer.signAndExecuteTransaction({ transaction: tx, client: suiClient });
	 * const { channelId, creatorCapId, encryptedKeyBytes } = await flow.generateEncryptedKey({ digest });
	 * const attachKeyTx = flow.attachKey({});
	 * const { digest: finalDigest } = await signer.signAndExecuteTransaction({ transaction: attachKeyTx, client: suiClient });
	 * ```
	 *
	 * @returns CreateChannelFlow
	 */
	createChannelFlow({
		creatorAddress,
		initialMemberAddresses,
	}: CreateChannelFlowOpts): CreateChannelFlow {
		const build = () => {
			const tx = new Transaction();
			const [channel, creatorCap, creatorMemberCap] = tx.add(newChannel());

			// Apply defaults
			tx.add(
				withDefaults({
					arguments: { self: channel, creatorCap },
				}),
			);

			// Add initial members if provided
			let memberCaps: RawTransactionArgument<string> | null = null;
			if (initialMemberAddresses && initialMemberAddresses.length > 0) {
				memberCaps = tx.add(
					withInitialMembers({
						arguments: {
							self: channel,
							creatorCap,
							initialMembers: tx.pure.vector('address', initialMemberAddresses),
						},
					}),
				);
			}

			// Share the channel and transfer creator cap
			tx.add(shareChannel({ arguments: { self: channel, creatorCap } }));
			// Transfer MemberCaps
			tx.add(
				transferMemberCap({ arguments: { cap: creatorMemberCap, recipient: creatorAddress } }),
			);
			if (memberCaps !== null) {
				tx.add(transferMemberCaps({ arguments: { memberCapsMap: memberCaps } }));
			}

			return tx;
		};

		const getGeneratedCreatorCap = async ({
			digest,
		}: CreateChannelFlowGetGeneratedCreatorCapOpts) => {
			return { creatorCap: await this.#getCreatedCreatorCap(digest) };
		};

		const generateAndAttachEncryptionKey = async ({
			creatorCap,
		}: Awaited<ReturnType<typeof getGeneratedCreatorCap>>) => {
			// Generate the encrypted channel DEK
			const encryptedKeyBytes = await this.#encryptor(this.#suiClient).generateEncryptedChannelDEK({
				channelId: creatorCap.channel_id,
			});

			const tx = new Transaction();

			tx.add(
				addEncryptedKey({
					arguments: {
						self: tx.object(creatorCap.channel_id),
						creatorCap: tx.object(creatorCap.id.id),
						encryptedKeyBytes: tx.pure.vector('u8', encryptedKeyBytes),
					},
				}),
			);

			return {
				transaction: tx,
				creatorCap,
				encryptedKeyBytes,
			};
		};

		const getGeneratedEncryptionKey = ({
			creatorCap,
			encryptedKeyBytes,
		}: Awaited<ReturnType<typeof generateAndAttachEncryptionKey>>) => {
			return { channelId: creatorCap.channel_id, encryptedKeyBytes };
		};

		const stepResults: {
			build?: ReturnType<typeof build>;
			getGeneratedCreatorCap?: Awaited<ReturnType<typeof getGeneratedCreatorCap>>;
			generateAndAttachEncryptionKey?: Awaited<ReturnType<typeof generateAndAttachEncryptionKey>>;
			getGeneratedEncryptionKey?: never;
		} = {};

		function getResults<T extends keyof typeof stepResults>(
			step: T,
			current: keyof typeof stepResults,
		): NonNullable<(typeof stepResults)[T]> {
			if (!stepResults[step]) {
				throw new Error(`${String(step)} must be executed before calling ${String(current)}`);
			}
			return stepResults[step]!;
		}

		return {
			build: () => {
				if (!stepResults.build) {
					stepResults.build = build();
				}
				return stepResults.build;
			},
			getGeneratedCreatorCap: async (opts: CreateChannelFlowGetGeneratedCreatorCapOpts) => {
				getResults('build', 'getGeneratedCreatorCap');
				stepResults.getGeneratedCreatorCap = await getGeneratedCreatorCap(opts);
				return stepResults.getGeneratedCreatorCap.creatorCap;
			},
			generateAndAttachEncryptiondKey: async () => {
				stepResults.generateAndAttachEncryptionKey = await generateAndAttachEncryptionKey(
					getResults('getGeneratedCreatorCap', 'generateAndAttachEncryptionKey'),
				);
				return stepResults.generateAndAttachEncryptionKey.transaction;
			},
			getGeneratedEncryptionKey: () => {
				return getGeneratedEncryptionKey(
					getResults('generateAndAttachEncryptionKey', 'getGeneratedEncryptionKey'),
				);
			},
		};
	}

	async sendMessage(
		channelId: string,
		memberCapId: string,
		sender: string,
		message: string,
		attachments?: File[],
		encryptedSymmetricKey?: EncryptedSymmetricKey,
	) {
		return async (tx: Transaction) => {
			const channel = tx.object(channelId);
			const memberCap = tx.object(memberCapId);
			const encryptedKey = encryptedSymmetricKey ?? (await this.#getEncryptedChannelDEK(channelId));

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
				encryptedKey,
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
		encryptedKey: EncryptedSymmetricKey,
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

	async #getCreatedCreatorCap(digest: string) {
		const creatorCapType = `${this.#packageConfig.packageId}::channel::CreatorCap`;

		const {
			transaction: { effects },
		} = await this.#suiClient.core.waitForTransaction({
			digest,
		});

		const createdObjectIds = effects?.changedObjects
			.filter((object) => object.idOperation === 'Created')
			.map((object) => object.id);

		const createdObjects = await this.#suiClient.core.getObjects({
			objectIds: createdObjectIds,
		});

		const suiCreatorCapObject = createdObjects.objects.find(
			(object) => !(object instanceof Error) && object.type === creatorCapType,
		);

		if (suiCreatorCapObject instanceof Error || !suiCreatorCapObject) {
			throw new MessagingClientError(
				`CreatorCap object not found in transaction effects for transaction (${digest})`,
			);
		}

		return CreatorCap.parse(await suiCreatorCapObject.content);
	}
}
