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
	generateEncryptedChannelDEK({ channelId }: GenerateEncryptedChannelDEKopts): Promise<Uint8Array<ArrayBuffer>>;
	encryptText({ text, sender, channelId, key }: EncryptTextOpts): Promise<EncryptedTextPayload>;
	decryptText({ ciphertext, nonce }: DecryptTextOpts): Promise<string>;
	encryptAttachment(opts: EncryptAttachmentOpts): Promise<EncryptedAttachmentPayload>;
	decryptAttachment(opts: DecryptAttachmentOpts): Promise<DecryptAttachmentResult>;
	decryptAttachmentMetadata(opts: DecryptAttachmentMetadataOpts): Promise<AttachmentMetadata>;
	decryptAttachmentData(opts: DecryptAttachmentDataOpts): Promise<Uint8Array<ArrayBuffer>>;
	// Convenience methods
	encryptMessage(opts: EncryptMessageOpts): Promise<EncryptedMessagePayload>;
	decryptMessage(opts: DecryptMessageOpts): Promise<DecryptMessageResult>;
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

export interface CommonEncryptOpts {
	channelId: string; // should be valid sui object id
	sender: string; // should be valid sui address
	key: EncryptedSymmetricKey; // encrypted key that needs decryption via Seal
	memberCapId: string; // required for Seal decryption
}

export interface GenerateEncryptedChannelDEKopts {
	channelId: string; // should be valid sui object id
}

export interface EncryptTextOpts extends CommonEncryptOpts {
	text: string;
}

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedTextPayload {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface DecryptTextOpts extends CommonEncryptOpts {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface EncryptAttachmentOpts extends CommonEncryptOpts {
	file: File;
}

export interface EncryptedAttachmentMetadata {
	encryptedFileName: Uint8Array<ArrayBuffer>;
	encryptedMimeType: Uint8Array<ArrayBuffer>;
	encryptedFileSize: Uint8Array<ArrayBuffer>;
}

export interface AttachmentMetadata {
	fileName: string;
	mimeType: string;
	fileSize: number;
}

export interface EncryptedAttachmentPayload extends EncryptedAttachmentMetadata {
	encryptedData: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface DecryptAttachmentMetadataOpts extends CommonEncryptOpts, EncryptedAttachmentMetadata {}
export interface DecryptAttachmentDataOpts extends CommonEncryptOpts {
	encryptedData: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface DecryptAttachmentOpts extends CommonEncryptOpts, EncryptedAttachmentPayload {}

export interface DecryptAttachmentResult extends AttachmentMetadata {
	data: Uint8Array<ArrayBuffer>;
}

export interface EncryptMessageOpts extends CommonEncryptOpts {
	text: string;
	attachments?: File[];
}

export interface EncryptedMessagePayload extends EncryptedTextPayload{
	attachments?: EncryptedAttachmentPayload[];
}

export interface DecryptMessageOpts extends CommonEncryptOpts {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	attachments?: EncryptedAttachmentPayload[];
}

export interface DecryptMessageResult {
	text: string;
	attachments?: AttachmentMetadata[];
}