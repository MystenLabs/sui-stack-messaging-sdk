import { Transaction, TransactionResult } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import { ClientWithExtensions, Experimental_SuiClientTypes } from '@mysten/sui/experimental';
import { WalrusClient } from '@mysten/walrus';

import {
	_new as newChannel,
	addEncryptedKey,
	share as shareChannel,
	sendMessage,
	addMembers,
	Channel,
} from './contracts/sui_messaging/channel';

import { _new as newAttachment, Attachment } from './contracts/sui_messaging/attachment';

import {
	ChannelMembershipsRequest,
	ChannelMembershipsResponse,
	ChannelMessagesEncryptedRequest,
	ChannelMessagesEncryptedResponse,
	ChannelObjectsByMembershipsResponse,
	CreateChannelFlow,
	CreateChannelFlowGetGeneratedCapsOpts,
	CreateChannelFlowOpts,
	GetLatestMessagesRequest,
	GetPreviousMessagesRequest,
	MessagesCursor,
	MessagesResponse,
	MessagingClientExtensionOptions,
	MessagingClientOptions,
	MessagingCompatibleClient,
	MessagingPackageConfig,
	ParsedChannelObject,
	ParsedMessageObject,
	DecryptMessageResult,
	LazyDecryptAttachmentResult,
} from './types';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants';
import { MessagingClientError } from './error';
import { StorageAdapter } from './storage/adapters/storage';
import { WalrusStorageAdapter } from './storage/adapters/walrus/walrus';
import { EncryptedSymmetricKey, EnvelopeEncryption } from './encryption';

import { RawTransactionArgument } from './contracts/utils';
import {
	CreatorCap,
	transferToSender as transferCreatorCap,
} from './contracts/sui_messaging/creator_cap';
import {
	MemberCap,
	transferMemberCaps,
	transferToRecipient as transferMemberCap,
} from './contracts/sui_messaging/member_cap';
import { none as noneConfig } from './contracts/sui_messaging/config';
import { Message } from './contracts/sui_messaging/message';

export class MessagingClient {
	#suiClient: MessagingCompatibleClient;
	#packageConfig: MessagingPackageConfig;
	#storage: (client: MessagingCompatibleClient) => StorageAdapter;
	#envelopeEncryption: EnvelopeEncryption;
	// TODO: Leave the responsibility of caching to the caller
	// #encryptedChannelDEKCache: Map<string, EncryptedSymmetricKey> = new Map(); // channelId --> EncryptedSymmetricKey
	// #channelMessagesTableIdCache: Map<string, string> = new Map<string, string>(); // channelId --> messagesTableId

	private constructor(public options: MessagingClientOptions) {
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

		// Initialize EnvelopeEncryption directly
		this.#envelopeEncryption = new EnvelopeEncryption({
			suiClient: this.#suiClient,
			sealApproveContract: this.#packageConfig.sealApproveContract,
			sessionKey: options.sessionKey,
			sessionKeyConfig: options.sessionKeyConfig,
		});
	}

	static experimental_asClientExtension(options: MessagingClientExtensionOptions) {
		return {
			name: 'messaging' as const,
			register: (client: MessagingCompatibleClient) => {
				const sealClient = client.seal;

				if (!sealClient) {
					throw new MessagingClientError('SealClient extension is required for MessagingClient');
				}

				// Check if walrus is required but not available
				if (!options.storage && !client.walrus) {
					throw new MessagingClientError(
						'WalrusClient extension is required for the default StorageAdapter implementation of MessagingClient. Please provide a custom storage adapter or extend the client with the WalrusClient extension.',
					);
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
					? (c: MessagingCompatibleClient) => options.storage!(c)
					: (c: MessagingCompatibleClient) => {
							if (!c.walrus) {
								throw new MessagingClientError(
									'WalrusClient extension is required for default storage adapter',
								);
							}
							// Type assertion is safe here because we've checked c.walrus exists
							return new WalrusStorageAdapter(c as ClientWithExtensions<{ walrus: WalrusClient }>, {
								publisher: 'https://publisher.walrus-testnet.walrus.space',
								aggregator: 'https://aggregator.walrus-testnet.walrus.space',
								epochs: 1,
							});
						};

				return new MessagingClient({
					suiClient: client,
					storage,
					packageConfig,
					sessionKey: 'sessionKey' in options ? options.sessionKey : undefined,
					sessionKeyConfig: 'sessionKeyConfig' in options ? options.sessionKeyConfig : undefined,
				});
			},
		};
	}

	// ===== Read Path =====

	// Returns the channel memberships for a given user
	// in the form of a map of MemberCap ID -> Channel ID
	async getChannelMemberships(
		request: ChannelMembershipsRequest,
	): Promise<ChannelMembershipsResponse> {
		const memberCapsRes = await this.#suiClient.core.getOwnedObjects({
			...request,
			type: MemberCap.name.replace('@local-pkg/sui-messaging', this.#packageConfig.packageId),
		});
		// parse MemberCaps
		const memberships = await Promise.all(
			memberCapsRes.objects.map(async (object) => {
				if (object instanceof Error || !object.content) {
					throw new MessagingClientError(`Failed to parse MemberCap object: ${object}`);
				}
				const parsedMemberCap = MemberCap.parse(await object.content);
				return { member_cap_id: parsedMemberCap.id.id, channel_id: parsedMemberCap.channel_id };
			}),
		);

		return {
			hasNextPage: memberCapsRes.hasNextPage,
			cursor: memberCapsRes.cursor,
			memberships,
		};
	}

	// Returns the channel objects for a given user
	async getChannelObjectsByAddress(
		request: ChannelMembershipsRequest,
	): Promise<ChannelObjectsByMembershipsResponse> {
		const membershipsPaginated = await this.getChannelMemberships(request);
		const channelObjects = await this.getChannelObjectsByChannelIds(
			membershipsPaginated.memberships.map((m) => m.channel_id),
		);

		return {
			hasNextPage: membershipsPaginated.hasNextPage,
			cursor: membershipsPaginated.cursor,
			channelObjects,
		};
	}

	async getChannelObjectsByChannelIds(channelIds: string[]): Promise<ParsedChannelObject[]> {
		const channelObjectsRes = await this.#suiClient.core.getObjects({
			objectIds: channelIds,
		});
		return await Promise.all(
			channelObjectsRes.objects.map(async (object) => {
				if (object instanceof Error || !object.content) {
					throw new MessagingClientError(`Failed to parse Channel object: ${object}`);
				}
				return Channel.parse(await object.content);
			}),
		);
	}

	// Decrypts a message
	// Requires the channelId, memberCapId, and the encryptedKey of the Channel
	// Note: Lazily downloads and decrypts attachments data(returns an array of promises that you can await)
	async decryptMessage(
		message: (typeof Message)['$inferType'],
		channelId: string,
		memberCapId: string,
		encryptedKey: EncryptedSymmetricKey,
	): Promise<DecryptMessageResult> {
		// 1. Decrypt text
		const text = await this.#envelopeEncryption.decryptText({
			encryptedBytes: new Uint8Array(message.ciphertext),
			nonce: new Uint8Array(message.nonce),
			sender: message.sender,
			channelId,
			memberCapId,
			encryptedKey,
		});

		// 2. If no attachments, return early
		if (!message.attachments || message.attachments.length === 0) {
			return { text, attachments: [] };
		}

		// 3. Decrypt attachments metadata
		const attachmentsMetadata = await Promise.all(
			message.attachments.map(async (attachment) => {
				// Use the encrypted_metadata field directly - no download needed for metadata
				const metadata = await this.#envelopeEncryption.decryptAttachmentMetadata({
					encryptedBytes: new Uint8Array(attachment.encrypted_metadata),
					nonce: new Uint8Array(attachment.metadata_nonce),
					channelId,
					sender: message.sender,
					encryptedKey,
					memberCapId,
				});

				return {
					metadata,
					attachment, // Keep reference to original attachment
				};
			}),
		);

		// 4. Create lazy-loaded attachmentsData
		const lazyAttachmentsDataPromises: LazyDecryptAttachmentResult[] = attachmentsMetadata.map(
			({ metadata, attachment }) => ({
				...metadata,
				data: this.#createLazyAttachmentDataPromise({
					blobRef: attachment.blob_ref,
					nonce: new Uint8Array(attachment.data_nonce),
					channelId,
					sender: message.sender,
					encryptedKey,
					memberCapId,
				}),
			}),
		);

		return {
			text,
			attachments: lazyAttachmentsDataPromises,
		};
	}

	/**
	 * Get new messages since the last cursor
	 * Perfect for polling-based real-time updates
	 */
	async getLatestMessages({
		channelId,
		cursor,
		limit = 50,
	}: GetLatestMessagesRequest): Promise<MessagesResponse> {
		// 1. Get current channel state
		const channelObjects = await this.getChannelObjectsByChannelIds([channelId]);
		const messagesTableId = channelObjects[0].messages.contents.id.id;
		const currentMessagesCount = BigInt(channelObjects[0].messages_count);

		let startIndex: bigint;
		let endIndex: bigint;
		let newMessagesSinceLastCursor = BigInt(0);

		if (!cursor) {
			// First time - get the latest messages
			startIndex =
				currentMessagesCount > BigInt(limit) ? currentMessagesCount - BigInt(limit) : BigInt(0);
			endIndex = currentMessagesCount;
		} else {
			// Get messages since last cursor
			newMessagesSinceLastCursor = currentMessagesCount - cursor.messagesCountAtTime;

			if (newMessagesSinceLastCursor === BigInt(0)) {
				// No new messages
				return {
					messages: [],
					hasNextPage: cursor.fetchedRange.startIndex > BigInt(0),
					cursor: cursor, // return same cursor
				};
			}

			// Fetch new messages (from the end of our previous range to current end)
			startIndex = cursor.fetchedRange.endIndex;
			endIndex = currentMessagesCount;

			// Handle limit overflow gracefully
			if (newMessagesSinceLastCursor > BigInt(limit)) {
				// More new messages than limit - fetch the most recent ones
				startIndex = currentMessagesCount - BigInt(limit);
				console.warn('More new messages than limit - fetching the most recent ones');
			}
		}

		// 2. Derive message IDs and fetch the Message objects
		const messageIds = this.#deriveMessageIDsFromRange(messagesTableId, startIndex, endIndex);
		const messageObjects = await this.#suiClient.core.getObjects({ objectIds: messageIds });
		const messages = await this.#parseMessageObjects(messageObjects);

		// 3. Create new cursor
		const newCursor: MessagesCursor = {
			messagesCountAtTime: currentMessagesCount,
			fetchedRange: {
				startIndex: startIndex,
				endIndex: endIndex,
			},
			createdAt: Date.now(),
		};

		return {
			messages,
			hasNextPage: startIndex > BigInt(0),
			cursor: newCursor,
		};
	}

	/**
	 * Get older messages before the current cursor
	 * For "load more" functionality
	 */
	async getPreviousMessages({
		channelId,
		cursor,
		limit = 50,
	}: GetPreviousMessagesRequest): Promise<MessagesResponse> {
		// 1. Get current channel state (for metadata)
		const channelObjects = await this.getChannelObjectsByChannelIds([channelId]);
		const messagesTableId = channelObjects[0].messages.contents.id.id;
		const currentMessagesCount = BigInt(channelObjects[0].messages_count);

		// 2. Calculate range for older messages
		const endIndex = cursor.fetchedRange.startIndex;
		const startIndex = endIndex > BigInt(limit) ? endIndex - BigInt(limit) : BigInt(0);

		// 3. Generate and fetch message IDs
		const messageIds = this.#deriveMessageIDsFromRange(messagesTableId, startIndex, endIndex);
		const messageObjects = await this.#suiClient.core.getObjects({ objectIds: messageIds });
		const messages = await this.#parseMessageObjects(messageObjects);

		// 4. Create new cursor (extending the fetched range backward)
		const newCursor: MessagesCursor = {
			messagesCountAtTime: currentMessagesCount,
			fetchedRange: {
				startIndex: startIndex,
				endIndex: cursor.fetchedRange.endIndex, // Keep the original end
			},
			createdAt: Date.now(),
		};

		return {
			messages,
			hasNextPage: startIndex > BigInt(0),
			cursor: newCursor,
		};
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
			const config = tx.add(noneConfig());
			const [channel, creatorCap, creatorMemberCap] = tx.add(newChannel({ arguments: { config } }));

			// Add initial members if provided
			let memberCaps: RawTransactionArgument<string> | null = null;
			if (initialMemberAddresses && initialMemberAddresses.length > 0) {
				memberCaps = tx.add(
					addMembers({
						arguments: {
							self: channel,
							memberCap: creatorMemberCap,
							n: initialMemberAddresses.length,
						},
					}),
				);
			}

			// Share the channel and transfer creator cap
			tx.add(shareChannel({ arguments: { self: channel, creatorCap } }));
			// Transfer MemberCaps
			tx.add(
				transferMemberCap({
					arguments: { cap: creatorMemberCap, creatorCap, recipient: creatorAddress },
				}),
			);
			if (memberCaps !== null) {
				tx.add(
					transferMemberCaps({
						arguments: {
							memberAddresses: tx.pure.vector('address', initialMemberAddresses!),
							memberCaps,
							creatorCap,
						},
					}),
				);
			}

			tx.add(transferCreatorCap({ arguments: { self: creatorCap } }));

			return tx;
		};

		const getGeneratedCaps = async ({ digest }: CreateChannelFlowGetGeneratedCapsOpts) => {
			return await this.#getGeneratedCaps(digest);
		};

		const generateAndAttachEncryptionKey = async ({
			creatorCap,
			creatorMemberCap,
		}: Awaited<ReturnType<typeof getGeneratedCaps>>) => {
			// Generate the encrypted channel DEK
			const encryptedKeyBytes = await this.#envelopeEncryption.generateEncryptedChannelDEK({
				channelId: creatorCap.channel_id,
			});

			const tx = new Transaction();

			tx.add(
				addEncryptedKey({
					arguments: {
						self: tx.object(creatorCap.channel_id),
						memberCap: tx.object(creatorMemberCap.id.id),
						newEncryptionKeyBytes: tx.pure.vector('u8', encryptedKeyBytes),
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
			getGeneratedCaps?: Awaited<ReturnType<typeof getGeneratedCaps>>;
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
			getGeneratedCaps: async (opts: CreateChannelFlowGetGeneratedCapsOpts) => {
				getResults('build', 'getGeneratedCaps');
				stepResults.getGeneratedCaps = await getGeneratedCaps(opts);
				return stepResults.getGeneratedCaps;
			},
			generateAndAttachEncryptionKey: async () => {
				stepResults.generateAndAttachEncryptionKey = await generateAndAttachEncryptionKey(
					getResults('getGeneratedCaps', 'generateAndAttachEncryptionKey'),
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
		encryptedKey: EncryptedSymmetricKey,
		attachments?: File[],
	) {
		return async (tx: Transaction) => {
			const channel = tx.object(channelId);
			const memberCap = tx.object(memberCapId);

			// Encrypt the message text
			const { encryptedBytes: ciphertext, nonce: textNonce } =
				await this.#envelopeEncryption.encryptText({
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
				Attachment.name.replace('@local-pkg/sui-messaging', this.#packageConfig.packageId)
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

		// 1. Encrypt all attachment data in parallel
		const encryptedDataPayloads = await Promise.all(
			attachments.map(async (file) => {
				return this.#envelopeEncryption.encryptAttachmentData({
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
				return this.#envelopeEncryption.encryptAttachmentMetadata({
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
		encryptedKey,
	}: {
		channelId: string;
		memberCapId: string;
		message: string;
		encryptedKey: EncryptedSymmetricKey;
		attachments?: File[];
	} & { signer: Signer }): Promise<{ digest: string; messageId: string }> {
		const tx = new Transaction();
		const sendMessageTxBuilder = await this.sendMessage(
			channelId,
			memberCapId,
			signer.toSuiAddress(),
			message,
			encryptedKey,
			attachments,
		);
		await sendMessageTxBuilder(tx);
		const { digest, effects } = await this.#executeTransaction(tx, signer, 'send message', true);

		const messageId = effects.changedObjects.find((obj) => obj.idOperation === 'Created')?.id;
		if (messageId === undefined) {
			throw new MessagingClientError('Message id not found on the transaction effects');
		}

		return { digest, messageId };
	}

	async executeCreateChannelTransaction({
		signer,
		initialMembers,
	}: {
		initialMembers?: string[];
	} & { signer: Signer }): Promise<{
		digest: string;
		channelId: string;
		creatorCapId: string;
		encryptedKeyBytes: Uint8Array<ArrayBuffer>;
	}> {
		const flow = this.createChannelFlow({
			creatorAddress: signer.toSuiAddress(),
			initialMemberAddresses: initialMembers,
		});

		// Step 1: Build and execute the channel creation transaction
		const channelTx = flow.build();
		const { digest: channelDigest } = await this.#executeTransaction(
			channelTx,
			signer,
			'create channel',
		);

		// Step 2: Get the creator cap from the transaction
		const {
			creatorCap,
			creatorMemberCap,
			additionalMemberCaps: _,
		} = await flow.getGeneratedCaps({
			digest: channelDigest,
		});

		// Step 3: Generate and attach encryption key
		const attachKeyTx = await flow.generateAndAttachEncryptionKey({ creatorMemberCap });
		const { digest: keyDigest } = await this.#executeTransaction(
			attachKeyTx,
			signer,
			'attach encryption key',
		);

		// Step 4: Get the encrypted key bytes
		const { channelId, encryptedKeyBytes } = flow.getGeneratedEncryptionKey();

		return { digest: keyDigest, creatorCapId: creatorCap.id.id, channelId, encryptedKeyBytes };
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

	async #getGeneratedCaps(digest: string) {
		const creatorCapType = CreatorCap.name.replace(
			'@local-pkg/sui-messaging',
			this.#packageConfig.packageId,
		);
		const creatorMemberCapType = MemberCap.name.replace(
			'@local-pkg/sui-messaging',
			this.#packageConfig.packageId,
		);
		const additionalMemberCapType = MemberCap.name.replace(
			'@local-pkg/sui-messaging',
			this.#packageConfig.packageId,
		);

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

		const creatorCapParsed = CreatorCap.parse(await suiCreatorCapObject.content);

		const suiCreatorMemberCapObject = createdObjects.objects.find(
			(object) =>
				!(object instanceof Error) &&
				object.type === creatorMemberCapType &&
				// only get the creator's member cap
				object.owner.$kind === 'AddressOwner' &&
				suiCreatorCapObject.owner.$kind === 'AddressOwner' &&
				object.owner.AddressOwner === suiCreatorCapObject.owner.AddressOwner,
		);

		if (suiCreatorMemberCapObject instanceof Error || !suiCreatorMemberCapObject) {
			throw new MessagingClientError(
				`CreatorMemberCap object not found in transaction effects for transaction (${digest})`,
			);
		}

		const creatorMemberCapParsed = MemberCap.parse(await suiCreatorMemberCapObject.content);

		const suiAdditionalMemberCapsObjects = createdObjects.objects.filter(
			(object) => !(object instanceof Error) && object.type === additionalMemberCapType,
		);

		// exclude the creator's member cap from the additional member caps
		const additionalMemberCapsParsed = await Promise.all(
			suiAdditionalMemberCapsObjects.map(async (object) => {
				if (object instanceof Error) {
					throw new MessagingClientError(
						`AdditionalMemberCap object not found in transaction effects for transaction (${digest})`,
					);
				}
				return MemberCap.parse(await object.content);
			}),
		);
		additionalMemberCapsParsed.filter((cap) => cap.id.id !== creatorMemberCapParsed.id.id);

		return {
			creatorCap: creatorCapParsed,
			creatorMemberCap: creatorMemberCapParsed,
			additionalMemberCaps: additionalMemberCapsParsed,
		};
	}

	// Derive the message IDs from the given range
	// Note: messages = TableVec<Message>
	// --> TableVec{contents: Table<u64, Message>}
	#deriveMessageIDsFromRange(messagesTableId: string, startIndex: bigint, endIndex: bigint) {
		const messageIDs: string[] = [];

		for (let i = startIndex; i < endIndex; i++) {
			messageIDs.push(deriveDynamicFieldID(messagesTableId, 'u64', bcs.U64.serialize(i).toBytes()));
		}

		return messageIDs;
	}

	// Parse the message objects response
	// Note: the given message objects response
	// is in the form of dynamic_field::Field<u64, Message>
	async #parseMessageObjects(
		messageObjects: Experimental_SuiClientTypes.GetObjectsResponse,
	): Promise<ParsedMessageObject[]> {
		const DynamicFieldMessage = bcs.struct('DynamicFieldMessage', {
			id: bcs.Address, // UID is represented as an address
			name: bcs.U64, // the key (message index)
			value: Message, // the actual Message
		});

		const parsedMessageObjects = await Promise.all(
			messageObjects.objects.map(async (object) => {
				if (object instanceof Error || !object.content) {
					throw new MessagingClientError(`Failed to parse message object: ${object}`);
				}
				const content = await object.content;
				// Parse the dynamic field wrapper
				const dynamicField = DynamicFieldMessage.parse(content);

				// Extract the actual Message from the value field
				return dynamicField.value;
			}),
		);

		return parsedMessageObjects;
	}

	async #createLazyAttachmentDataPromise({
		channelId,
		memberCapId,
		sender,
		encryptedKey,
		blobRef,
		nonce,
	}: {
		channelId: string;
		memberCapId: string;
		sender: string;
		encryptedKey: EncryptedSymmetricKey;
		blobRef: string;
		nonce: Uint8Array;
	}): Promise<Uint8Array<ArrayBuffer>> {
		return new Promise(async (resolve, reject) => {
			try {
				// Download the encrypted data
				const [encryptedData] = await this.#storage(this.#suiClient).download([blobRef]);

				// Decrypt the data
				const decryptedData = await this.#envelopeEncryption.decryptAttachmentData({
					encryptedBytes: new Uint8Array(encryptedData),
					nonce: new Uint8Array(nonce),
					channelId,
					memberCapId,
					sender,
					encryptedKey,
				});

				resolve(decryptedData.data);
			} catch (error) {
				reject(error);
			}
		});
	}
}
