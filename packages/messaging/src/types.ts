// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ClientWithExtensions,
	Experimental_CoreClient,
	Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';
import {
	AttachmentMetadata,
	EncryptedSymmetricKey,
	SealApproveContract,
	SessionKeyConfig,
} from './encryption';
import { SealClient, SessionKey } from '@mysten/seal';
import { WalrusClient } from '@mysten/walrus';
import { MemberCap } from './contracts/sui_messaging/member_cap';
import { Transaction } from '@mysten/sui/dist/cjs/transactions';
import { CreatorCap } from './contracts/sui_messaging/creator_cap';
import { StorageAdapter } from './storage/adapters/storage';
import { Channel } from './contracts/sui_messaging/channel';
import { Message } from './contracts/sui_messaging/message';

export type MessagingClientExtensionOptions =
	| {
			packageConfig?: MessagingPackageConfig;
			network?: 'mainnet' | 'testnet';
			storage?: (client: ClientWithExtensions<any>) => StorageAdapter;
			sessionKeyConfig?: SessionKeyConfig;
	  }
	| {
			packageConfig?: MessagingPackageConfig;
			network?: 'mainnet' | 'testnet';
			storage?: (client: ClientWithExtensions<any>) => StorageAdapter;
			sessionKey?: SessionKey;
	  };

export interface MessagingClientOptions {
	suiClient: MessagingCompatibleClient;
	storage: (client: MessagingCompatibleClient) => StorageAdapter;
	packageConfig?: MessagingPackageConfig;
	network?: 'mainnet' | 'testnet';
	sessionKeyConfig?: SessionKeyConfig;
	sessionKey?: SessionKey;
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

export interface MessagingPackageConfig {
	packageId: string;
	memberCapType: string;
	sealApproveContract: SealApproveContract;
	sealSessionKeyTTLmins: number;
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

export interface MessagesCursor {
	// The messages count at the time the cursor was created
	messagesCountAtTime: bigint;
	// The range of message indices we've fetched
	fetchedRange: {
		startIndex: bigint; // inclusive
		endIndex: bigint; // exclusive
	};
	// Timestamp
	createdAt: number;
}

export interface GetLatestMessagesRequest {
	channelId: string;
	cursor?: MessagesCursor;
	limit?: number; // default: 50
}

export interface GetPreviousMessagesRequest {
	channelId: string;
	cursor: MessagesCursor; // Required for previous messages
	limit?: number; // default: 50
}

export interface MessagesResponse {
	messages: ParsedMessageObject[];
	cursor: MessagesCursor;
	hasNextPage: boolean; // true if there are older messages available
}

export interface LazyDecryptAttachmentResult extends AttachmentMetadata {
	// The actual data - lazy-loaded via promise
	data: Promise<Uint8Array<ArrayBuffer>>;
}

export interface DecryptMessageResult {
	text: string;
	attachments?: LazyDecryptAttachmentResult[];
}
