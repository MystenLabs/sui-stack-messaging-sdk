import { Transaction, type TransactionResult } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import type { ClientWithExtensions, Experimental_SuiClientTypes } from '@mysten/sui/experimental';
import { WalrusClient } from '@mysten/walrus';

import {
	_new as newChannel,
	addEncryptedKey,
	share as shareChannel,
	sendMessage,
	addMembers,
	Channel,
} from './contracts/sui_stack_messaging/channel.js';

import { _new as newAttachment, Attachment } from './contracts/sui_stack_messaging/attachment.js';

import type {
	ChannelMembershipsRequest,
	ChannelMembershipsResponse,
	ChannelMembersResponse,
	ChannelMember,
	GetLatestMessagesRequest,
	MessagingClientExtensionOptions,
	MessagingClientOptions,
	MessagingCompatibleClient,
	MessagingPackageConfig,
	ParsedChannelObject,
	ParsedMessageObject,
	DecryptMessageResult,
	LazyDecryptAttachmentResult,
	GetChannelMessagesRequest,
	DecryptedChannelObject,
	DecryptedMessagesResponse,
	DecryptedChannelObjectsByAddressResponse,
	Membership,
} from './types.js';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants.js';
import { MessagingClientError } from './error.js';
import type { StorageAdapter } from './storage/adapters/storage.js';
import { WalrusStorageAdapter } from './storage/adapters/walrus/walrus.js';
import type { EncryptedSymmetricKey } from './encryption/types.js';
import { EnvelopeEncryption } from './encryption/envelopeEncryption.js';

import type { RawTransactionArgument } from './contracts/utils';
import {
	CreatorCap,
	transferToSender as transferCreatorCap,
} from './contracts/sui_stack_messaging/creator_cap.js';
import {
	MemberCap,
	transferMemberCaps,
	transferToRecipient as transferMemberCap,
} from './contracts/sui_stack_messaging/member_cap.js';
import { none as noneConfig } from './contracts/sui_stack_messaging/config.js';
import { Message } from './contracts/sui_stack_messaging/message.js';

export class SuiStackMessagingClient {
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

				return new SuiStackMessagingClient({
					suiClient: client,
					storage,
					packageConfig,
					sessionKey: 'sessionKey' in options ? options.sessionKey : undefined,
					sessionKeyConfig: 'sessionKeyConfig' in options ? options.sessionKeyConfig : undefined,
				});
			},
		};
	}

	// ===== Private Helper Methods =====

	/**
	 * Get user's member cap ID for a specific channel
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns Member cap ID
	 */
	async #getUserMemberCapId(userAddress: string, channelId: string): Promise<string> {
		const memberships = await this.getChannelMemberships({ address: userAddress });
		const membership = memberships.memberships.find((m) => m.channel_id === channelId);

		if (!membership) {
			throw new MessagingClientError(`User ${userAddress} is not a member of channel ${channelId}`);
		}

		return membership.member_cap_id;
	}

	/**
	 * Get encryption key from channel
	 * @param channel - The channel object
	 * @returns Encrypted symmetric key
	 */
	async #getEncryptionKeyFromChannel(channel: ParsedChannelObject): Promise<EncryptedSymmetricKey> {
		const encryptedKeyBytes = channel.encryption_key_history.latest.encrypted_bytes;
		const keyVersion = channel.encryption_key_history.latest_version;

		return {
			$kind: 'Encrypted' as const,
			encryptedBytes: new Uint8Array(encryptedKeyBytes),
			version: keyVersion,
		};
	}

	/**
	 * Decrypt a message (private method)
	 * @param message - The encrypted message object
	 * @param channelId - The channel ID
	 * @param memberCapId - The member cap ID
	 * @param encryptedKey - The encrypted symmetric key
	 * @returns Decrypted message with lazy-loaded attachments
	 */
	async #decryptMessage(
		message: (typeof Message)['$inferType'],
		channelId: string,
		memberCapId: string,
		encryptedKey: EncryptedSymmetricKey,
	): Promise<DecryptMessageResult> {
		// 1. Decrypt text
		const text = await this.#envelopeEncryption.decryptText({
			$kind: 'Encrypted',
			encryptedBytes: new Uint8Array(message.ciphertext),
			nonce: new Uint8Array(message.nonce),
			sender: message.sender,
			channelId,
			memberCapId,
			encryptedKey,
		});

		// 2. If no attachments, return early
		if (!message.attachments || message.attachments.length === 0) {
			return { text, attachments: [], sender: message.sender, createdAtMs: message.created_at_ms };
		}

		// 3. Decrypt attachments metadata
		const attachmentsMetadata = await Promise.all(
			message.attachments.map(async (attachment) => {
				// Use the encrypted_metadata field directly - no download needed for metadata
				const metadata = await this.#envelopeEncryption.decryptAttachmentMetadata({
					$kind: 'Encrypted',
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
			sender: message.sender,
			createdAtMs: message.created_at_ms,
			attachments: lazyAttachmentsDataPromises,
		};
	}

	// ===== Read Path =====

	/**
	 * Get channel memberships for a user
	 * @param request - Pagination and filter options
	 * @returns Channel memberships with pagination info
	 */
	async getChannelMemberships(
		request: ChannelMembershipsRequest,
	): Promise<ChannelMembershipsResponse> {
		const memberCapsRes = await this.#suiClient.core.getOwnedObjects({
			...request,
			type: MemberCap.name.replace('@local-pkg/sui-stack-messaging', this.#packageConfig.packageId),
		});
		// Filter out any error objects
		const validObjects = memberCapsRes.objects.filter(
			(object): object is Experimental_SuiClientTypes.ObjectResponse => !(object instanceof Error),
		);

		if (validObjects.length === 0) {
			return {
				hasNextPage: memberCapsRes.hasNextPage,
				cursor: memberCapsRes.cursor,
				memberships: [],
			};
		}

		// Get all object contents efficiently
		const contents = await this.#getObjectContents(validObjects);

		// Parse all MemberCaps
		const memberships = await Promise.all(
			contents.map(async (content) => {
				const parsedMemberCap = MemberCap.parse(content);
				return { member_cap_id: parsedMemberCap.id.id, channel_id: parsedMemberCap.channel_id };
			}),
		);

		return {
			hasNextPage: memberCapsRes.hasNextPage,
			cursor: memberCapsRes.cursor,
			memberships,
		};
	}

	/**
	 * Get channel objects for a user (returns decrypted data)
	 * @param request - Pagination and filter options
	 * @returns Decrypted channel objects with pagination info
	 */
	async getChannelObjectsByAddress(
		request: ChannelMembershipsRequest,
	): Promise<DecryptedChannelObjectsByAddressResponse> {
		const membershipsPaginated = await this.getChannelMemberships(request);
		const channelObjects = await this.#getChannelObjectsByMemberships(
			membershipsPaginated.memberships,
		);

		return {
			hasNextPage: membershipsPaginated.hasNextPage,
			cursor: membershipsPaginated.cursor,
			channelObjects,
		};
	}

	/**
	 * Internal method to get channel objects by memberships (returns decrypted data)
	 * @param memberships - Array of user memberships with channel IDs and member cap IDs
	 * @returns Decrypted channel objects
	 */
	async #getChannelObjectsByMemberships(
		memberships: Membership[],
	): Promise<DecryptedChannelObject[]> {
		if (memberships.length === 0) {
			return [];
		}

		const channelIds = memberships.map((m) => m.channel_id);
		const channelObjectsRes = await this.#suiClient.core.getObjects({
			objectIds: channelIds,
		});

		const parsedChannels = await Promise.all(
			channelObjectsRes.objects.map(async (object) => {
				if (object instanceof Error || !object.content) {
					throw new MessagingClientError(`Failed to parse Channel object: ${object}`);
				}
				return Channel.parse(await object.content);
			}),
		);

		// Create a map for quick lookup of member cap IDs by channel ID
		const memberCapMap = new Map<string, string>();
		memberships.forEach((membership) => {
			memberCapMap.set(membership.channel_id, membership.member_cap_id);
		});

		// Decrypt each channel's last_message if it exists
		const decryptedChannels = await Promise.all(
			parsedChannels.map(async (channel) => {
				const decryptedChannel: DecryptedChannelObject = {
					...channel,
					last_message: null,
				};

				// Decrypt last_message if it exists
				if (channel.last_message) {
					const userMemberCapId = memberCapMap.get(channel.id.id);
					if (!userMemberCapId) {
						throw new MessagingClientError(`No member cap ID found for channel ${channel.id.id}`);
					}

					const encryptedKey = await this.#getEncryptionKeyFromChannel(channel);
					const decryptedMessage = await this.#decryptMessage(
						channel.last_message,
						channel.id.id,
						userMemberCapId,
						encryptedKey,
					);
					decryptedChannel.last_message = decryptedMessage;
				}

				return decryptedChannel;
			}),
		);

		return decryptedChannels;
	}

	/**
	 * Get all members of a channel
	 * @param channelId - The channel ID
	 * @returns Channel members with addresses and member cap IDs
	 */
	async getChannelMembers(channelId: string): Promise<ChannelMembersResponse> {
		// 1. Get the channel object to access the auth structure
		const channelObjectsRes = await this.#suiClient.core.getObjects({
			objectIds: [channelId],
		});
		const channelObject = channelObjectsRes.objects[0];
		if (channelObject instanceof Error || !channelObject.content) {
			throw new MessagingClientError(`Failed to parse Channel object: ${channelObject}`);
		}
		const channel = Channel.parse(await channelObject.content);

		// 2. Extract member cap IDs from the auth structure
		const memberCapIds = channel.auth.member_permissions.contents.map((entry) => entry.key);

		if (memberCapIds.length === 0) {
			return { members: [] };
		}

		// 3. Fetch all MemberCap objects
		const memberCapObjects = await this.#suiClient.core.getObjects({
			objectIds: memberCapIds,
		});

		// 4. Parse MemberCap objects and extract member addresses
		const members: ChannelMember[] = [];
		for (const obj of memberCapObjects.objects) {
			if (obj instanceof Error || !obj.content) {
				console.warn('Failed to fetch MemberCap object:', obj);
				continue;
			}

			try {
				const memberCap = MemberCap.parse(await obj.content);

				// Get the owner of the MemberCap object
				if (obj.owner) {
					let memberAddress: string;
					if (obj.owner.$kind === 'AddressOwner') {
						memberAddress = obj.owner.AddressOwner;
					} else if (obj.owner.$kind === 'ObjectOwner') {
						// For object-owned MemberCaps, we can't easily get the address
						// This is a limitation of the current approach
						console.warn('MemberCap is object-owned, skipping:', memberCap.id.id);
						continue;
					} else {
						console.warn('MemberCap has unknown ownership type:', obj.owner);
						continue;
					}

					members.push({
						memberAddress,
						memberCapId: memberCap.id.id,
					});
				}
			} catch (error) {
				console.warn('Failed to parse MemberCap object:', error);
			}
		}

		return { members };
	}

	/**
	 * Get messages from a channel with pagination (returns decrypted messages)
	 * @param request - Request parameters including channelId, userAddress, cursor, limit, and direction
	 * @returns Decrypted messages with pagination info
	 */
	async getChannelMessages({
		channelId,
		userAddress,
		cursor = null,
		limit = 50,
		direction = 'backward',
	}: GetChannelMessagesRequest): Promise<DecryptedMessagesResponse> {
		// 1. Get channel metadata (we need the raw channel object for metadata, not decrypted)
		const channelObjectsRes = await this.#suiClient.core.getObjects({
			objectIds: [channelId],
		});
		const channelObject = channelObjectsRes.objects[0];
		if (channelObject instanceof Error || !channelObject.content) {
			throw new MessagingClientError(`Failed to parse Channel object: ${channelObject}`);
		}
		const channel = Channel.parse(await channelObject.content);

		const messagesTableId = channel.messages.contents.id.id;
		const totalMessagesCount = BigInt(channel.messages_count);

		// 2. Validate inputs
		if (totalMessagesCount === BigInt(0)) {
			return this.#createEmptyMessagesResponse(direction);
		}

		if (cursor !== null && cursor >= totalMessagesCount) {
			throw new MessagingClientError(
				`Cursor ${cursor} is out of bounds. Channel has ${totalMessagesCount} messages.`,
			);
		}

		// 3. Calculate fetch range based on direction and cursor
		const fetchRange = this.#calculateFetchRange({
			cursor,
			limit,
			direction,
			totalMessagesCount,
		});

		// 4. Handle edge cases
		if (fetchRange.startIndex >= fetchRange.endIndex) {
			return this.#createEmptyMessagesResponse(direction);
		}

		// 5. Fetch and parse messages
		const rawMessages = await this.#fetchMessagesInRange(messagesTableId, fetchRange);

		// 6. Decrypt messages
		const memberCapId = await this.#getUserMemberCapId(userAddress, channelId);
		const encryptedKey = await this.#getEncryptionKeyFromChannel(channel);

		const decryptedMessages = await Promise.all(
			rawMessages.map(async (message) => {
				try {
					return await this.#decryptMessage(message, channelId, memberCapId, encryptedKey);
				} catch (error) {
					console.warn(`Failed to decrypt message in channel ${channelId}:`, error);
					// Return a placeholder for failed decryption
					return {
						text: '[Failed to decrypt message]',
						sender: message.sender,
						createdAtMs: message.created_at_ms,
						attachments: [],
					};
				}
			}),
		);

		// 7. Determine next pagination
		const nextPagination = this.#determineNextPagination({
			fetchRange,
			direction,
			totalMessagesCount,
		});

		// 8. Create response
		return {
			messages: decryptedMessages,
			cursor: nextPagination.cursor,
			hasNextPage: nextPagination.hasNextPage,
			direction,
		};
	}

	/**
	 * Get new messages since last polling state (returns decrypted messages)
	 * @param request - Request with channelId, userAddress, pollingState, and limit
	 * @returns New decrypted messages since last poll
	 */
	async getLatestMessages({
		channelId,
		userAddress,
		pollingState,
		limit = 50,
	}: GetLatestMessagesRequest): Promise<DecryptedMessagesResponse> {
		// 1. Get current channel state to check for new messages
		const channelObjectsRes = await this.#suiClient.core.getObjects({
			objectIds: [channelId],
		});
		const channelObject = channelObjectsRes.objects[0];
		if (channelObject instanceof Error || !channelObject.content) {
			throw new MessagingClientError(`Failed to parse Channel object: ${channelObject}`);
		}
		const channel = Channel.parse(await channelObject.content);
		const latestMessageCount = BigInt(channel.messages_count);

		// 2. Check if there are new messages since last poll
		const newMessagesCount = latestMessageCount - pollingState.lastMessageCount;

		if (newMessagesCount === BigInt(0)) {
			// No new messages - return empty response with same cursor
			return {
				messages: [],
				cursor: pollingState.lastCursor,
				hasNextPage: pollingState.lastCursor !== null,
				direction: 'backward',
			};
		}

		// 3. Use unified method to fetch new messages
		// Limit to the number of new messages or the requested limit, whichever is smaller
		const fetchLimit = Math.min(Number(newMessagesCount), limit);

		const response = await this.getChannelMessages({
			channelId,
			userAddress,
			cursor: pollingState.lastCursor,
			limit: fetchLimit,
			direction: 'backward',
		});

		return response;
	}

	/**
	 * Decrypt a message (public method for MessageAddedEvent compatibility)
	 * @param message - The encrypted message object
	 * @param channelId - The channel ID
	 * @param memberCapId - The member cap ID
	 * @param encryptedKey - The encrypted symmetric key
	 * @returns Decrypted message with lazy-loaded attachments
	 */
	async decryptMessage(
		message: (typeof Message)['$inferType'],
		channelId: string,
		memberCapId: string,
		encryptedKey: EncryptedSymmetricKey,
	): Promise<DecryptMessageResult> {
		return this.#decryptMessage(message, channelId, memberCapId, encryptedKey);
	}

	// ===== Write Path =====

	/**
	 * Creates a channel with encryption key in a single transaction
	 * Returns a transaction builder function and the encrypted key bytes
	 *
	 * @param creatorAddress - The address of the channel creator
	 * @param initialMemberAddresses - Optional list of initial member addresses
	 * @param initialMessage - Optional initial message to send to the channel
	 * @returns Object containing transaction builder function and encrypted key bytes
	 */
	async createChannel(
		creatorAddress: string,
		initialMemberAddresses?: string[],
		initialMessage?: string,
	) {
		// Generate the encrypted channel DEK using creator address
		const {
			encryptedBytes: encryptedKeyBytes,
			nonce,
			unencryptedKey,
		} = await this.#envelopeEncryption.generateEncryptedChannelDEK({
			creatorAddress,
		});

		const txBuilder = async (tx: Transaction) => {
			// 1. Create the channel and caps
			const config = tx.add(noneConfig());
			const [channel, creatorCap, creatorMemberCap] = tx.add(newChannel({ arguments: { config } }));

			// 2. Add initial members if provided
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

			// 3. Add the encrypted key to the channel
			tx.add(
				addEncryptedKey({
					arguments: {
						self: channel,
						memberCap: creatorMemberCap,
						newEncryptionKeyBytes: tx.pure.vector('u8', encryptedKeyBytes),
						newEncryptionNonce: tx.pure.vector('u8', nonce),
					},
				}),
			);

			// 4. Share the channel and transfer caps
			tx.add(shareChannel({ arguments: { self: channel, creatorCap } }));

			// Transfer creator's member cap
			tx.add(
				transferMemberCap({
					arguments: { cap: creatorMemberCap, creatorCap, recipient: creatorAddress },
				}),
			);

			// Transfer additional member caps if any
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

			// 5. Send initial message if provided
			if (initialMessage) {
				// Encrypt the initial message using the unencrypted key
				const { encryptedBytes: ciphertext, nonce: textNonce } =
					await this.#envelopeEncryption.encryptText({
						$kind: 'Unencrypted',
						text: initialMessage,
						sender: creatorAddress,
						unEncryptedKey: unencryptedKey,
					});

				// Create empty attachments vector for initial message
				const emptyAttachments = tx.moveCall({
					package: '0x1',
					module: 'vector',
					function: 'empty',
					arguments: [],
					typeArguments: [
						this.#packageConfig.packageId
							? Attachment.name.replace(
									'@local-pkg/sui-stack-messaging',
									this.#packageConfig.packageId,
								)
							: Attachment.name,
					],
				});

				// Send the initial message
				tx.add(
					sendMessage({
						package: this.#packageConfig.packageId,
						arguments: {
							self: channel,
							memberCap: creatorMemberCap,
							ciphertext: tx.pure.vector('u8', ciphertext),
							nonce: tx.pure.vector('u8', textNonce),
							attachments: emptyAttachments,
						},
					}),
				);
			}

			// Transfer creator cap
			tx.add(transferCreatorCap({ arguments: { self: creatorCap } }));
		};

		return {
			transactionBuilder: txBuilder,
			encryptedKeyBytes,
		};
	}

	/**
	 * Create a transaction that creates a channel
	 * Returns the transaction, and the encrypted key bytes that were attached to the channel
	 *
	 * @usage
	 * ```ts
	 * const {transaction: tx, encryptedKeyBytes} = await client.createChannelTransaction({
	 *   creatorAddress: signer.toSuiAddress(),
	 *   initialMembers: ['0x...'],
	 *   initialMessage: 'Welcome to the channel!'
	 * });
	 * ```
	 */
	async createChannelTransaction({
		transaction = new Transaction(),
		creatorAddress,
		initialMemberAddresses,
		initialMessage,
	}: {
		transaction?: Transaction;
		creatorAddress: string;
		initialMemberAddresses?: string[];
		initialMessage?: string;
	}): Promise<{
		transaction: Transaction;
		encryptedKeyBytes: Uint8Array<ArrayBuffer>;
	}> {
		const { transactionBuilder, encryptedKeyBytes } = await this.createChannel(
			creatorAddress,
			initialMemberAddresses,
			initialMessage,
		);
		await transactionBuilder(transaction);
		return { transaction, encryptedKeyBytes };
	}

	/**
	 * Create a send message transaction builder
	 * @param channelId - The channel ID
	 * @param memberCapId - The member cap ID
	 * @param sender - The sender address
	 * @param message - The message text
	 * @param encryptedKey - The encrypted symmetric key
	 * @param attachments - Optional file attachments
	 * @returns Transaction builder function
	 */
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
					$kind: 'Encrypted',
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
				Attachment.name.replace('@local-pkg/sui-stack-messaging', this.#packageConfig.packageId)
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
					$kind: 'Encrypted',
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
					$kind: 'Encrypted',
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

	/**
	 * Execute a send message transaction
	 * @param params - Transaction parameters including signer, channelId, memberCapId, message, and encryptedKey
	 * @returns Transaction digest and message ID
	 */
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

	/**
	 * Executes a create channel transaction
	 *
	 * @param params - The parameters for creating a channel
	 * @returns Promise with transaction digest, channel ID, creator cap ID, and encrypted key bytes
	 */
	async executeCreateChannelTransaction({
		transaction,
		signer,
		initialMemberAddresses,
		initialMessage,
	}: {
		initialMemberAddresses?: string[];
		initialMessage?: string;
	} & { transaction?: Transaction; signer: Signer }): Promise<{
		digest: string;
		channelObject: ParsedChannelObject;
		generatedCaps: any;
		encryptedKeyBytes: Uint8Array<ArrayBuffer>;
	}> {
		const { transaction: tx, encryptedKeyBytes } = await this.createChannelTransaction({
			transaction,
			creatorAddress: signer.toSuiAddress(),
			initialMemberAddresses,
			initialMessage,
		});

		const { digest, effects } = await this.#executeTransaction(tx, signer, 'create channel', true);

		// Extract the created objects from the transaction effects
		const createdObjectIds = effects.changedObjects
			.filter((object) => object.idOperation === 'Created')
			.map((object) => object.id);

		const createdObjects = await this.#suiClient.core.getObjects({
			objectIds: createdObjectIds,
		});

		// Find the channel object
		const channelType = Channel.name.replace(
			'@local-pkg/sui-stack-messaging',
			this.#packageConfig.packageId,
		);
		const channelObject = createdObjects.objects.find(
			(object) => !(object instanceof Error) && object.type === channelType,
		);

		if (channelObject instanceof Error || !channelObject) {
			throw new MessagingClientError(
				`Channel object not found in transaction effects for transaction (${digest})`,
			);
		}

		const channelObjectParsed = Channel.parse(await channelObject.content);
		const generatedCaps = await this.#getGeneratedCaps(digest);

		return {
			digest,
			channelObject: channelObjectParsed,
			generatedCaps,
			encryptedKeyBytes,
		};
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
			'@local-pkg/sui-stack-messaging',
			this.#packageConfig.packageId,
		);
		const creatorMemberCapType = MemberCap.name.replace(
			'@local-pkg/sui-stack-messaging',
			this.#packageConfig.packageId,
		);
		const additionalMemberCapType = MemberCap.name.replace(
			'@local-pkg/sui-stack-messaging',
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

		// Get the owner address for the creator member cap
		let creatorOwnerAddress: string | null = null;
		if (suiCreatorMemberCapObject.owner) {
			if (suiCreatorMemberCapObject.owner.$kind === 'AddressOwner') {
				creatorOwnerAddress = suiCreatorMemberCapObject.owner.AddressOwner;
			} else {
				console.warn(
					'Creator MemberCap has unexpected ownership type:',
					suiCreatorMemberCapObject.owner,
				);
			}
		}

		const creatorMemberCapWithOwner = {
			capObject: creatorMemberCapParsed,
			ownerAddress: creatorOwnerAddress,
		};

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
				const parsedMemberCap = MemberCap.parse(await object.content);

				// Get the owner address from the object
				let ownerAddress: string | null = null;
				if (object.owner) {
					if (object.owner.$kind === 'AddressOwner') {
						ownerAddress = object.owner.AddressOwner;
					} else if (object.owner.$kind === 'ObjectOwner') {
						// For object-owned MemberCaps, we can't easily get the address
						console.warn('MemberCap is object-owned, skipping:', parsedMemberCap.id.id);
						return null;
					} else {
						console.warn('MemberCap has unknown ownership type:', object.owner);
						return null;
					}
				}

				return {
					capObject: parsedMemberCap,
					ownerAddress,
				};
			}),
		);
		const filteredAdditionalMemberCaps = additionalMemberCapsParsed.filter(
			(cap) => cap !== null && cap.capObject.id.id !== creatorMemberCapWithOwner.capObject.id.id,
		);

		return {
			creatorCap: creatorCapParsed,
			creatorMemberCap: creatorMemberCapWithOwner,
			additionalMemberCaps: filteredAdditionalMemberCaps,
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
					$kind: 'Encrypted',
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

	/**
	 * Calculate the range of message indices to fetch
	 */
	#calculateFetchRange({
		cursor,
		limit,
		direction,
		totalMessagesCount,
	}: {
		cursor: bigint | null;
		limit: number;
		direction: 'backward' | 'forward';
		totalMessagesCount: bigint;
	}): { startIndex: bigint; endIndex: bigint } {
		const limitBigInt = BigInt(limit);

		if (direction === 'backward') {
			// Fetch messages in descending order (newest first)
			if (cursor === null) {
				// First request - get latest messages
				const startIndex =
					totalMessagesCount > limitBigInt ? totalMessagesCount - limitBigInt : BigInt(0);
				return {
					startIndex,
					endIndex: totalMessagesCount,
				};
			}
			// Subsequent requests - get older messages
			const endIndex = cursor; // Cursor is exclusive in backward direction
			const startIndex = endIndex > limitBigInt ? endIndex - limitBigInt : BigInt(0);
			return {
				startIndex,
				endIndex,
			};
		}
		// Fetch messages in ascending order (oldest first)
		if (cursor === null) {
			// First request - get oldest messages
			const endIndex = totalMessagesCount > limitBigInt ? limitBigInt : totalMessagesCount;
			return {
				startIndex: BigInt(0),
				endIndex,
			};
		}
		// Subsequent requests - get newer messages
		const startIndex = cursor + BigInt(1); // Cursor is inclusive in forward direction
		const endIndex =
			startIndex + limitBigInt > totalMessagesCount ? totalMessagesCount : startIndex + limitBigInt;
		return {
			startIndex,
			endIndex,
		};
	}

	/**
	 * Fetch messages in the specified range
	 */
	async #fetchMessagesInRange(
		messagesTableId: string,
		range: { startIndex: bigint; endIndex: bigint },
	): Promise<ParsedMessageObject[]> {
		const messageIds = this.#deriveMessageIDsFromRange(
			messagesTableId,
			range.startIndex,
			range.endIndex,
		);

		if (messageIds.length === 0) {
			return [];
		}

		const messageObjects = await this.#suiClient.core.getObjects({ objectIds: messageIds });
		return await this.#parseMessageObjects(messageObjects);
	}

	/**
	 * Create a messages response with pagination info
	 */
	#determineNextPagination({
		fetchRange,
		direction,
		totalMessagesCount,
	}: {
		fetchRange: { startIndex: bigint; endIndex: bigint };
		direction: 'backward' | 'forward';
		totalMessagesCount: bigint;
	}): { cursor: bigint | null; hasNextPage: boolean } {
		// Determine next cursor and hasNextPage based on direction
		let nextCursor: bigint | null = null;
		let hasNextPage = false;

		if (direction === 'backward') {
			// For backward direction, cursor points to the oldest message we fetched (exclusive)
			nextCursor = fetchRange.startIndex > BigInt(0) ? fetchRange.startIndex : null;
			hasNextPage = fetchRange.startIndex > BigInt(0);
		} else {
			// For forward direction, cursor points to the newest message we fetched (inclusive)
			nextCursor =
				fetchRange.endIndex < totalMessagesCount ? fetchRange.endIndex - BigInt(1) : null;
			hasNextPage = fetchRange.endIndex < totalMessagesCount;
		}

		return {
			cursor: nextCursor,
			hasNextPage,
		};
	}

	/**
	 * Create an empty messages response
	 */
	#createEmptyMessagesResponse(direction: 'backward' | 'forward'): DecryptedMessagesResponse {
		return {
			messages: [],
			cursor: null,
			hasNextPage: false,
			direction,
		};
	}
	/**
	 * Helper method to get object contents, handling both SuiClient and SuiGrpcClient
	 */
	async #getObjectContents(
		objects: Experimental_SuiClientTypes.ObjectResponse[],
	): Promise<Uint8Array[]> {
		// First, try to get all contents directly (works for SuiClient)
		const contentPromises = objects.map(async (object) => {
			try {
				return await object.content;
			} catch (error) {
				// If this is the gRPC error, we'll handle it below
				if (
					error instanceof Error &&
					error.message.includes('GRPC does not return object contents')
				) {
					return null; // Mark for batch fetching
				}
				throw error;
			}
		});

		const contents = await Promise.all(contentPromises);

		// Check if any failed with the gRPC error
		const needsBatchFetch = contents.some((content) => content === null);

		if (needsBatchFetch) {
			// Batch fetch all objects that need content
			const objectIds = objects.map((obj) => obj.id);
			const objectResponses = await this.#suiClient.core.getObjects({ objectIds });

			// Map the results back to the original order and await the content
			const batchContents = await Promise.all(
				objectResponses.objects.map(async (obj) => {
					if (obj instanceof Error || !obj.content) {
						throw new MessagingClientError(`Failed to fetch object content: ${obj}`);
					}
					return await obj.content;
				}),
			);

			return batchContents;
		}

		// Filter out null values and return
		return contents.filter((content): content is Uint8Array => content !== null);
	}
}
