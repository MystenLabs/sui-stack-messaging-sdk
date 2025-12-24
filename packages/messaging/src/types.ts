// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
	ClientWithExtensions,
	Experimental_CoreClient,
	Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';
import type { SealClient, SessionKey } from '@mysten/seal';
import type { WalrusClient } from '@mysten/walrus';
import type { Transaction } from '@mysten/sui/transactions';
import type { Signer } from '@mysten/sui/cryptography';

import type {
	AttachmentMetadata,
	EncryptedSymmetricKey,
	SealApproveContract,
	SealConfig,
	SessionKeyConfig,
} from './encryption/types.js';

import type { MemberCap } from './contracts/sui_stack_messaging/member_cap.js';
import type { CreatorCap } from './contracts/sui_stack_messaging/creator_cap.js';
import type { StorageAdapter, StorageConfig } from './storage/adapters/storage.js';
import type { Channel } from './contracts/sui_stack_messaging/channel.js';
import type { Message } from './contracts/sui_stack_messaging/message.js';

// Base configuration shared by all variants
interface BaseMessagingClientExtensionOptions {
	packageConfig?: MessagingPackageConfig;
	/**
	 * Seal operation configuration (optional)
	 * Note: This configures Seal operation parameters, not key servers
	 * Key servers are configured separately via SealClient.asClientExtension()
	 */
	sealConfig?: SealConfig;
}

// Storage variants (mutually exclusive)
type StorageOptions =
	| { storage: (client: MessagingCompatibleClient) => StorageAdapter }
	| { walrusStorageConfig: StorageConfig };

// Seal session key variants (mutually exclusive)
type SealSessionKeyOptions = { sessionKey: SessionKey } | { sessionKeyConfig: SessionKeyConfig };

// Final type combining all variants with compile-time safety
export type MessagingClientExtensionOptions = BaseMessagingClientExtensionOptions &
	StorageOptions &
	SealSessionKeyOptions;

export interface MessagingClientOptions {
	suiClient: MessagingCompatibleClient;
	storage: (client: MessagingCompatibleClient) => StorageAdapter;
	packageConfig?: MessagingPackageConfig;
	sessionKeyConfig?: SessionKeyConfig;
	sessionKey?: SessionKey;
	sealConfig?: SealConfig;
}

// Create Channel Flow interfaces
export interface CreateChannelFlowOpts {
	creatorAddress: string;
	initialMemberAddresses?: string[];
}

export interface CreateChannelFlowGenerateAndAttachEncryptionKeyOpts {
	creatorMemberCap: (typeof MemberCap)['$inferType'];
}

export interface CreateChannelFlowGetGeneratedCapsOpts {
	digest: string; // Transaction digest from the channel creation transaction
}

export interface CreateChannelFlow {
	build: () => Transaction;
	getGeneratedCaps: (opts: CreateChannelFlowGetGeneratedCapsOpts) => Promise<{
		creatorCap: (typeof CreatorCap)['$inferType'];
		creatorMemberCap: (typeof MemberCap)['$inferType'];
		additionalMemberCaps: (typeof MemberCap)['$inferType'][];
	}>;
	generateAndAttachEncryptionKey: (
		opts: CreateChannelFlowGenerateAndAttachEncryptionKeyOpts,
	) => Promise<Transaction>;
	getGeneratedEncryptionKey: () => {
		channelId: string;
		encryptedKeyBytes: Uint8Array<ArrayBuffer>;
	};
}

// Add Members interfaces - base options shared by all variants
interface AddMembersBaseOptions {
	channelId: string;
	memberCapId: string;
	newMemberAddresses: string[];
}

// Variant 1: User provides the creatorCapId directly
export interface AddMembersWithCreatorCapId extends AddMembersBaseOptions {
	creatorCapId: string;
	address?: never;
}

// Variant 2: User provides their address to auto-fetch the CreatorCap
export interface AddMembersWithAddress extends AddMembersBaseOptions {
	creatorCapId?: never;
	/**
	 * The address to use for fetching the CreatorCap.
	 * Required when creatorCapId is not provided.
	 */
	address: string;
}

/**
 * Options for adding members to a channel.
 * Either provide `creatorCapId` directly, or provide `address` to auto-fetch the CreatorCap.
 */
export type AddMembersOptions = AddMembersWithCreatorCapId | AddMembersWithAddress;

export interface AddMembersTransactionOptions extends AddMembersBaseOptions {
	transaction?: Transaction;
	creatorCapId?: string;
	address?: string;
}

export interface ExecuteAddMembersTransactionOptions extends AddMembersBaseOptions {
	transaction?: Transaction;
	signer: Signer;
	creatorCapId?: string;
}

export interface AddedMemberCap {
	memberCap: (typeof MemberCap)['$inferType'];
	ownerAddress: string;
}

export interface MessagingPackageConfig {
	packageId: string;
	sealApproveContract?: SealApproveContract;
}

export type MessagingCompatibleClient = ClientWithExtensions<{
	core: Experimental_CoreClient;
	seal: SealClient;
	walrus?: WalrusClient;
}>;

type MessagingOwnedObjects = Omit<Experimental_SuiClientTypes.GetOwnedObjectsOptions, 'type'>;

export type PaginatedResponse<T> = T & {
	hasNextPage: boolean;
	cursor: string | null;
};

export type ChannelMembershipsRequest = MessagingOwnedObjects;

export type ParsedChannelObject = (typeof Channel)['$inferType'];
export type ParsedMessageObject = (typeof Message)['$inferType'];
export type Membership = { member_cap_id: string; channel_id: string };

export type ChannelMembershipsResponse = PaginatedResponse<{
	memberships: Membership[];
}>;

export type ChannelObjectsByMembershipsResponse = PaginatedResponse<{
	channelObjects: ParsedChannelObject[];
}>;

export interface GetChannelObjectsByChannelIdsRequest {
	channelIds: string[];
	userAddress: string; // The address of the user requesting the channel objects (needed for decryption)
	memberCapIds?: string[]; // Optional: member cap IDs for each channel (avoids individual lookups)
}

export type ChannelMember = {
	memberAddress: string;
	memberCapId: string;
};

export type ChannelMembersResponse = {
	members: ChannelMember[];
};

export type ChannelMessagesEncryptedRequest = Omit<
	Experimental_SuiClientTypes.GetDynamicFieldsOptions,
	'parentId'
> & {
	channelId: string;
};

export type ChannelMessagesEncryptedResponse = PaginatedResponse<{
	messageObjects: ParsedMessageObject[];
}>;

export type ChannelMessagesDecryptedRequest = ChannelMessagesEncryptedRequest & {
	encryptedKey: EncryptedSymmetricKey;
	memberCapId: string;
};

export interface PollingState {
	lastMessageCount: bigint;
	lastCursor: bigint | null;
	channelId: string;
}

export interface GetLatestMessagesRequest {
	channelId: string;
	userAddress: string; // The address of the user requesting the messages (needed for decryption)
	pollingState: PollingState;
	limit?: number; // default: 50
}

export interface GetChannelMessagesRequest {
	channelId: string;
	userAddress: string; // The address of the user requesting the messages (needed for decryption)
	cursor?: bigint | null; // The message index to start from
	limit?: number; // default: 50
	direction?: 'backward' | 'forward'; // default: 'backward'
}

export interface MessagesResponse {
	messages: ParsedMessageObject[];
	cursor: bigint | null;
	hasNextPage: boolean; // true if there are older messages available
	direction: 'backward' | 'forward'; // default: 'backward'
}

export interface LazyDecryptAttachmentResult extends AttachmentMetadata {
	// The actual data - lazy-loaded via promise
	data: Promise<Uint8Array<ArrayBuffer>>;
}

export interface DecryptMessageResult {
	text: string;
	sender: string;
	createdAtMs: string;
	attachments?: LazyDecryptAttachmentResult[];
}

// New types for decrypted data
export interface DecryptedMessage {
	text: string;
	sender: string;
	createdAtMs: string;
	attachments?: LazyDecryptAttachmentResult[];
}

export interface DecryptedChannelObject extends Omit<ParsedChannelObject, 'last_message'> {
	last_message?: DecryptedMessage | null;
}

export interface DecryptedMessagesResponse {
	messages: DecryptedMessage[];
	cursor: bigint | null;
	hasNextPage: boolean;
	direction: 'backward' | 'forward';
}

export interface DecryptedChannelObjectsByAddressResponse
	extends Omit<ChannelObjectsByMembershipsResponse, 'channelObjects'> {
	channelObjects: DecryptedChannelObject[];
}
