// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * LogTape logging category constants for the Messaging SDK.
 *
 * Categories follow a hierarchical structure:
 * - Root: ["@mysten/messaging"]
 * - Client operations are split into reads and writes
 * - Module-specific categories for encryption and storage
 *
 * Users can configure logging at any level in the hierarchy.
 *
 * @see https://jsr.io/@logtape/logtape for LogTape documentation
 */
export const CATEGORIES = {
	/**
	 * Root category for all Messaging SDK logs.
	 * Configure this to enable/disable all SDK logging.
	 */
	ROOT: ['@mysten/messaging'] as const,

	/**
	 * Client read operations: fetching channels, messages, members, etc.
	 */
	CLIENT_READS: ['@mysten/messaging', 'client', 'reads'] as const,

	/**
	 * Client write operations: creating channels, sending messages, adding members, etc.
	 */
	CLIENT_WRITES: ['@mysten/messaging', 'client', 'writes'] as const,

	/**
	 * Encryption operations: envelope encryption, key generation, decryption.
	 */
	ENCRYPTION: ['@mysten/messaging', 'encryption'] as const,

	/**
	 * All storage adapter operations.
	 */
	STORAGE: ['@mysten/messaging', 'storage'] as const,

	/**
	 * Walrus-specific storage operations.
	 */
	STORAGE_WALRUS: ['@mysten/messaging', 'storage', 'walrus'] as const,
} as const;
