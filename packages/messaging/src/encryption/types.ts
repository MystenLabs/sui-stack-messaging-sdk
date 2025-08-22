// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient } from '@mysten/seal';

export interface EnvelopeEncryptionOptions {
	deps: {
		sealClient: SealClient;
		encryptionPrimitives: EncryptionPrimitives;
	};
	opts: {
		cacheChannelKeys?: boolean; // default true; cache per (channelId, kekVersion)
	};
}

/**
 * Interface for encryption primitives used in messaging encryption
 */
export interface EncryptionPrimitives {
	generateDEK(length?: number): Promise<Uint8Array<ArrayBuffer>>;
	generateNonce(length?: number): Uint8Array<ArrayBuffer>;
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
 * Represents an encryption key that can be used for both encryptin and decryption
 */
export interface SymmetricKey {
	bytes: Uint8Array<ArrayBuffer>;
	version: number;
}

export interface EncryptionPrimitivesConfig {
	keySize: number;
	nonceSize: number;
	dekAlgorithm: 'AES-GCM';
}

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedTextPayload {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	wrappedDek: Uint8Array<ArrayBuffer>;
	kekVersion: number;
}

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

export interface EncryptAttachmentArgs {
	file: File;
	sender: string;
	wrappedChannelKEK: Uint8Array<ArrayBuffer>;
}
