// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionResult } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';
import { deriveDynamicFieldID } from '@mysten/sui/utils';
import { bcs } from '@mysten/sui/bcs';
import type { Experimental_SuiClientTypes } from '@mysten/sui/experimental';
import type { SessionKey } from '@mysten/seal';

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

	private constructor(public options: MessagingClientOptions) {
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

	// TODO: Move to standalone function (pattern used in other Mysten TypeScript SDKs)
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
	 * Get user's member cap ID for a specific channel
	 * @param userAddress - The user's address
	 * @param channelId - The channel ID
	 * @returns Member cap ID
	 */
	async #getUserMemberCapId(userAddress: string, channelId: string): Promise<string> {
		let cursor: string | null = null;
		let hasNextPage = true;

		while (hasNextPage) {
			const memberships = await this.getChannelMemberships({
				address: userAddress,
				cursor,
			});

			const membership = memberships.memberships.find((m) => m.channel_id === channelId);

			if (membership) {
				return membership.member_cap_id;
			}

			cursor = memberships.cursor;
			hasNextPage = memberships.hasNextPage;
		}

		throw new MessagingClientError(`User ${userAddress} is not a member of channel ${channelId}`);
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
			// Deduplicate addresses and filter out creator (who already gets a MemberCap automatically)
			const uniqueAddresses =
				initialMemberAddresses && initialMemberAddresses.length > 0
					? [...new Set(initialMemberAddresses)].filter((addr) => addr !== creatorAddress)
					: [];
			if (initialMemberAddresses && uniqueAddresses.length !== initialMemberAddresses.length) {
				console.warn(
					'Duplicate addresses or creator address detected in initialMemberAddresses. Creator automatically receives a MemberCap. Using unique non-creator addresses only.',
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

		if (waitForTransaction) {
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
