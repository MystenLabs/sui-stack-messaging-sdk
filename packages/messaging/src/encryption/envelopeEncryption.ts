// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient, SessionKey } from '@mysten/seal';
import { fromHex, isValidSuiObjectId, toHex } from '@mysten/sui/utils';
import { Signer } from '@mysten/sui/cryptography';

import {
	AttachmentMetadata,
	DecryptAttachmentDataOpts,
	DecryptAttachmentMetadataOpts,
	DecryptAttachmentOpts,
	DecryptAttachmentResult,
	DecryptMessageOpts,
	DecryptTextOpts,
	EncryptAttachmentOpts,
	EncryptedAttachmentPayload,
	EncryptedMessagePayload,
	EncryptedSymmetricKey,
	EncryptedTextPayload,
	EncryptionPrimitives,
	EncryptMessageOpts,
	EncryptTextOpts,
	GenerateEncryptedChannelDEKopts,
	MessagingEncryptor,
	SymmetricKey,
} from './types';
import { WebCryptoPrimitives } from './webCryptoPrimitives';
import { Transaction } from '@mysten/sui/transactions';
import { MessagingCompatibleClient } from '../types';


export interface SealApproveContract {
	packageId: string;
	module: string;
	functionName: string;
}
export interface EnvelopeEncryptionConfig {
	sealClient: SealClient;
	suiClient: MessagingCompatibleClient;
	sealApproveContract: SealApproveContract;
	sessionKey?: SessionKey;
	sessionKeyConfig?: {
		signer: Signer;
		ttlMin: number;
	};
	encryptionPrimitives?: EncryptionPrimitives;
}

/**
 * Core encryption service that handles both single-layer and double-layer envelope encryption
 */
export class EnvelopeEncryption implements MessagingEncryptor {
	#suiClient: MessagingCompatibleClient;
	#encryptionPrimitives: EncryptionPrimitives;
	#sessionKey?: SessionKey;
	#sealClient: SealClient;
	#sealApproveContract: SealApproveContract;
	#sessionKeyConfig?: {
		signer: Signer;
		ttlMin: number;
	};

	constructor(config: EnvelopeEncryptionConfig) {
		this.#suiClient = config.suiClient;
		this.#sealClient = config.sealClient;
		this.#sealApproveContract = config.sealApproveContract;
		this.#sessionKey = config.sessionKey;
		this.#sessionKeyConfig = config.sessionKeyConfig;
		this.#encryptionPrimitives =
			config.encryptionPrimitives ?? WebCryptoPrimitives.getInstance();

		if (!this.#sessionKey && !this.#sessionKeyConfig) {
			throw new Error('Either sessionKey or sessionKeyConfig must be provided');
		}
	}

	private async getSessionKey(): Promise<SessionKey> {
		if (this.#sessionKey && !this.#sessionKey.isExpired()) {
			return this.#sessionKey;
		}

		if (!this.#sessionKeyConfig) {
			throw new Error('SessionKey is expired and sessionKeyConfig is not available to create a new one.');
		}

		this.#sessionKey = await SessionKey.create({
			address: this.#sessionKeyConfig.signer.toSuiAddress(),
			signer: this.#sessionKeyConfig.signer,
			ttlMin: this.#sessionKeyConfig.ttlMin,
			packageId: this.#sealApproveContract.packageId,
			suiClient: this.#suiClient,
		});

		return this.#sessionKey;
	}

	// ===== MessagingEncryptor methods =====
	async generateEncryptedChannelDEK({
		channelId
	}: GenerateEncryptedChannelDEKopts): Promise<Uint8Array<ArrayBuffer>> {
		if (!isValidSuiObjectId(channelId)) {
			throw new Error('The channelId provided is not a valid Sui Object ID');
		}
		// Generate a new DEK
		const dek = await this.#encryptionPrimitives.generateDEK(length);
		// Encrypt with Seal before returning
		const nonce = this.#encryptionPrimitives.generateNonce();
		const sealPolicyBytes = fromHex(channelId); // Using channelId as the policy; 
		const id = toHex(new Uint8Array([...sealPolicyBytes, ...nonce]));
		const { encryptedObject: encryptedDekBytes } = await this.#sealClient.encrypt({
			threshold: 2,
			packageId: this.#sealApproveContract.packageId,
			id,
			data: dek, 
		});
		return new Uint8Array(encryptedDekBytes);
	}

	async encryptText({
		text,
		channelId,
		sender,
		key,
		memberCapId,
	}: EncryptTextOpts): Promise<EncryptedTextPayload> {
		const nonce = this.#encryptionPrimitives.generateNonce();
		const dek: SymmetricKey = await this.decryptChannelKeyWithSeal(key, channelId, memberCapId)

		const ciphertext = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new TextEncoder().encode(text),
		);
		return {
			ciphertext,
			nonce,
		};
	}

	async decryptText({
		ciphertext,
		nonce,
		channelId,
		key,
		sender,
		memberCapId,
	}: DecryptTextOpts): Promise<string> {
		const dek: SymmetricKey = await this.decryptChannelKeyWithSeal(key, channelId, memberCapId)

		const decryptedBytes = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, key.version, sender),
			ciphertext,
		);
		return new TextDecoder().decode(decryptedBytes);
	}
	async encryptAttachment({
		file,
		channelId,
		sender,
		key,
		memberCapId,
	}: EncryptAttachmentOpts): Promise<EncryptedAttachmentPayload> {
		const nonce = this.#encryptionPrimitives.generateNonce();
		const dek: SymmetricKey = await this.decryptChannelKeyWithSeal(key, channelId, memberCapId);

		// Read file as ArrayBuffer
		const fileData = await file.arrayBuffer();

		// Encrypt file data
		const encryptedData = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new Uint8Array(fileData),
		);

		// Encrypt file metadata
		const encryptedFileName = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new TextEncoder().encode(file.name),
		);

		const encryptedMimeType = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new TextEncoder().encode(file.type),
		);

		const encryptedFileSize = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new TextEncoder().encode(file.size.toString()),
		);

		return {
			encryptedData,
			nonce,
			encryptedFileName,
			encryptedMimeType,
			encryptedFileSize,
		};
	}

	async decryptAttachmentMetadata({
		channelId,
		sender,
		key,
		memberCapId,
		encryptedFileName,
		encryptedMimeType,
		encryptedFileSize
	}: DecryptAttachmentMetadataOpts): Promise<AttachmentMetadata> {
		const dek: SymmetricKey = await this.decryptChannelKeyWithSeal(key, channelId, memberCapId);

		// Decrypt metadata
		const fileName = new TextDecoder().decode(
			await this.#encryptionPrimitives.decryptBytes(
				dek.bytes,
				new Uint8Array(12), // Assuming a fixed nonce for metadata decryption; adjust as needed
				this.encryptionAAD(channelId, dek.version, sender),
				encryptedFileName,
			),
		);

		const mimeType = new TextDecoder().decode(
			await this.#encryptionPrimitives.decryptBytes(
				dek.bytes,
				new Uint8Array(12), // Assuming a fixed nonce for metadata decryption; adjust as needed
				this.encryptionAAD(channelId, dek.version, sender),
				encryptedMimeType,
			),
		);

		const fileSizeStr = new TextDecoder().decode(
			await this.#encryptionPrimitives.decryptBytes(
				dek.bytes,
				new Uint8Array(12), // Assuming a fixed nonce for metadata decryption; adjust as needed
				this.encryptionAAD(channelId, dek.version, sender),
				encryptedFileSize,
			),
		);
		const fileSize = parseInt(fileSizeStr, 10);

		return {
			fileName,
			mimeType,
			fileSize,
		};
	}

	async decryptAttachmentData({
		channelId,
		sender,
		key,
		memberCapId,
		encryptedData,
		nonce,
	}: DecryptAttachmentDataOpts): Promise<Uint8Array<ArrayBuffer>> {
		const dek: SymmetricKey = await this.decryptChannelKeyWithSeal(key, channelId, memberCapId);
		const decryptedData = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			encryptedData,
		);
		return decryptedData;
	}

	async decryptAttachment({
		channelId,
		sender,
		key,
		memberCapId,
		encryptedData,
		nonce,
		encryptedFileName,
		encryptedMimeType,
		encryptedFileSize,
	}: DecryptAttachmentOpts): Promise<DecryptAttachmentResult> {

		// Decrypt file data
		const decryptedData = await this.decryptAttachmentData({
			channelId,
			sender,
			key,
			memberCapId,
			encryptedData,
			nonce,
		});

		// Decrypt metadata
		const { fileName, mimeType, fileSize } = await this.decryptAttachmentMetadata({
			channelId,
			sender,
			key,
			memberCapId,
			encryptedFileName,
			encryptedMimeType,
			encryptedFileSize
		});


		return {
			data: decryptedData,
			fileName,
			mimeType,
			fileSize,
		};

	}

	async encryptMessage({
		text,
		attachments,
		channelId,
		sender,
		key,
		memberCapId,
	}: EncryptMessageOpts): Promise<EncryptedMessagePayload> {
		// Encrypt text
		const { ciphertext, nonce } = await this.encryptText({
			text,
			channelId,
			sender,
			key,
			memberCapId,
		});

		// If there are no attachments, return early
		if (!attachments || attachments.length === 0) {
			return { ciphertext, nonce };
		}

		// Encrypt attachments in parallel
		const encryptedAttachments = await Promise.all(
			attachments.map((file) =>
				this.encryptAttachment({
					file,
					channelId,
					sender,
					key,
					memberCapId,
				}),
			),
		);

		return {
			ciphertext,
			nonce,
			attachments: encryptedAttachments,
		};
	}

	async decryptMessage({
		ciphertext,
		nonce,
		attachments,
		channelId,
		sender,
		key,
		memberCapId,
	}: DecryptMessageOpts): Promise<{ text: string; attachments?: DecryptAttachmentResult[] }> {
		// Decrypt text
		const text = await this.decryptText({
			ciphertext,
			nonce,
			channelId,
			sender,
			key,
			memberCapId,
		});

		// If there are no attachments, return early
		if (!attachments || attachments.length === 0) {
			return { text };
		}

		// Decrypt attachments in parallel
		const decryptedAttachments = await Promise.all(
			attachments.map((attachment) =>
				this.decryptAttachment({
					...attachment,
					channelId,
					sender,
					key,
					memberCapId,
				}),
			),
		);

		return {
			text,
			attachments: decryptedAttachments,
		};
	}

	/**
	 * Decrypts an encrypted channel key using Seal
	 * 
	 * @param key 
	 * @param channelId 
	 * @param memberCapId 
	 * @returns 
	 */
	async decryptChannelKeyWithSeal(
		key: EncryptedSymmetricKey,
		channelId: string,
		memberCapId: string,
	): Promise<SymmetricKey> {
		if (!isValidSuiObjectId(channelId)) {
			throw new Error('The channelId provided is not a valid Sui Object ID');
		}
		if (!isValidSuiObjectId(memberCapId)) {
			throw new Error('The memberCapId provided is not a valid Sui Object ID');
		}

		// === Decrypt the cached key ===
		// Prepare seal_approve ptb
		const tx = new Transaction();
		tx.moveCall({
			target: `${this.#sealApproveContract.packageId}::${this.#sealApproveContract.module}::${this.#sealApproveContract.functionName}`,
			arguments: [
				// Seal Identity Bytes: Channel object ID
				// key form: [packageId][channelId][random nonce]
				tx.pure.vector('u8', fromHex(channelId)),
				// Channel Object
				tx.object(channelId),
				// Member Cap Object
				tx.object(memberCapId),
			],
		});
		const txBytes = await tx.build({ client: this.#suiClient, onlyTransactionKind: true });
		// Decrypt using Seal
		const dekBytes = await this.#sealClient.decrypt({
			data: key.encryptedBytes,
			sessionKey: await this.getSessionKey(),
			txBytes,
		});
		return {
			$kind: 'Unencrypted',
			bytes: new Uint8Array(dekBytes),
			version: key.version,
		};
	}

	// ===== Private methods =====

	/**
	 * Gets the Additional Authenticated Data for encryption/decryption
	 * (channelId, keyVersion, sender)
	 *
	 * @param channelId
	 * @param keyVersion
	 * @param sender
	 * @returns
	 */
	private encryptionAAD(
		channelId: string,
		keyVersion: number,
		sender: string,
	): Uint8Array<ArrayBuffer> {
		return new TextEncoder().encode(channelId + keyVersion.toString() + sender);
	}

	// TODO: Move this to the main client. We should only be executing transactions there
	// private async getChannelKey(channelId: string, memberCapId: string): Promise<SymmetricKey> {
	// 	// If not in cache, fetch the latest channel key, cache it,
	// 	// and then decrypt with Seal and return it
	// 	const tx = new Transaction();
	// 	tx.add(
	// 		viewEncryptionKey({
	// 			arguments: {
	// 				self: tx.object(channelId),
	// 			},
	// 		}),
	// 	);
	// }
}
