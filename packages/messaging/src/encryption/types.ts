// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';

/**
 * Core encryption key types for the channel messaging system
 */

/**
 * Represents an encryption key that can be used for both encryption and decryption
 */
export interface SymmetricKey {
	bytes: Uint8Array;
	version: number;
}

/**
 * Represents a Key Encryption Key (KEK) used to wrap other keys
 */
export type KeyEncryptionKey = SymmetricKey & { $kind: 'kek' };

/**
 * Represents a Data Encryption Key (DEK) used to encrypt message content
 */
export type DataEncryptionKey = SymmetricKey & { $kind: 'dek' };

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedPayload {
	ciphertext: Uint8Array;
	nonce: Uint8Array;
	wrappedKey?: Uint8Array; // Present for double-layer encryption
	kekVersion: number;
}

/**
 * Provider for generating secure encryption keys
 */
export interface KeyProvider {
	generateKey(): Promise<Uint8Array>;
	generateNonce(): Uint8Array;
}

/**
 * Base interface for encryption operations
 */
export interface Encryptor {
	encrypt(plaintext: Uint8Array, key: SymmetricKey): Promise<EncryptedPayload>;
	decrypt(payload: EncryptedPayload, key: SymmetricKey): Promise<Uint8Array>;
}

/**
 * Extended interface for key wrapping operations
 */
export interface KeyWrapper {
	wrapKey(key: SymmetricKey, wrappingKey: KeyEncryptionKey): Promise<Uint8Array>;
	unwrapKey(
		wrappedKey: Uint8Array,
		wrappingKey: KeyEncryptionKey,
		sessionKey?: SessionKey,
		txBytes?: Uint8Array,
	): Promise<SymmetricKey>;
}
