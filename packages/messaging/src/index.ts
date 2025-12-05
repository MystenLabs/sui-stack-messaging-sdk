// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

// Main client class
export { SuiStackMessagingClient, messaging } from './client.js';

// Types
export type * from './types.js';

// Constants
export {
	MAINNET_MESSAGING_PACKAGE_CONFIG,
	TESTNET_MESSAGING_PACKAGE_CONFIG,
	DEFAULT_SEAL_APPROVE_CONTRACT,
} from './constants.js';

// Errors
export * from './error.js';

// Encryption types
export type {
	AttachmentMetadata,
	EncryptedSymmetricKey,
	SealApproveContract,
	SealConfig,
	SessionKeyConfig,
} from './encryption/types.js';

// Storage types
export type { StorageAdapter, StorageConfig, StorageOptions } from './storage/adapters/storage.js';

// Walrus types
export { WalrusStorageAdapter } from './storage/adapters/walrus/walrus.js';
export type * from './storage/adapters/walrus/types.js';

// Logging utilities (optional - requires @logtape/logtape peer dependency)
export { getLogger, LOG_CATEGORIES } from './logging/index.js';
