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
 * @example
 * ```typescript
 * import { configure, getConsoleSink } from "@logtape/logtape";
 * import { LOG_CATEGORIES } from "@mysten/messaging";
 *
 * await configure({
 *   sinks: { console: getConsoleSink() },
 *   loggers: [
 *     { category: LOG_CATEGORIES.ROOT, level: "info", sinks: ["console"] },
 *   ],
 * });
 * ```
 *
 * @see https://www.npmjs.com/package/@logtape/logtape for LogTape documentation
 */
export const LOG_CATEGORIES = {
	/**
	 * Root category for all Messaging SDK logs.
	 * Configure this to enable/disable all SDK logging.
	 */
	ROOT: ['@mysten/messaging'],

	/**
	 * Client read operations: fetching channels, messages, members, etc.
	 */
	CLIENT_READS: ['@mysten/messaging', 'client', 'reads'],

	/**
	 * Client write operations: creating channels, sending messages, adding members, etc.
	 */
	CLIENT_WRITES: ['@mysten/messaging', 'client', 'writes'],

	/**
	 * Encryption operations: envelope encryption, key generation, decryption.
	 */
	ENCRYPTION: ['@mysten/messaging', 'encryption'],

	/**
	 * All storage adapter operations.
	 */
	STORAGE: ['@mysten/messaging', 'storage'],

	/**
	 * Walrus-specific storage operations.
	 */
	STORAGE_WALRUS: ['@mysten/messaging', 'storage', 'walrus'],
};
