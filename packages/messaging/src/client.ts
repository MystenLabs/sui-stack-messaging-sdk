import {
	BuildTransactionOptions,
	Transaction,
	TransactionDataBuilder,
	type TransactionResult,
} from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID, fromBase64, SUI_TYPE_ARG } from '@mysten/sui/utils';
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
	CreateChannelFlow,
	CreateChannelFlowGetGeneratedCapsOpts,
	CreateChannelFlowOpts,
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
	GetChannelObjectsByChannelIdsRequest,
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
import { SuiGrpcClient } from '@mysten/sui-grpc';

export class SuiStackMessagingClient {
	#suiClient: MessagingCompatibleClient;
	#packageConfig: MessagingPackageConfig;
	#storage: (client: MessagingCompatibleClient) => StorageAdapter;
	#envelopeEncryption: EnvelopeEncryption;

	// Caching for efficiency
	#memberCapIdCache: Map<string, string> = new Map(); // `${userAddress}:${channelId}` --> memberCapId
	#maxCacheSize: number = 250; // Maximum number of entries in the cache

	private constructor(public options: MessagingClientOptions) {
		// Check if we need to proxy the gRPC client
		const originalClient = options.suiClient;
		this.#suiClient = this.#createGrpcCompatibleClient(originalClient);
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
	 * Ensure cache doesn't exceed maximum size by evicting least recently used entries
	 * Uses a simple LRU approach: Map maintains insertion order, so we remove the oldest entries
	 */
	#enforceCacheSizeLimit(): void {
		if (this.#memberCapIdCache.size <= this.#maxCacheSize) {
			return;
		}

		// Calculate how many entries to remove
		const entriesToRemove = this.#memberCapIdCache.size - this.#maxCacheSize;

		// Remove the oldest entries (Map iterates in insertion order)
		let removed = 0;
		for (const key of this.#memberCapIdCache.keys()) {
			if (removed >= entriesToRemove) {
				break;
			}
			this.#memberCapIdCache.delete(key);
			removed++;
		}
	}

	/**
	 * Invalidate cache entries for a specific user
	 * @param userAddress - The user's address
	 */
	#invalidateUserCache(userAddress: string): void {
		// Remove all member cap ID entries for this user
		const keysToDelete: string[] = [];
		for (const key of this.#memberCapIdCache.keys()) {
			if (key.startsWith(`${userAddress}:`)) {
				keysToDelete.push(key);
			}
		}
		keysToDelete.forEach((key) => this.#memberCapIdCache.delete(key));
	}

	/**
	 * Invalidate cache entries for a specific channel
	 * @param channelId - The channel ID
	 */
	#invalidateChannelCache(channelId: string): void {
		// Remove all member cap ID entries for this channel
		const keysToDelete: string[] = [];
		for (const key of this.#memberCapIdCache.keys()) {
			if (key.endsWith(`:${channelId}`)) {
				keysToDelete.push(key);
			}
		}
		keysToDelete.forEach((key) => this.#memberCapIdCache.delete(key));
	}

	/**
	 * Get user's member cap ID for a specific channel
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns Member cap ID
	 */
	async #getUserMemberCapId(userAddress: string, channelId: string): Promise<string> {
		// Check cache first
		const cacheKey = `${userAddress}:${channelId}`;
		const cachedMemberCapId = this.#memberCapIdCache.get(cacheKey);
		if (cachedMemberCapId) {
			// Move to end to mark as recently used (LRU)
			this.#memberCapIdCache.delete(cacheKey);
			this.#memberCapIdCache.set(cacheKey, cachedMemberCapId);
			return cachedMemberCapId;
		}

		// Get all memberships for the user
		let memberships = await this.getChannelMemberships({ address: userAddress });
		let membership = memberships.memberships.find((m) => m.channel_id === channelId);

		// If not found in first page and there are more pages, search through all pages
		while (!membership && memberships.hasNextPage) {
			memberships = await this.getChannelMemberships({
				address: userAddress,
				cursor: memberships.cursor,
			});
			membership = memberships.memberships.find((m) => m.channel_id === channelId);
		}

		if (!membership) {
			throw new MessagingClientError(`User ${userAddress} is not a member of channel ${channelId}`);
		}

		// Cache the result and enforce size limit
		this.#memberCapIdCache.set(cacheKey, membership.member_cap_id);
		this.#enforceCacheSizeLimit();
		return membership.member_cap_id;
	}

	/**
	 * Get encryption key from channel
	 * @param channel - The channel object
	 * @returns Encrypted symmetric key
	 */
	async #getEncryptionKeyFromChannel(channel: ParsedChannelObject): Promise<EncryptedSymmetricKey> {
		const encryptedKeyBytes = channel.encryption_key_history.latest;
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

	// ===== Cache Management =====

	/**
	 * Clear all caches
	 */
	clearCaches(): void {
		this.#memberCapIdCache.clear();
	}

	/**
	 * Clear cache for a specific user
	 * @param userAddress - The user's address
	 */
	clearUserCache(userAddress: string): void {
		this.#invalidateUserCache(userAddress);
	}

	/**
	 * Clear cache for a specific channel
	 * @param channelId - The channel ID
	 */
	clearChannelCache(channelId: string): void {
		this.#invalidateChannelCache(channelId);
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
		// const contents = await this.#getObjectContents(validObjects);
		// Check if #suiClient is SuiGrpcClient
		let awaitedContents: Uint8Array[];
		if (this.#suiClient instanceof SuiGrpcClient) {
			const objectResponses = await this.#suiClient.core.getObjects({
				objectIds: validObjects.map((obj) => obj.id),
			});
			awaitedContents = await Promise.all(
				objectResponses.objects.map(async (obj) => {
					if (obj instanceof Error || !obj.content) {
						throw new MessagingClientError('Failed to get object contents');
					}
					return await obj.content;
				}),
			);
		} else {
			awaitedContents = await Promise.all(validObjects.map(async (obj) => await obj.content));
		}

		// const awaitedContents = this.#suiClient instanceof SuiGrpcClient ? await this.#suiClient.core.getObjects(
		// 	{ objectIds: validObjects.map((obj) => obj.id) }
		// ).then((res) => res.objects) : await Promise.all(validObjects.map(async (obj) => await obj.content));

		// Parse all MemberCaps
		const memberships = await Promise.all(
			awaitedContents.map(async (content) => {
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
		const channelObjects = await this.getChannelObjectsByChannelIds({
			channelIds: membershipsPaginated.memberships.map((m) => m.channel_id),
			userAddress: request.address,
			memberCapIds: membershipsPaginated.memberships.map((m) => m.member_cap_id),
		});

		return {
			hasNextPage: membershipsPaginated.hasNextPage,
			cursor: membershipsPaginated.cursor,
			channelObjects,
		};
	}

	/**
	 * Get channel objects by channel IDs (returns decrypted data)
	 * @param request - Request with channel IDs and user address, and optionally memberCapIds
	 * @returns Decrypted channel objects
	 */
	async getChannelObjectsByChannelIds(
		request: GetChannelObjectsByChannelIdsRequest,
	): Promise<DecryptedChannelObject[]> {
		const { channelIds, userAddress, memberCapIds } = request;

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

		// Decrypt each channel's last_message if it exists
		const decryptedChannels = await Promise.all(
			parsedChannels.map(async (channel, index) => {
				const decryptedChannel: DecryptedChannelObject = {
					...channel,
					last_message: null,
				};

				// Decrypt last_message if it exists
				if (channel.last_message) {
					try {
						// Use provided memberCapId or fetch it
						const memberCapId =
							memberCapIds?.[index] || (await this.#getUserMemberCapId(userAddress, channel.id.id));
						const encryptedKey = await this.#getEncryptionKeyFromChannel(channel);
						const decryptedMessage = await this.#decryptMessage(
							channel.last_message,
							channel.id.id,
							memberCapId,
							encryptedKey,
						);
						decryptedChannel.last_message = decryptedMessage;
					} catch (error) {
						// If decryption fails, set last_message to null
						console.warn(`Failed to decrypt last message for channel ${channel.id.id}:`, error);
						decryptedChannel.last_message = null;
					}
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
		// TODO: cache memberCapID
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

	// ===== Write Path =====

	/**
	 * Create a channel creation flow
	 *
	 * @usage
	 * ```
	 * const flow = client.createChannelFlow();
	 *
	 * // Step-by-step execution
	 * // 1. build
	 * const tx = flow.build();
	 * // 2. getGeneratedCaps
	 * const { creatorCap, creatorMemberCap, additionalMemberCaps } = await flow.getGeneratedCaps({ digest });
	 * // 3. generateAndAttachEncryptionKey
	 * const { transaction, creatorCap, encryptedKeyBytes } = await flow.generateAndAttachEncryptionKey({ creatorCap, creatorMemberCap });
	 * // 4. getGeneratedEncryptionKey
	 * const { channelId, encryptedKeyBytes } = await flow.getGeneratedEncryptionKey({ creatorCap, encryptedKeyBytes });
	 * ```
	 *
	 * @param opts - Options including creator address and initial members
	 * @returns Channel creation flow with step-by-step methods
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
	 * Execute a create channel transaction
	 * @param params - Transaction parameters including signer and optional initial members
	 * @returns Transaction digest, channel ID, creator cap ID, and encrypted key
	 */
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

		// Invalidate cache for the creator since they now have a new channel
		this.#invalidateUserCache(signer.toSuiAddress());

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

		// Check if we're using gRPC client
		const isGrpcClient = this.#suiClient.constructor.name === 'SuiGrpcClient';

		if (isGrpcClient) {
			// For gRPC clients, use a custom execution flow
			return await this.#executeTransactionGrpc(transaction, signer, action, waitForTransaction);
		} else {
			// For JSON-RPC clients, use the standard flow
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

	async #executeTransactionGrpc(
		transaction: Transaction,
		signer: Signer,
		action: string,
		waitForTransaction: boolean = true,
	) {
		console.log('=== Starting gRPC transaction execution ===');

		// Build the transaction with our gRPC-compatible client
		console.log('Building transaction...');
		const transactionDataBytes = await transaction.build({ client: this.#suiClient });
		console.log('Transaction built successfully, bytes length:', transactionDataBytes.length);

		// Sign the transaction - this returns SenderSignedData bytes as base64 string
		console.log('Signing transaction...');
		const { signature, bytes } = await signer.signTransaction(transactionDataBytes);
		console.log('Transaction signed successfully');

		// Convert the base64 string back to Uint8Array for the gRPC client
		const senderSignedDataBytes = fromBase64(bytes);

		// Use the gRPC client's executeTransaction with the SenderSignedData bytes
		console.log('Executing transaction via gRPC...');
		const response = await this.#suiClient.core.executeTransaction({
			transaction: senderSignedDataBytes, // SenderSignedData bytes
			signatures: [signature], // Array of signature strings
		});
		console.log('Transaction executed successfully');

		if (response.transaction?.effects?.status?.error) {
			throw new MessagingClientError(
				`Failed to ${action}: ${response.transaction.effects.status.error}`,
			);
		}

		if (waitForTransaction) {
			await this.#suiClient.core.waitForTransaction({
				digest: response.transaction.digest,
			});
		}

		return {
			digest: response.transaction.digest,
			effects: response.transaction.effects,
		};
	}

	/**
	 * Creates a gRPC client proxy that intercepts resolveTransactionPlugin calls
	 */
	#createGrpcCompatibleClientOld(originalClient: any) {
		// Check if this is already a gRPC client
		if (originalClient.constructor.name !== 'SuiGrpcClient') {
			return originalClient;
		}

		console.log('Creating gRPC client proxy for executeTransaction and resolveTransactionPlugin');

		// Define gas configuration helper functions locally
		async function setGasPrice(transactionData: any, client: SuiGrpcClient) {
			if (!transactionData.gasConfig.price) {
				try {
					const gasPrice = await client.core.getReferenceGasPrice();
					transactionData.gasConfig.price = String(gasPrice.referenceGasPrice);
				} catch (error) {
					console.warn('Failed to get reference gas price, using default:', error);
					transactionData.gasConfig.price = '1000'; // Default gas price
				}
			}
		}

		async function setGasBudget(transactionData: any, client: SuiGrpcClient) {
			if (transactionData.gasConfig.budget) {
				return;
			}

			try {
				// For gRPC clients, we'll use a simpler approach - set a reasonable default
				const defaultGasBudget = 100000000; // 0.1 SUI
				transactionData.gasConfig.budget = String(defaultGasBudget);
				console.log('Set default gas budget:', defaultGasBudget);
			} catch (error) {
				console.warn('Failed to set gas budget, using default:', error);
				transactionData.gasConfig.budget = '100000000'; // 0.1 SUI default
			}
		}

		async function setGasPayment(transactionData: any, client: SuiGrpcClient) {
			if (transactionData.gasConfig.payment && transactionData.gasConfig.payment.length > 0) {
				return;
			}

			try {
				const owner = transactionData.gasConfig.owner || transactionData.sender;
				if (!owner) {
					throw new Error('No sender or owner found for gas payment');
				}

				const coins = await client.core.getCoins({
					address: owner,
					coinType: SUI_TYPE_ARG, // SUI coin type
				});

				if (!coins.objects || coins.objects.length === 0) {
					throw new Error('No SUI coins found for gas payment');
				}

				// Get full object details to get the digest
				const coinObjectIds = coins.objects.map((coin) => coin.id);
				const coinObjects = await client.core.getObjects({
					objectIds: coinObjectIds,
				});

				// Filter out coins that are also used as input and map to payment format
				const paymentCoins = coins.objects
					.map((coin, index) => {
						const fullObject = coinObjects.objects[index];
						if (fullObject instanceof Error || !fullObject) {
							console.warn(`Failed to get full object for coin ${coin.id}`);
							return null;
						}

						// Check if this coin is used as input
						const matchingInput = transactionData.inputs.find((input: any) => {
							if (input.Object?.ImmOrOwnedObject) {
								return coin.id === input.Object.ImmOrOwnedObject.objectId;
							}
							return false;
						});

						if (matchingInput) {
							return null; // Skip this coin as it's used as input
						}

						return {
							objectId: coin.id,
							digest: fullObject.digest,
							version: coin.version,
						};
					})
					.filter((coin) => coin !== null);

				if (paymentCoins.length === 0) {
					throw new Error('No valid gas coins found for the transaction');
				}

				transactionData.gasConfig.payment = paymentCoins;
				console.log('Set gas payment coins:', paymentCoins.length);
			} catch (error) {
				console.warn('Failed to set gas payment:', error);
				throw new Error('Could not set gas payment for transaction');
			}
		}

		// Create a new client object with the same prototype and properties
		const proxiedClient = Object.create(Object.getPrototypeOf(originalClient));
		Object.assign(proxiedClient, originalClient);

		// Override resolveTransactionPlugin
		proxiedClient.core.resolveTransactionPlugin = () => {
			return async function (
				transactionData: TransactionDataBuilder,
				options: BuildTransactionOptions,
				next: () => Promise<void>,
			) {
				console.log('=== gRPC Plugin Started ===');
				console.log('transactionData.inputs.length:', transactionData.inputs.length);
				console.log('options.onlyTransactionKind:', options.onlyTransactionKind);

				try {
					// Handle object resolution
					// for (const input of transactionData.inputs) {
					// 	console.log('Processing input:', input);
					// 	if (input.UnresolvedObject) {
					// 		console.log('Found UnresolvedObject:', input.UnresolvedObject.objectId);
					// 		try {
					// 			const objectResponse = await originalClient.core.getObject({
					// 				objectId: input.UnresolvedObject.objectId,
					// 			});

					// 			if (objectResponse && !(objectResponse instanceof Error)) {
					// 				console.log('Successfully resolved object:', input.UnresolvedObject.objectId);
					// 				if (
					// 					objectResponse.object.owner &&
					// 					typeof objectResponse.object.owner === 'object' &&
					// 					'Shared' in objectResponse.object.owner
					// 				) {
					// 					(input as any).Object = {
					// 						SharedObject: {
					// 							objectId: input.UnresolvedObject.objectId,
					// 							initialSharedVersion:
					// 								objectResponse.object.owner.Shared.initialSharedVersion,
					// 							mutable: true,
					// 						},
					// 					};
					// 				} else {
					// 					(input as any).Object = {
					// 						ImmOrOwnedObject: {
					// 							objectId: input.UnresolvedObject.objectId,
					// 							version: objectResponse.object.version,
					// 							digest: objectResponse.object.digest,
					// 						},
					// 					};
					// 				}
					// 				delete (input as any).UnresolvedObject;
					// 			}
					// 		} catch (error) {
					// 			console.error('Failed to resolve object:', input.UnresolvedObject.objectId, error);
					// 			throw error;
					// 		}
					// 	} else if (input.UnresolvedPure) {
					// 		console.log('Found UnresolvedPure input');
					// 		throw new Error('UnresolvedPure inputs not supported with gRPC client yet');
					// 	}
					// }

					// Handle gas configuration
					if (!options.onlyTransactionKind) {
						console.log('Setting gas configuration...');
						await setGasPrice(transactionData, originalClient);
						await setGasBudget(transactionData, originalClient);
						await setGasPayment(transactionData, originalClient);
						console.log('Gas configuration completed');
					}

					console.log('=== gRPC Plugin completed successfully ===');
				} catch (error) {
					console.error('=== Error in gRPC Plugin ===', error);
					throw error;
				} finally {
					console.log('=== Calling next() ===');
					return await next();
					console.log('=== next() completed ===');
				}
			};
		};

		// Override executeTransaction with debug logging
		proxiedClient.core.executeTransaction = async function (
			options: Experimental_SuiClientTypes.ExecuteTransactionOptions,
		): Promise<Experimental_SuiClientTypes.ExecuteTransactionResponse> {
			console.log('=== gRPC executeTransaction called ===');
			console.log('Transaction bytes length:', options.transaction?.length);
			console.log('Signatures count:', options.signatures?.length);
			console.log('First signature:', options.signatures?.[0]);

			const { response } = await originalClient.transactionExecutionService.executeTransaction({
				transaction: {
					bcs: {
						value: options.transaction,
					},
				},
				signatures: options.signatures.map((signature) => ({
					bcs: {
						value: fromBase64(signature),
					},
					signature: {
						oneofKind: undefined,
					},
				})),
				readMask: {
					paths: [
						'transaction.digest',
						'transaction.transaction',
						'transaction.effects',
						'transaction.signatures',
					],
				},
			});

			console.log('=== gRPC response received ===');
			console.log('Response transaction:', response.transaction);
			console.log(
				'Response transaction.bcs.value length:',
				response.transaction?.bcs?.value?.length,
			);

			return {
				transaction: parseTransactionWithDebug(response.transaction!),
			};
		};

		// Debug version of parseTransaction
		function parseTransactionWithDebug(
			transaction: any,
		): Experimental_SuiClientTypes.TransactionResponse {
			console.log('=== parseTransactionWithDebug called ===');
			console.log('Transaction object:', transaction);
			console.log(
				'Transaction.transaction.bcs.value length:',
				transaction.transaction?.bcs?.value?.length,
			);

			// Check if this is already a parsed transaction (gRPC format)
			if (
				transaction.transaction &&
				transaction.transaction.bcs &&
				transaction.transaction.bcs.value
			) {
				console.log('Detected gRPC format - transaction already parsed');

				// The gRPC response already contains the parsed transaction data
				// We need to reconstruct the response in the expected format
				const objectTypes: Record<string, string> = {};
				transaction.inputObjects?.forEach((object: any) => {
					if (object.objectId && object.objectType) {
						objectTypes[object.objectId] = object.objectType;
					}
				});

				transaction.outputObjects?.forEach((object: any) => {
					if (object.objectId && object.objectType) {
						objectTypes[object.objectId] = object.objectType;
					}
				});

				console.log('=== parseTransactionWithDebug completed successfully (gRPC format) ===');

				return {
					digest: transaction.digest!,
					epoch: transaction.effects?.epoch?.toString() ?? null,
					effects: transaction.effects,
					objectTypes: Promise.resolve(objectTypes),
					transaction: {
						...transaction.transaction,
						bcs: transaction.transaction.bcs.value, // Use the BCS bytes directly
					},
					signatures: transaction.signatures,
				};
			}

			// Fallback to original parsing logic for other formats
			const bcsValue = transaction.bcs?.value;

			if (!bcsValue) {
				console.error('ERROR: No BCS data found in transaction!');
				console.error('Available keys:', Object.keys(transaction));
				throw new Error('No BCS data found in transaction');
			}

			try {
				console.log('Attempting to parse SenderSignedData...');
				const parsedTx = bcs.SenderSignedData.parse(bcsValue)[0];
				console.log('Successfully parsed SenderSignedData:', parsedTx);
				console.log('parsedTx.intentMessage:', parsedTx.intentMessage);
				console.log('parsedTx.intentMessage.value:', parsedTx.intentMessage?.value);

				if (!parsedTx.intentMessage?.value) {
					console.error('ERROR: parsedTx.intentMessage.value is undefined!');
					throw new Error('parsedTx.intentMessage.value is undefined');
				}

				const bytes = bcs.TransactionData.serialize(parsedTx.intentMessage.value).toBytes();
				const data = TransactionDataBuilder.restore({
					version: 2,
					sender: parsedTx.intentMessage.value.V1.sender,
					expiration: parsedTx.intentMessage.value.V1.expiration,
					gasData: parsedTx.intentMessage.value.V1.gasData,
					inputs: parsedTx.intentMessage.value.V1.kind.ProgrammableTransaction!.inputs,
					commands: parsedTx.intentMessage.value.V1.kind.ProgrammableTransaction!.commands,
				});

				const objectTypes: Record<string, string> = {};
				transaction.inputObjects?.forEach((object: any) => {
					if (object.objectId && object.objectType) {
						objectTypes[object.objectId] = object.objectType;
					}
				});

				transaction.outputObjects?.forEach((object: any) => {
					if (object.objectId && object.objectType) {
						objectTypes[object.objectId] = object.objectType;
					}
				});

				console.log('=== parseTransactionWithDebug completed successfully (parsed format) ===');

				return {
					digest: transaction.digest!,
					epoch: transaction.effects?.epoch?.toString() ?? null,
					effects: transaction.effects,
					objectTypes: Promise.resolve(objectTypes),
					transaction: {
						...data,
						bcs: bytes,
					},
					signatures: parsedTx.txSignatures,
				};
			} catch (error) {
				console.error('ERROR in parseTransactionWithDebug:', error);
				console.error('Transaction data that failed to parse:', {
					bcsValue: bcsValue,
					bcsValueLength: bcsValue?.length,
					bcsValueType: typeof bcsValue,
				});
				throw error;
			}
		}

		return proxiedClient;
	}

	#createGrpcCompatibleClient(originalClient: any) {
		// Check if this is already a gRPC client
		if (originalClient.constructor.name !== 'SuiGrpcClient') {
			return originalClient;
		}

		console.log('Creating gRPC client wrapper');
		const originalGrpcClient: SuiGrpcClient = originalClient;

		// Create a simple wrapper that overrides only what we need
		const wrapper = Object.create(originalGrpcClient);

		// Override resolveTransactionPlugin
		wrapper.core.resolveTransactionPlugin = () => {
			return async function (transactionData: any, options: any, next: () => Promise<void>) {
				// Set gas configuration
				if (!options.onlyTransactionKind) {
					if (!transactionData.gasConfig) {
						transactionData.gasConfig = {};
					}

					// Set gas price
					if (!transactionData.gasConfig.price) {
						transactionData.gasConfig.price = 1000n;
					}

					// Set gas budget
					if (!transactionData.gasConfig.budget) {
						transactionData.gasConfig.budget = 100000000n;
					}

					// Set gas payment
					if (!transactionData.gasConfig.payment) {
						const owner = transactionData.gasConfig.owner || transactionData.sender;
						if (!owner) {
							throw new Error('No sender or owner found for gas payment');
						}
						const coins = await originalGrpcClient.core.getCoins({
							address: owner,
							coinType: SUI_TYPE_ARG, // SUI coin type
						});

						if (!coins.objects || coins.objects.length === 0) {
							throw new Error('No SUI coins found for gas payment');
						}

						// Get full object details to get the digest
						const coinObjectIds = coins.objects.map((coin) => coin.id);
						const coinObjects = await originalGrpcClient.core.getObjects({
							objectIds: coinObjectIds,
						});

						// Filter out coins that are also used as input and map to payment format
						const paymentCoins = coins.objects
							.map((coin, index) => {
								const fullObject = coinObjects.objects[index];
								if (fullObject instanceof Error || !fullObject) {
									console.warn(`Failed to get full object for coin ${coin.id}`);
									return null;
								}

								// Check if this coin is used as input
								const matchingInput = transactionData.inputs.find((input: any) => {
									if (input.Object?.ImmOrOwnedObject) {
										return coin.id === input.Object.ImmOrOwnedObject.objectId;
									}
									return false;
								});

								if (matchingInput) {
									return null; // Skip this coin as it's used as input
								}

								return {
									objectId: coin.id,
									digest: fullObject.digest,
									version: coin.version,
								};
							})
							.filter((coin) => coin !== null);

						if (paymentCoins.length === 0) {
							throw new Error('No valid gas coins found for the transaction');
						}

						transactionData.gasConfig.payment = paymentCoins;
					}
				}

				return await next();
			};
		};
		// Override resolveTransactionPlugin with minimal gas config
		// wrapper.core.resolveTransactionPlugin = () => {
		// 	return async function (transactionData: any, options: any, next: () => Promise<void>) {
		// 		// Only set gas config if needed
		// 		if (!options.onlyTransactionKind && !transactionData.gasConfig) {
		// 			transactionData.gasConfig = {
		// 				price: 1000n, // Fixed gas price
		// 				budget: 100000000n, // Fixed gas budget (0.1 SUI)
		// 				payment: [], // Will be set by the transaction builder
		// 			};
		// 		}

		// 		return await next();
		// 	};
		// };

		// Override executeTransaction to bypass the buggy parseTransaction
		wrapper.core.executeTransaction = async (options: any) => {
			// Call the original gRPC service directly
			const { response } = await originalGrpcClient.transactionExecutionService.executeTransaction({
				transaction: {
					bcs: {
						value: options.transaction,
					},
				},
				signatures: options.signatures.map((signature: string) => ({
					bcs: {
						value: fromBase64(signature),
					},
					signature: {
						oneofKind: undefined,
					},
				})),
				readMask: {
					paths: [
						'transaction.digest',
						'transaction.transaction',
						'transaction.effects',
						'transaction.signatures',
					],
				},
			});

			// Return the response directly without going through parseTransaction
			// The gRPC response already has the correct structure
			return {
				transaction: {
					digest: response.transaction?.digest,
					effects: response.transaction?.effects,
					// Add any other fields you need from the response
				},
			};
		};

		return wrapper;
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
		console.log('objects length: ', objects.length);

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

			console.log('batchContents length: ', batchContents.length);

			return batchContents;
		}

		// Filter out null values and return
		return contents.filter((content): content is Uint8Array => content !== null);
	}
}
