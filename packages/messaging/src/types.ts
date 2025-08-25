// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { BcsType } from '@mysten/sui/bcs';

import {
	ClientWithExtensions,
	Experimental_CoreClient,
	Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';
import { SealApproveContract } from './encryption';

export interface MessagingPackageConfig {
	packageId: string;
	memberCapType: string;
	sealApproveContract: SealApproveContract;
	sealSessionKeyTTLmins: number;
}

export type MessagingCompatibleClient = ClientWithExtensions<{
	core: Experimental_CoreClient;
}>;

type MessagingOwnedObjects = Omit<Experimental_SuiClientTypes.GetOwnedObjectsOptions, 'type'>;

export type ChannelMembershipsRequest = MessagingOwnedObjects;

export interface SendMessageOptions {
	channelId: string;
	memberCapId: string;
	// vector<u8>
	encryptedChannelKey: BcsType<
		number[],
		Iterable<number> & {
			length: number;
		},
		string
	>;
	messageText: string;
	attachments: File[];
}
