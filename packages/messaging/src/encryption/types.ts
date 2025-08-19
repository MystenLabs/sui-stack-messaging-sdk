// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient } from '@mysten/seal';

export interface EnvelopeEncryptionOptions {
	deps: {
		sealClient: SealClient;
		encryptionPrimitives: EncryptionPrimitives;
	};
	opts: {
		encryptionLayersScheme:
			| 'ChannelOnly'
			| 'ChannelAndMessages'
			| 'ChannelAndMessagesAndAttachments';
		cacheChannelKeys?: boolean; // default true; cache per (channelId, kekVersion)
	};
}

/**
 * Interface for encryption primitives used in messaging encryption
 * Provides methods for key generation, key wrapping, and encryption/decryption
 */
export interface EncryptionPrimitives {
	generateKEK(length?: number): Promise<Uint8Array<ArrayBuffer>>;
	generateDEK(length?: number): Promise<Uint8Array<ArrayBuffer>>;
	generateNonce(length?: number): Uint8Array<ArrayBuffer>;
	deriveKey(
		baseKey: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		info: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;

	wrapKey(
		kek: Uint8Array<ArrayBuffer>,
		keyToWrap: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;
	unwrapKey(
		kek: Uint8Array<ArrayBuffer>,
		wrappedKey: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;

	encryptBytes(
		key: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		bytesToEncrypt: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;
	decryptBytes(
		key: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		encryptedBytes: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;
}

export interface MessagingEncryptor {
	encryptText({ text, sender, wrappedChannelKEK }: EncryptTextArgs): Promise<EncryptedTextPayload>;
	decryptText({ ciphertext, nonce, wrappedDEK }: DecryptTextArgs): Promise<string>;
	encryptAttachment(): void;
	decryptAttachment(): void;
	// Convenience methods
	encryptMessage(): void;
	decryptMessage(): void;
}

/**
 * Represents an encryption key that can be used for both encryption and decryption
 */
export interface SymmetricKey {
	bytes: Uint8Array<ArrayBuffer>;
	version: number;
}

export interface EncryptionPrimitivesConfig {
	keySize: number;
	nonceSize: number;
	kekAlgorithm: 'AES-KWP';
	dekAlgorithm: 'AES-GCM';
	wrapAlgorithm: 'AES-KWP';
	deriveKeyAlgorithm: 'HKDF';
}

export const TextEncryptionSchemeValue = {
	KEK_DIRECT: 'kek-direct',
	DEK_WRAPPED: 'dek-wrapped',
} as const;

export type TextEncryptionScheme =
	(typeof TextEncryptionSchemeValue)[keyof typeof TextEncryptionSchemeValue];

/**
 * Represents an encrypted payload along with its metadata
 */
export type EncryptedTextPayload =
	| {
			scheme: 'kek-direct';
			ciphertext: Uint8Array<ArrayBuffer>;
			nonce: Uint8Array<ArrayBuffer>;
			kekVersion: number;
	  }
	| {
			scheme: 'dek-wrapped';
			ciphertext: Uint8Array<ArrayBuffer>;
			nonce: Uint8Array<ArrayBuffer>;
			kekVersion: number;
			wrappedDek: Uint8Array<ArrayBuffer>;
	  };

export interface EncryptTextArgs {
	text: string;
	sender: string;
	wrappedChannelKEK: Uint8Array<ArrayBuffer>;
}

export interface DecryptTextArgs {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	wrappedDEK: Uint8Array<ArrayBuffer>;
}
