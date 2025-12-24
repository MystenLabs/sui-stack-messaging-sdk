// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionResult } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import type { Experimental_SuiClientTypes } from '@mysten/sui/experimental';
import type { SessionKey } from '@mysten/seal';

import { getLogger, LOG_CATEGORIES } from './logging/index.js';

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
	AddedMemberCap,
	AddMembersOptions,
	AddMembersTransactionOptions,
	AddMembersWithAddress,
	ChannelMembershipsRequest,
	ChannelMembershipsResponse,
	ChannelMembersResponse,
	ChannelMember,
	CreateChannelFlow,
	CreateChannelFlowGetGeneratedCapsOpts,
	CreateChannelFlowOpts,
	DecryptedChannelObject,
	DecryptedChannelObjectsByAddressResponse,
	DecryptedMessagesResponse,
	DecryptMessageResult,
	ExecuteAddMembersTransactionOptions,
	GetChannelMessagesRequest,
	GetChannelObjectsByChannelIdsRequest,
	GetLatestMessagesRequest,
	LazyDecryptAttachmentResult,
	MessagingClientExtensionOptions,
	MessagingClientOptions,
	MessagingCompatibleClient,
	MessagingPackageConfig,
	ParsedChannelObject,
	ParsedMessageObject,
} from './types.js';
import {
	MAINNET_MESSAGING_PACKAGE_CONFIG,
	TESTNET_MESSAGING_PACKAGE_CONFIG,
	DEFAULT_SEAL_APPROVE_CONTRACT,
} from './constants.js';
import { MessagingClientError } from './error.js';
import type { StorageAdapter } from './storage/adapters/storage.js';
import { WalrusStorageAdapter } from './storage/adapters/walrus/walrus.js';
import type { EncryptedSymmetricKey, SealConfig } from './encryption/types.js';
import { EnvelopeEncryption } from './encryption/envelopeEncryption.js';

import type { RawTransactionArgument } from './contracts/utils/index.js';
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
	#sealConfig: SealConfig;
	// TODO: Leave the responsibility of caching to the caller
	// #encryptedChannelDEKCache: Map<string, EncryptedSymmetricKey> = new Map(); // channelId --> EncryptedSymmetricKey
	// #channelMessagesTableIdCache: Map<string, string> = new Map<string, string>(); // channelId --> messagesTableId

	constructor(public options: MessagingClientOptions) {
		this.#suiClient = options.suiClient;
		this.#storage = options.storage;

		// Initialize Seal config with defaults
		this.#sealConfig = {
			threshold: options.sealConfig?.threshold ?? 2, // Default threshold of 2
		};

		// Auto-detect network from client or use package config
		if (!options.packageConfig) {
			const network = this.#suiClient.network;
			switch (network) {
				case 'testnet':
					this.#packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
					break;
				case 'mainnet':
					this.#packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
					break;
				default:
					// Fallback to testnet for unrecognized networks
					this.#packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
					break;
			}
		} else {
			this.#packageConfig = options.packageConfig;
		}

		// Resolve sealApproveContract with defaults (use same packageId as messaging package)
		const sealApproveContract = this.#packageConfig.sealApproveContract ?? {
			packageId: this.#packageConfig.packageId,
			...DEFAULT_SEAL_APPROVE_CONTRACT,
		};

		// Initialize EnvelopeEncryption directly
		this.#envelopeEncryption = new EnvelopeEncryption({
			suiClient: this.#suiClient,
			sealApproveContract,
			sessionKey: options.sessionKey,
			sessionKeyConfig: options.sessionKeyConfig,
			sealConfig: this.#sealConfig,
		});
	}

	/** @deprecated use `messaging()` instead */
	static experimental_asClientExtension(options: MessagingClientExtensionOptions) {
		return {
			name: 'messaging' as const,
			register: (client: MessagingCompatibleClient) => {
				const sealClient = client.seal;

				if (!sealClient) {
					throw new MessagingClientError('SealClient extension is required for MessagingClient');
				}

				// Check if storage configuration is provided
				if (!('storage' in options) && !('walrusStorageConfig' in options)) {
					throw new MessagingClientError(
						'Either a custom storage adapter via "storage" option or explicit Walrus storage configuration via "walrusStorageConfig" option must be provided. Fallback to default Walrus endpoints is not supported.',
					);
				}

				// Auto-detect network from the client or use default package config
				let packageConfig = options.packageConfig;
				if (!packageConfig) {
					const network = client.network;
					switch (network) {
						case 'testnet':
							packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
							break;
						case 'mainnet':
							packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
							break;
						default:
							// Fallback to testnet if network is not recognized
							packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
							break;
					}
				}

				// Handle storage configuration
				const storage =
					'storage' in options
						? (c: MessagingCompatibleClient) => options.storage(c)
						: (c: MessagingCompatibleClient) => {
								// WalrusClient is optional - we can use WalrusStorageAdapter without it
								// In the future, when WalrusClient SDK is used, we can check for its presence and use different logic
								return new WalrusStorageAdapter(c, options.walrusStorageConfig);
							};

				return new SuiStackMessagingClient({
					suiClient: client,
					storage,
					packageConfig,
					sessionKey: 'sessionKey' in options ? options.sessionKey : undefined,
					sessionKeyConfig: 'sessionKeyConfig' in options ? options.sessionKeyConfig : undefined,
					sealConfig: options.sealConfig,
				});
			},
		};
	}

	// ===== Private Helper Methods =====

	/**
	 * Get user's member cap ID for a specific channel.
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns Member cap ID or throws if not found
	 */
	async #getUserMemberCapId(userAddress: string, channelId: string): Promise<string> {
		const memberCap = await this.getUserMemberCap(userAddress, channelId);
		if (!memberCap) {
			throw new MessagingClientError(`User ${userAddress} is not a member of channel ${channelId}`);
		}
		return memberCap.id.id;
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

		// Deduplicate memberships by channel_id to handle cases where a user has multiple MemberCaps for the same channel
		// This can occur if duplicate addresses were added during channel creation
		const seenChannelIds = new Set<string>();
		const deduplicatedMemberships = membershipsPaginated.memberships.filter((m) => {
			if (seenChannelIds.has(m.channel_id)) {
				return false;
			}
			seenChannelIds.add(m.channel_id);
			return true;
		});

		const channelObjects = await this.getChannelObjectsByChannelIds({
			channelIds: deduplicatedMemberships.map((m) => m.channel_id),
			userAddress: request.address,
			memberCapIds: deduplicatedMemberships.map((m) => m.member_cap_id),
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
		const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
		const { channelIds, userAddress, memberCapIds } = request;

		logger.debug('Fetching channel objects by IDs', {
			channelCount: channelIds.length,
			userAddress,
		});

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
						logger.warn('Failed to decrypt last message for channel', {
							channelId: channel.id.id,
							error: error instanceof Error ? error.message : String(error),
						});
						decryptedChannel.last_message = null;
					}
				}

				return decryptedChannel;
			}),
		);

		logger.info('Retrieved channel objects', {
			channelCount: decryptedChannels.length,
			channelIds: decryptedChannels.map((c) => c.id.id),
			userAddress,
		});

		return decryptedChannels;
	}

	/**
	 * Get the CreatorCap for a specific user and channel.
	 * Returns the CreatorCap if the user owns one for the specified channel, null otherwise.
	 *
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns CreatorCap object or null if not found
	 */
	async getCreatorCap(
		userAddress: string,
		channelId: string,
	): Promise<(typeof CreatorCap)['$inferType'] | null> {
		const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
		logger.debug('Fetching CreatorCap', { userAddress, channelId });

		const creatorCap = await this.#findOwnedObjectByChannelId(CreatorCap, userAddress, channelId);

		if (creatorCap) {
			logger.info('Found CreatorCap', {
				userAddress,
				channelId,
				creatorCapId: creatorCap.id.id,
			});
		} else {
			logger.debug('CreatorCap not found', { userAddress, channelId });
		}

		return creatorCap;
	}

	/**
	 * Get the MemberCap for a specific user and channel.
	 * Returns the MemberCap if the user owns one for the specified channel, null otherwise.
	 *
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns MemberCap object or null if not found
	 */
	async getUserMemberCap(
		userAddress: string,
		channelId: string,
	): Promise<(typeof MemberCap)['$inferType'] | null> {
		const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
		logger.debug('Fetching MemberCap', { userAddress, channelId });

		const memberCap = await this.#findOwnedObjectByChannelId(MemberCap, userAddress, channelId);

		if (memberCap) {
			logger.info('Found MemberCap', {
				userAddress,
				channelId,
				memberCapId: memberCap.id.id,
			});
		} else {
			logger.debug('MemberCap not found', { userAddress, channelId });
		}

		return memberCap;
	}

	/**
	 * Get all members of a channel
	 * @param channelId - The channel ID
	 * @returns Channel members with addresses and member cap IDs
	 */
	async getChannelMembers(channelId: string): Promise<ChannelMembersResponse> {
		const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
		logger.debug('Fetching channel members', { channelId });

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
				logger.warn('Failed to fetch MemberCap object', {
					channelId,
					error: obj instanceof Error ? obj.message : 'No content in object',
				});
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
						logger.warn('MemberCap is object-owned, skipping', {
							channelId,
							memberCapId: memberCap.id.id,
						});
						continue;
					} else {
						logger.warn('MemberCap has unknown ownership type', {
							channelId,
							ownerKind: obj.owner.$kind,
						});
						continue;
					}

					members.push({
						memberAddress,
						memberCapId: memberCap.id.id,
					});
				}
			} catch (error) {
				logger.warn('Failed to parse MemberCap object', {
					channelId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		logger.info('Retrieved channel members', {
			channelId,
			memberCount: members.length,
			memberCapIds: members.map((m) => m.memberCapId),
		});

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
		const logger = getLogger(LOG_CATEGORIES.CLIENT_READS);
		logger.debug('Fetching channel messages', { channelId, userAddress, cursor, limit, direction });

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
					logger.warn('Failed to decrypt message in channel', {
						channelId,
						sender: message.sender,
						error: error instanceof Error ? error.message : String(error),
					});
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
		logger.info('Retrieved channel messages', {
			channelId,
			messagesTableId,
			messageCount: decryptedMessages.length,
			fetchRange: `${fetchRange.startIndex}-${fetchRange.endIndex}`,
			cursor: nextPagination.cursor,
			hasNextPage: nextPagination.hasNextPage,
			direction,
		});

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
			const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);
			const tx = new Transaction();
			const config = tx.add(noneConfig());
			const [channel, creatorCap, creatorMemberCap] = tx.add(newChannel({ arguments: { config } }));

			// Add initial members if provided
			// Deduplicate addresses and filter out creator (who already gets a MemberCap automatically)
			const uniqueAddresses =
				initialMemberAddresses && initialMemberAddresses.length > 0
					? this.#deduplicateAddresses(initialMemberAddresses, creatorAddress)
					: [];
			if (initialMemberAddresses && uniqueAddresses.length !== initialMemberAddresses.length) {
				logger.warn(
					'Duplicate addresses or creator address detected in initialMemberAddresses. Creator automatically receives a MemberCap. Using unique non-creator addresses only.',
					{
						originalCount: initialMemberAddresses?.length,
						uniqueCount: uniqueAddresses.length,
						creatorAddress,
					},
				);
			}

			let memberCaps: RawTransactionArgument<string> | null = null;
			if (uniqueAddresses.length > 0) {
				memberCaps = tx.add(
					addMembers({
						arguments: {
							self: channel,
							memberCap: creatorMemberCap,
							n: uniqueAddresses.length,
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
							memberAddresses: tx.pure.vector('address', uniqueAddresses),
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
		const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);
		const senderAddress = signer.toSuiAddress();
		logger.debug('Sending message', {
			channelId,
			memberCapId,
			senderAddress,
			messageLength: message.length,
			attachmentCount: attachments?.length ?? 0,
		});

		const tx = new Transaction();
		const sendMessageTxBuilder = await this.sendMessage(
			channelId,
			memberCapId,
			senderAddress,
			message,
			encryptedKey,
			attachments,
		);
		await sendMessageTxBuilder(tx);
		const { digest, effects } = await this.#executeTransaction(tx, signer, 'send message', true);

		// Get the created Message object ID
		const messageId = effects.changedObjects.find((obj) => obj.idOperation === 'Created')?.id;
		if (messageId === undefined) {
			throw new MessagingClientError('Message id not found on the transaction effects');
		}

		logger.info('Message sent', {
			channelId,
			messageId,
			senderAddress,
			hasAttachments: (attachments?.length ?? 0) > 0,
			digest,
		});

		return { digest, messageId };
	}

	/**
	 * Add members to a channel
	 *
	 * @example
	 * ```ts
	 * // With creatorCapId
	 * tx.add(client.addMembers({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   creatorCapId
	 * }));
	 *
	 * // With address (auto-fetches CreatorCap)
	 * tx.add(client.addMembers({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   address: signer.toSuiAddress()
	 * }));
	 * ```
	 */
	addMembers(options: AddMembersOptions) {
		return async (tx: Transaction) => {
			const { channelId, memberCapId, newMemberAddresses } = options;
			const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);

			const uniqueAddresses = this.#deduplicateAddresses(newMemberAddresses);
			if (uniqueAddresses.length !== newMemberAddresses.length) {
				logger.warn('Duplicate addresses removed from newMemberAddresses.', {
					channelId,
					originalCount: newMemberAddresses.length,
					uniqueCount: uniqueAddresses.length,
				});
			}
			if (uniqueAddresses.length === 0) {
				logger.warn('No members to add after deduplication.', { channelId });
				return;
			}

			const creatorCapId = await this.#resolveCreatorCapId(options);

			const memberCaps = tx.add(
				addMembers({
					package: this.#packageConfig.packageId,
					arguments: {
						self: tx.object(channelId),
						memberCap: tx.object(memberCapId),
						n: uniqueAddresses.length,
					},
				}),
			);

			tx.add(
				transferMemberCaps({
					package: this.#packageConfig.packageId,
					arguments: {
						memberAddresses: tx.pure.vector('address', uniqueAddresses),
						memberCaps,
						creatorCap: tx.object(creatorCapId),
					},
				}),
			);
		};
	}

	/**
	 * Resolve creatorCapId from options - either use provided value or fetch it by address.
	 */
	async #resolveCreatorCapId(options: AddMembersOptions): Promise<string> {
		if (options.creatorCapId) {
			return options.creatorCapId;
		}

		const { address, channelId } = options as AddMembersWithAddress;
		const creatorCap = await this.getCreatorCap(address, channelId);
		if (!creatorCap) {
			const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);
			logger.warn('CreatorCap not found for user', { address, channelId });
			throw new MessagingClientError(
				`User ${address} does not own a CreatorCap for channel ${channelId}`,
			);
		}
		return creatorCap.id.id;
	}

	/**
	 * Create a transaction that adds members to a channel
	 *
	 * @example
	 * ```ts
	 * // With creatorCapId
	 * const tx = await client.addMembersTransaction({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   creatorCapId
	 * });
	 *
	 * // With address (auto-fetches CreatorCap)
	 * const tx = await client.addMembersTransaction({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   address: '0x...'
	 * });
	 * ```
	 */
	async addMembersTransaction({
		transaction = new Transaction(),
		...options
	}: AddMembersTransactionOptions): Promise<Transaction> {
		const addMembersTxBuilder = this.addMembers(options as AddMembersOptions);
		await addMembersTxBuilder(transaction);
		return transaction;
	}

	/**
	 * Execute a transaction that adds members to a channel.
	 * If `creatorCapId` is not provided, it will be auto-fetched using the signer's address.
	 *
	 * @example
	 * ```ts
	 * // With creatorCapId
	 * const { digest, addedMembers } = await client.executeAddMembersTransaction({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   creatorCapId,
	 *   signer
	 * });
	 *
	 * // Without creatorCapId (auto-fetches using signer's address)
	 * const { digest, addedMembers } = await client.executeAddMembersTransaction({
	 *   channelId,
	 *   memberCapId,
	 *   newMemberAddresses: ['0xabc...', '0xdef...'],
	 *   signer
	 * });
	 * // addedMembers contains { memberCap, ownerAddress } for each added member
	 * ```
	 */
	async executeAddMembersTransaction({
		signer,
		transaction,
		...options
	}: ExecuteAddMembersTransactionOptions): Promise<{
		digest: string;
		addedMembers: AddedMemberCap[];
	}> {
		const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);
		logger.debug('Adding members to channel', {
			channelId: options.channelId,
			newMemberAddresses: options.newMemberAddresses,
		});

		// If creatorCapId is not provided, use signer's address to fetch it
		const { channelId, memberCapId, newMemberAddresses, creatorCapId } = options;
		const addMembersOptions: AddMembersOptions = creatorCapId
			? { channelId, memberCapId, newMemberAddresses, creatorCapId }
			: { channelId, memberCapId, newMemberAddresses, address: signer.toSuiAddress() };

		const tx = transaction ?? new Transaction();
		const addMembersTxBuilder = this.addMembers(addMembersOptions);
		await addMembersTxBuilder(tx);

		const { digest, effects } = await this.#executeTransaction(tx, signer, 'add members', true);

		// Get the created MemberCap objects with owner info
		const memberCapsWithOwner = await this.#getCreatedObjectsByType({
			effects,
			objectTypeName: MemberCap.name,
			parseFunction: (content) => MemberCap.parse(content),
			errorMessage: `MemberCap objects not found in transaction effects for transaction (${digest})`,
		});

		// Extract owner addresses
		const addedMembers: AddedMemberCap[] = memberCapsWithOwner.map(({ object, owner }) => {
			let ownerAddress: string;
			if (owner.$kind === 'AddressOwner') {
				ownerAddress = owner.AddressOwner;
			} else if (owner.$kind === 'ObjectOwner') {
				ownerAddress = owner.ObjectOwner;
			} else if (owner.$kind === 'Shared') {
				ownerAddress = 'Shared';
			} else {
				ownerAddress = 'Immutable';
			}

			return {
				memberCap: object,
				ownerAddress,
			};
		});

		logger.info('Members added to channel', {
			channelId: options.channelId,
			addedMemberCount: addedMembers.length,
			memberCapIds: addedMembers.map((m) => m.memberCap.id.id),
			digest,
		});

		return { digest, addedMembers };
	}

	/**
	 * Update the external SessionKey instance (useful for React context updates)
	 * Only works when the client was configured with an external SessionKey
	 */
	updateSessionKey(newSessionKey: SessionKey): void {
		this.#envelopeEncryption.updateSessionKey(newSessionKey);
	}

	/**
	 * Force refresh the managed SessionKey (useful for testing or manual refresh)
	 * Only works when the client was configured with SessionKeyConfig
	 */
	async refreshSessionKey(): Promise<SessionKey> {
		return this.#envelopeEncryption.refreshSessionKey();
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
		const logger = getLogger(LOG_CATEGORIES.CLIENT_WRITES);
		const creatorAddress = signer.toSuiAddress();
		logger.debug('Creating channel', {
			creatorAddress,
			initialMemberCount: initialMembers?.length ?? 0,
		});

		const flow = this.createChannelFlow({
			creatorAddress,
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

		logger.info('Channel created', {
			channelId,
			creatorCapId: creatorCap.id.id,
			creatorAddress,
			memberCount: (initialMembers?.length ?? 0) + 1, // Including creator
			digest: keyDigest,
		});

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

		if (waitForTransaction) {
			await this.#suiClient.core.waitForTransaction({
				digest,
			});
		}

		return { digest, effects };
	}

	async #getGeneratedCaps(digest: string) {
		const {
			transaction: { effects },
		} = await this.#suiClient.core.waitForTransaction({
			digest,
		});

		// Get CreatorCap
		const creatorCapsWithOwner = await this.#getCreatedObjectsByType({
			effects,
			objectTypeName: CreatorCap.name,
			parseFunction: (content) => CreatorCap.parse(content),
			errorMessage: `CreatorCap object not found in transaction effects for transaction (${digest})`,
		});

		if (creatorCapsWithOwner.length === 0) {
			throw new MessagingClientError(
				`CreatorCap object not found in transaction effects for transaction (${digest})`,
			);
		}

		const { object: creatorCap, owner: creatorCapOwner } = creatorCapsWithOwner[0];

		// Get all MemberCaps with owner info
		const allMemberCapsWithOwner = await this.#getCreatedObjectsByType({
			effects,
			objectTypeName: MemberCap.name,
			parseFunction: (content) => MemberCap.parse(content),
			errorMessage: `MemberCap objects not found in transaction effects for transaction (${digest})`,
		});

		// Find the creator's member cap (same owner as CreatorCap)
		const creatorMemberCapWithOwner = allMemberCapsWithOwner.find(
			({ owner }) =>
				owner.$kind === 'AddressOwner' &&
				creatorCapOwner.$kind === 'AddressOwner' &&
				owner.AddressOwner === creatorCapOwner.AddressOwner,
		);

		if (!creatorMemberCapWithOwner) {
			throw new MessagingClientError(
				`CreatorMemberCap object not found in transaction effects for transaction (${digest})`,
			);
		}

		const creatorMemberCap = creatorMemberCapWithOwner.object;

		// Filter out the creator's member cap from additional member caps
		const additionalMemberCaps = allMemberCapsWithOwner
			.filter((item) => item.object.id.id !== creatorMemberCap.id.id)
			.map((item) => item.object);

		return {
			creatorCap,
			creatorMemberCap,
			additionalMemberCaps,
		};
	}

	/**
	 * Get created objects of a specific type from transaction effects
	 * @param effects - Transaction effects
	 * @param objectTypeName - The object type name (e.g., MemberCap.name)
	 * @param parseFunction - Function to parse the object content
	 * @param errorMessage - Error message if objects not found
	 * @returns Array of parsed objects with owner information
	 */
	async #getCreatedObjectsByType<T>({
		effects,
		objectTypeName,
		parseFunction,
		errorMessage,
	}: {
		effects: Experimental_SuiClientTypes.TransactionEffects;
		objectTypeName: string;
		parseFunction: (content: Uint8Array) => T;
		errorMessage: string;
	}): Promise<Array<{ object: T; owner: Experimental_SuiClientTypes.ObjectOwner }>> {
		const objectType = objectTypeName.replace(
			'@local-pkg/sui-stack-messaging',
			this.#packageConfig.packageId,
		);

		const createdObjectIds = effects.changedObjects
			.filter((object) => object.idOperation === 'Created' && object.outputState !== 'DoesNotExist')
			.map((object) => object.id);

		const createdObjects = await this.#suiClient.core.getObjects({
			objectIds: createdObjectIds,
		});

		const matchingObjects = createdObjects.objects.filter(
			(object) => !(object instanceof Error) && object.type === objectType,
		);

		const parsedObjectsWithOwner = await Promise.all(
			matchingObjects.map(async (objectResponse) => {
				if (objectResponse instanceof Error || !objectResponse.content) {
					throw new MessagingClientError(errorMessage);
				}
				const parsedObject = parseFunction(await objectResponse.content);
				return { object: parsedObject, owner: objectResponse.owner! };
			}),
		);
		return parsedObjectsWithOwner;
	}

	/**
	 * Deduplicate addresses and optionally filter out an excluded address
	 * @param addresses - Array of addresses to deduplicate
	 * @param excludeAddress - Optional address to filter out
	 * @returns Array of unique addresses, excluding the excluded address if provided
	 */
	#deduplicateAddresses(addresses: string[], excludeAddress?: string): string[] {
		const uniqueAddresses = [...new Set(addresses)];
		return excludeAddress
			? uniqueAddresses.filter((addr) => addr !== excludeAddress)
			: uniqueAddresses;
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
		const downloadAndDecrypt = async (): Promise<Uint8Array<ArrayBuffer>> => {
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

			return decryptedData.data;
		};

		return new Promise((resolve, reject) => {
			downloadAndDecrypt().then(resolve).catch(reject);
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
	 * Find an owned object by channel ID.
	 * Paginates through all owned objects of the given type until finding one with matching channel_id.
	 *
	 * @param struct - A MoveStruct with `name`, `parse`, and `$inferType` where the parsed type has `channel_id`
	 * @param ownerAddress - The address that owns the object
	 * @param channelId - The channel ID to match
	 * @returns The parsed object or null if not found
	 */
	async #findOwnedObjectByChannelId<
		T extends { channel_id: string; id: { id: string } },
		S extends { name: string; parse: (data: Uint8Array) => T },
	>(struct: S, ownerAddress: string, channelId: string): Promise<T | null> {
		const objectType = struct.name.replace(
			'@local-pkg/sui-stack-messaging',
			this.#packageConfig.packageId,
		);

		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const response = await this.#suiClient.core.getOwnedObjects({
				address: ownerAddress,
				cursor,
				type: objectType,
			});

			const validObjects = response.objects.filter(
				(obj): obj is Experimental_SuiClientTypes.ObjectResponse => !(obj instanceof Error),
			);

			if (validObjects.length > 0) {
				const contents = await this.#getObjectContents(validObjects);
				for (const content of contents) {
					const parsed = struct.parse(content);
					if (parsed.channel_id === channelId) {
						return parsed;
					}
				}
			}

			cursor = response.cursor;
			hasNextPage = response.hasNextPage;
		}

		return null;
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

/**
 * Creates a client extension for Sui Stack Messaging.
 *
 * @example
 * ```typescript
 * const client = new SuiClient({ url: '...' })
 *   .$extend(SealClient.asClientExtension({ serverConfigs: [...] }))
 *   .$extend(messaging({
 *     walrusStorageConfig: { publisher: '...', aggregator: '...', epochs: 1 },
 *     sessionKeyConfig: { address: '...', ttlMin: 30 },
 *   }));
 *
 * // Access messaging functionality
 * const { channelId } = await client.messaging.executeCreateChannelTransaction({ signer });
 * ```
 */
export function messaging(options: MessagingClientExtensionOptions) {
	return {
		name: 'messaging' as const,
		register: (client: MessagingCompatibleClient) => {
			const sealClient = client.seal;

			if (!sealClient) {
				throw new MessagingClientError('SealClient extension is required for MessagingClient');
			}

			// Check if storage configuration is provided
			if (!('storage' in options) && !('walrusStorageConfig' in options)) {
				throw new MessagingClientError(
					'Either a custom storage adapter via "storage" option or explicit Walrus storage configuration via "walrusStorageConfig" option must be provided. Fallback to default Walrus endpoints is not supported.',
				);
			}

			// Auto-detect network from the client or use default package config
			let packageConfig = options.packageConfig;
			if (!packageConfig) {
				const network = client.network;
				switch (network) {
					case 'testnet':
						packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
						break;
					case 'mainnet':
						packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
						break;
					default:
						// Fallback to testnet if network is not recognized
						packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
						break;
				}
			}

			// Handle storage configuration
			const storage =
				'storage' in options
					? (c: MessagingCompatibleClient) => options.storage(c)
					: (c: MessagingCompatibleClient) => {
							// WalrusClient is optional - we can use WalrusStorageAdapter without it
							// In the future, when WalrusClient SDK is used, we can check for its presence and use different logic
							return new WalrusStorageAdapter(c, options.walrusStorageConfig);
						};

			return new SuiStackMessagingClient({
				suiClient: client,
				storage,
				packageConfig,
				sessionKey: 'sessionKey' in options ? options.sessionKey : undefined,
				sessionKeyConfig: 'sessionKeyConfig' in options ? options.sessionKeyConfig : undefined,
				sealConfig: options.sealConfig,
			});
		},
	};
}
