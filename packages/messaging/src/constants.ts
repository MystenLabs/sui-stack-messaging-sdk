// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { MessagingPackageConfig } from './types.js';

// Default fallback package ID for when environment variables are not available
const FALLBACK_PACKAGE_ID = '0x984960ebddd75c15c6d38355ac462621db0ffc7d6647214c802cd3b685e1af3d';

// Default Seal approve contract configurations - uses same package ID as messaging
// Note: packageId is not included here as it will be taken from the messaging package config
export const DEFAULT_SEAL_APPROVE_CONTRACT = {
	module: 'seal_policies',
	functionName: 'seal_approve',
};

export const TESTNET_MESSAGING_PACKAGE_CONFIG = {
	packageId: FALLBACK_PACKAGE_ID,
} satisfies MessagingPackageConfig;

export const MAINNET_MESSAGING_PACKAGE_CONFIG = {
	packageId: FALLBACK_PACKAGE_ID,
} satisfies MessagingPackageConfig;
