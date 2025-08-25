// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export interface SealApproveContract {
	packageId: string;
	module: string;
	functionName: string;
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
		aad: Uint8Array<ArrayBuffer>,
		bytesToEncrypt: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;
	decryptBytes(
		key: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		aad: Uint8Array<ArrayBuffer>,
		encryptedBytes: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>>;
}

export interface MessagingEncryptor {
	encryptText({ text, sender, channelId, key }: EncryptTextArgs): Promise<EncryptedTextPayload>;
	decryptText({ ciphertext, nonce }: DecryptTextArgs): Promise<string>;
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
	$kind: 'Unencrypted';
	bytes: Uint8Array<ArrayBuffer>;
	version: number;
}

/**
 * Represents an encrypted symmetric key that needs to be decrypted before use
 */
export interface EncryptedSymmetricKey {
	$kind: 'Encrypted';
	encryptedBytes: Uint8Array<ArrayBuffer>;
	version: number;
}

export type EncryptionKey = SymmetricKey | EncryptedSymmetricKey;

export interface EncryptionPrimitivesConfig {
	keySize: number;
	nonceSize: number;
	dekAlgorithm: 'AES-GCM';
}

// Additional Authenticated Data for encryption/decryption
// (channelId, keyVersion, sender)
export interface EncryptAAD {
	channelId: string; // should be valid sui object id
	keyVersion: number; // u32
	sender: string; // should be valid sui address
}

export interface EncryptTextArgs {
	text: string;
	channelId: string; // should be valid sui object id
	key: SymmetricKey; // must be provided for encryption
	sender: string; // should be valid sui address
}

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedTextPayload {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface DecryptTextArgs {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	channelId: string; // should be valid sui object id
	key: SymmetricKey; // must be provided for decryption
	sender: string; // should be valid sui address
}

export interface EncryptAttachmentArgs {
	file: File;
	sender: string;
	wrappedChannelKEK: Uint8Array<ArrayBuffer>;
}

export interface DecryptAttachmentArgs {}
