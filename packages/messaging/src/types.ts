// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	ClientWithExtensions,
	Experimental_CoreClient,
	Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';
import { SealApproveContract } from './encryption';
import { SealClient } from '@mysten/seal';
import { WalrusClient } from '@mysten/walrus';

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

export type ChannelMembershipsRequest = MessagingOwnedObjects;
