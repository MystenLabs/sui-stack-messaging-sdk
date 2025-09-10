// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SessionKey } from '@mysten/seal';
import { Signer } from '@mysten/sui/dist/cjs/cryptography';
import { MessagingCompatibleClient } from '../types';

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
// (keyVersion, sender)
export interface EncryptAAD {
	keyVersion: number; // u32
	sender: string; // should be valid sui address
}

export type CommonEncryptOpts =
	| {
			$kind: 'Unencrypted';
			sender: string; // should be valid sui address
			memberCapId: string; // required for Seal decryption
			unEncryptedKey: SymmetricKey;
			encryptedKey?: never;
			channelId?: never;
	  }
	| {
			$kind: 'Encrypted';
			sender: string; // should be valid sui address
			memberCapId: string; // required for Seal decryption
			channelId: string; // should be a valid sui Object ID
			encryptedKey: EncryptedSymmetricKey;
			unEncryptedKey?: never;
	  };

export interface GenerateEncryptedChannelDEKopts {
	creatorAddress: string; // should be valid sui address
}

/**
 * Represents an encrypted payload along with its metadata
 */
export interface EncryptedPayload {
	encryptedBytes: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
}

export type EncryptTextOpts = CommonEncryptOpts & {
	text: string;
};

export type DecryptTextOpts = CommonEncryptOpts & EncryptedPayload;

export interface AttachmentMetadata {
	fileName: string;
	mimeType: string;
	fileSize: number;
}
export type EncryptAttachmentOpts = CommonEncryptOpts & {
	file: File;
};

export interface EncryptedAttachmentPayload {
	data: EncryptedPayload;
	metadata: EncryptedPayload;
}

export type DecryptAttachmentMetadataOpts = CommonEncryptOpts & EncryptedPayload;
export type DecryptAttachmentDataOpts = CommonEncryptOpts & EncryptedPayload;
export type DecryptAttachmentOpts = CommonEncryptOpts & EncryptedAttachmentPayload;

export interface DecryptAttachmentResult extends AttachmentMetadata {
	data: Uint8Array<ArrayBuffer>;
}
export interface DecryptAttachmentDataResult {
	data: Uint8Array<ArrayBuffer>;
}
export interface DecryptAttachmentMetadataResult extends AttachmentMetadata {}

export type EncryptMessageOpts = CommonEncryptOpts & {
	text: string;
	attachments?: File[];
};

export interface EncryptedMessagePayload {
	text: EncryptedPayload;
	attachments?: EncryptedAttachmentPayload[];
}

export type DecryptMessageOpts = CommonEncryptOpts & {
	ciphertext: Uint8Array<ArrayBuffer>;
	nonce: Uint8Array<ArrayBuffer>;
	attachments?: EncryptedAttachmentPayload[];
};

export interface DecryptMessageResult {
	text: string;
	attachments?: DecryptAttachmentResult[];
}
