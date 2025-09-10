// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SessionKey } from '@mysten/seal';
import type { Signer } from '@mysten/sui/cryptography';
import type { MessagingCompatibleClient } from '../types.js';

export interface EnvelopeEncryptionConfig {
	suiClient: MessagingCompatibleClient;
	sealApproveContract: SealApproveContract;
	sessionKey?: SessionKey;
	sessionKeyConfig?: SessionKeyConfig;
	encryptionPrimitives?: EncryptionPrimitives;
}

export interface SessionKeyConfig {
	address: string;
	mvrName?: string;
	ttlMin: number;
	signer?: Signer;
}

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

/**
 * Represents an encryption key that can be used for both encryption and decryption
 */
export interface SymmetricKey {
	$kind: 'Unencrypted';
	bytes: Uint8Array<ArrayBuffer>;
	version: number;
}

export interface DecryptChannelDEKOpts {
	encryptedKey: EncryptedSymmetricKey;
	memberCapId: string; // should be valid sui object id
	channelId: string; // should be valid sui object id
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
	encryptedKey: EncryptedSymmetricKey; // encrypted key that needs decryption via Seal
	memberCapId: string; // required for Seal decryption
}

export interface GenerateEncryptedChannelDEKopts {
	channelId: string; // should be valid sui object id
}

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedPayload {
	encryptedBytes: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export interface EncryptTextOpts extends CommonEncryptOpts {
	text: string;
}
export interface DecryptTextOpts extends CommonEncryptOpts, EncryptedPayload {}

export interface AttachmentMetadata {
	fileName: string;
	mimeType: string;
	fileSize: number;
}
export interface EncryptAttachmentOpts extends CommonEncryptOpts {
	file: File;
}

export interface EncryptedAttachmentPayload {
	data: EncryptedPayload;
	metadata: EncryptedPayload;
}

export interface DecryptAttachmentMetadataOpts extends CommonEncryptOpts, EncryptedPayload {}
export interface DecryptAttachmentDataOpts extends CommonEncryptOpts, EncryptedPayload {}
export interface DecryptAttachmentOpts extends CommonEncryptOpts, EncryptedAttachmentPayload {}

export interface DecryptAttachmentResult extends AttachmentMetadata {
	data: Uint8Array<ArrayBuffer>;
}
export interface DecryptAttachmentDataResult {
	data: Uint8Array<ArrayBuffer>;
}
export interface DecryptAttachmentMetadataResult extends AttachmentMetadata {}

export interface EncryptMessageOpts extends CommonEncryptOpts {
	text: string;
	attachments?: File[];
}

export interface EncryptedMessagePayload {
	text: EncryptedPayload;
	attachments?: EncryptedAttachmentPayload[];
}

export interface DecryptMessageOpts extends CommonEncryptOpts {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	attachments?: EncryptedAttachmentPayload[];
}

export interface DecryptMessageResult {
	text: string;
	attachments?: DecryptAttachmentResult[];
}
