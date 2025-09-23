// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import type { SealApproveContract } from './encryption/types.js';
import type { MessagingPackageConfig } from './types.js';

// Default Seal approve contract configurations - uses same package ID as messaging
export const DEFAULT_SEAL_APPROVE_CONTRACT: Record<'testnet' | 'mainnet', SealApproveContract> = {
	testnet: {
		packageId: process.env.TESTNET_PACKAGE_ID || '0xTBD',
		module: 'seal_policies',
		functionName: 'seal_approve',
	},
	mainnet: {
		packageId: process.env.MAINNET_PACKAGE_ID || '0xTBD',
		module: 'seal_policies',
		functionName: 'seal_approve',
	},
};

export const TESTNET_MESSAGING_PACKAGE_CONFIG = {
	packageId: process.env.TESTNET_PACKAGE_ID || '0xTBD',
} satisfies MessagingPackageConfig;

export const MAINNET_MESSAGING_PACKAGE_CONFIG = {
	packageId: process.env.MAINNET_PACKAGE_ID || '0xTBD',
} satisfies MessagingPackageConfig;
