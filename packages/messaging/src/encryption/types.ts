// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient } from "@mysten/seal";

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
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedPayload {
	ciphertext: Uint8Array;
	nonce: Uint8Array;
	wrappedDek?: Uint8Array; // Present for double-layer encryption
	kekVersion: number;
}

export interface EncryptText {}

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
	encrypt(
		keyBytes: Uint8Array,
		data: Uint8Array,
		nonce: Uint8Array,
		aad: Uint8Array,
	): Promise<EncryptedPayload>;
	decrypt(payload: EncryptedPayload, key: SymmetricKey): Promise<Uint8Array>;
}

export interface EncryptTextArgs {
	text: string;
	sender: string;
	wrappedChannelKEK: Uint8Array;
}

export interface DecryptTextArgs {
	ciphertext: Uint8Array;
	nonce: Uint8Array;
	wrappedDEK: Uint8Array;
}

export interface EnvelopeEncryptionServiceOptions {
	sealClient: SealClient;
	keyProvider: KeyProvider;
	encryptionLayersScheme: "ChannelOnly" | "ChannelAndMessages" | "ChannelAndMessagesAndAttachments';
	cacheChannelKeys?: boolean; // default true; cache per (channelId, kekVersion)
}

export interface EnvelopeEncryptionService {
	encryptText(text: string): Promise<EncryptedPayload>;
	decryptText({
		ciphertext,
		nonce,
	}: {
		ciphertext: Uint8Array;
		nonce: Uint8Array;
		wrappedDEK: Uint8Array;
	}): Promise<string>;
	encryptAttachment(): void;
	decryptAttachment(): void;
	// Convenience methods
	encryptMessage(): void;
	decryptMessage(): void;
}"
