// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
  ClientWithExtensions,
  Experimental_CoreClient,
  Experimental_SuiClientTypes,
} from '@mysten/sui/experimental';

export interface MessagingPackageConfig {
  packageId: string;
  memberCapType: string;
}

export type MessagingCompatibleClient = ClientWithExtensions<{
  core: Experimental_CoreClient;
}>;

type MessagingOwnedObjects = Omit<Experimental_SuiClientTypes.GetOwnedObjectsOptions, 'type'>;

export type ChannelMembershipsRequest = MessagingOwnedObjects;
