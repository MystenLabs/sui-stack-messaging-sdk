// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { EncryptedObject, SessionKey } from '@mysten/seal';
import { fromHex, isValidSuiObjectId, toHex } from '@mysten/sui/utils';

import {
	AttachmentMetadata,
	DecryptAttachmentDataOpts,
	DecryptAttachmentDataResult,
	DecryptAttachmentMetadataOpts,
	DecryptAttachmentMetadataResult,
	DecryptAttachmentOpts,
	DecryptAttachmentResult,
	DecryptChannelDEKOpts,
	DecryptMessageOpts,
	DecryptTextOpts,
	EncryptAttachmentOpts,
	EncryptedAttachmentPayload,
	EncryptedMessagePayload,
	EncryptedPayload,
	EncryptionPrimitives,
	EncryptMessageOpts,
	EncryptTextOpts,
	EnvelopeEncryptionConfig,
	GenerateEncryptedChannelDEKopts,
	SealApproveContract,
	SessionKeyConfig,
	SymmetricKey,
} from './types';
import { WebCryptoPrimitives } from './webCryptoPrimitives';
import { Transaction } from '@mysten/sui/transactions';
import { MessagingCompatibleClient } from '../types';

/**
 * Core envelope encryption service that utilizes Seal
 */
export class EnvelopeEncryption {
	#suiClient: MessagingCompatibleClient;
	#encryptionPrimitives: EncryptionPrimitives;
	#sessionKey?: SessionKey;
	#sealApproveContract: SealApproveContract;
	#sessionKeyConfig?: SessionKeyConfig;

	constructor(config: EnvelopeEncryptionConfig) {
		this.#suiClient = config.suiClient;
		this.#sealApproveContract = config.sealApproveContract;
		this.#sessionKey = config.sessionKey;
		this.#sessionKeyConfig = config.sessionKeyConfig;
		this.#encryptionPrimitives = config.encryptionPrimitives ?? WebCryptoPrimitives.getInstance();

		if (!this.#sessionKey && !this.#sessionKeyConfig) {
			throw new Error('Either sessionKey or sessionKeyConfig must be provided');
		}
	}

	private async getSessionKey(): Promise<SessionKey> {
		if (this.#sessionKey && !this.#sessionKey.isExpired()) {
			console.log('using cached session key');
			return this.#sessionKey;
		}
		console.log('creating new session key');

		if (!this.#sessionKeyConfig) {
			throw new Error(
				'SessionKey is expired and sessionKeyConfig is not available to create a new one.',
			);
		}

		this.#sessionKey = await SessionKey.create({
			address: this.#sessionKeyConfig.address,
			signer: this.#sessionKeyConfig.signer,
			ttlMin: this.#sessionKeyConfig.ttlMin,
			mvrName: this.#sessionKeyConfig.mvrName,
			packageId: this.#sealApproveContract.packageId,
			suiClient: this.#suiClient,
		});

		return this.#sessionKey;
	}

	// ===== Encryption methods =====
	/**
	 * Generate encrypted channel data encryption key
	 * @param channelId - The channel ID
	 * @returns Encrypted DEK bytes
	 */
	async generateEncryptedChannelDEK({
		channelId,
	}: GenerateEncryptedChannelDEKopts): Promise<Uint8Array<ArrayBuffer>> {
		if (!isValidSuiObjectId(channelId)) {
			throw new Error('The channelId provided is not a valid Sui Object ID');
		}
		// Generate a new DEK
		const dek = await this.#encryptionPrimitives.generateDEK();
		// Encrypt with Seal before returning
		const nonce = this.#encryptionPrimitives.generateNonce();
		const sealPolicyBytes = fromHex(channelId); // Using channelId as the policy;
		const id = toHex(new Uint8Array([...sealPolicyBytes, ...nonce]));
		const { encryptedObject: encryptedDekBytes } = await this.#suiClient.seal.encrypt({
			threshold: 2, // TODO: Magic number --> extract this to an option/config/constant
			packageId: this.#sealApproveContract.packageId,
			id,
			data: dek,
		});
		return new Uint8Array(encryptedDekBytes);
	}

	/**
	 * Generate a random nonce
	 * @returns Random nonce bytes
	 */
	generateNonce(): Uint8Array<ArrayBuffer> {
		return this.#encryptionPrimitives.generateNonce();
	}

	/**
	 * Encrypt text message
	 * @param text - The text to encrypt
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Encrypted payload with ciphertext and nonce
	 */
	async encryptText({
		text,
		channelId,
		sender,
		encryptedKey,
		memberCapId,
	}: EncryptTextOpts): Promise<EncryptedPayload> {
		const nonce = this.#encryptionPrimitives.generateNonce();
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});

		const ciphertext = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new Uint8Array(new TextEncoder().encode(text)),
		);
		return {
			encryptedBytes: ciphertext,
			nonce,
		};
	}

	/**
	 * Decrypt text message
	 * @param encryptedBytes - The encrypted text bytes
	 * @param nonce - The encryption nonce
	 * @param channelId - The channel ID
	 * @param encryptedKey - The encrypted symmetric key
	 * @param sender - The sender address
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted text string
	 */
	async decryptText({
		encryptedBytes: ciphertext,
		nonce,
		channelId,
		encryptedKey,
		sender,
		memberCapId,
	}: DecryptTextOpts): Promise<string> {
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});

		const decryptedBytes = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, encryptedKey.version, sender),
			ciphertext,
		);
		return new TextDecoder().decode(decryptedBytes);
	}

	/**
	 * Encrypt attachment file and metadata
	 * @param file - The file to encrypt
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Encrypted attachment payload with data and metadata
	 */
	async encryptAttachment({
		file,
		channelId,
		sender,
		encryptedKey,
		memberCapId,
	}: EncryptAttachmentOpts): Promise<EncryptedAttachmentPayload> {
		// Encrypt the attachment Data
		const { encryptedBytes: encryptedData, nonce: dataNonce } = await this.encryptAttachmentData({
			file,
			channelId,
			sender,
			encryptedKey,
			memberCapId,
		});
		// Encrypt the attachment Metadata
		const { encryptedBytes: encryptedMetadata, nonce: metadataNonce } =
			await this.encryptAttachmentMetadata({
				file,
				channelId,
				sender,
				encryptedKey,
				memberCapId,
			});

		return {
			data: { encryptedBytes: encryptedData, nonce: dataNonce },
			metadata: { encryptedBytes: encryptedMetadata, nonce: metadataNonce },
		};
	}

	/**
	 * Encrypt attachment file data
	 * @param file - The file to encrypt
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Encrypted payload with data and nonce
	 */
	async encryptAttachmentData({
		file,
		channelId,
		sender,
		encryptedKey,
		memberCapId,
	}: EncryptAttachmentOpts): Promise<EncryptedPayload> {
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});

		const nonce = this.generateNonce();

		// Read file as ArrayBuffer
		const fileData = await file.arrayBuffer();

		// Encrypt file data
		const encryptedData = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new Uint8Array(fileData),
		);
		return { encryptedBytes: encryptedData, nonce };
	}

	/**
	 * Encrypt attachment metadata
	 * @param file - The file to get metadata from
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Encrypted payload with metadata and nonce
	 */
	async encryptAttachmentMetadata({
		channelId,
		sender,
		encryptedKey,
		memberCapId,
		file,
	}: EncryptAttachmentOpts): Promise<EncryptedPayload> {
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});

		const nonce = this.generateNonce();

		// Extract file metadata
		const metadata: AttachmentMetadata = {
			fileName: file.name,
			mimeType: file.type,
			fileSize: file.size,
		};

		// Encrypt metadata as one piece of data
		const metadataStr = JSON.stringify(metadata);
		const encryptedMetadata = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			new Uint8Array(new TextEncoder().encode(metadataStr)),
		);

		return {
			encryptedBytes: encryptedMetadata,
			nonce,
		};
	}

	/**
	 * Decrypt attachment metadata
	 * @param encryptedBytes - The encrypted metadata bytes
	 * @param nonce - The encryption nonce
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted attachment metadata
	 */
	async decryptAttachmentMetadata({
		channelId,
		sender,
		encryptedKey,
		memberCapId,
		encryptedBytes,
		nonce,
	}: DecryptAttachmentMetadataOpts): Promise<DecryptAttachmentMetadataResult> {
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});

		// Decrypt metadata
		const decryptedMetadataBytes = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			encryptedBytes,
		);
		// Parse the bytes back to JSON
		const metadataStr = new TextDecoder().decode(decryptedMetadataBytes);
		const { fileName, mimeType, fileSize } = JSON.parse(metadataStr);

		return {
			fileName,
			mimeType,
			fileSize,
		};
	}

	/**
	 * Decrypt attachment file data
	 * @param encryptedBytes - The encrypted data bytes
	 * @param nonce - The encryption nonce
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted attachment data
	 */
	async decryptAttachmentData({
		channelId,
		sender,
		encryptedKey,
		memberCapId,
		encryptedBytes,
		nonce,
	}: DecryptAttachmentDataOpts): Promise<DecryptAttachmentDataResult> {
		const dek: SymmetricKey = await this.decryptChannelDEK({
			encryptedKey,
			channelId,
			memberCapId,
		});
		const decryptedData = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(channelId, dek.version, sender),
			encryptedBytes,
		);
		return { data: decryptedData };
	}

	/**
	 * Decrypt attachment file and metadata
	 * @param data - The encrypted data payload
	 * @param metadata - The encrypted metadata payload
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted attachment with data and metadata
	 */
	async decryptAttachment({
		channelId,
		sender,
		encryptedKey,
		memberCapId,
		data,
		metadata,
	}: DecryptAttachmentOpts): Promise<DecryptAttachmentResult> {
		// Decrypt file data
		const decryptedData = await this.decryptAttachmentData({
			channelId,
			sender,
			encryptedKey,
			memberCapId,
			encryptedBytes: data.encryptedBytes,
			nonce: data.nonce,
		});

		// Decrypt metadata
		const { fileName, mimeType, fileSize } = await this.decryptAttachmentMetadata({
			channelId,
			sender,
			encryptedKey,
			memberCapId,
			encryptedBytes: metadata.encryptedBytes,
			nonce: metadata.nonce,
		});

		return {
			data: decryptedData.data,
			fileName,
			mimeType,
			fileSize,
		};
	}

	/**
	 * Encrypt message text and attachments
	 * @param text - The message text
	 * @param attachments - Optional file attachments
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Encrypted message payload
	 */
	async encryptMessage({
		text,
		attachments,
		channelId,
		sender,
		encryptedKey,
		memberCapId,
	}: EncryptMessageOpts): Promise<EncryptedMessagePayload> {
		// Encrypt text
		const { encryptedBytes: ciphertext, nonce } = await this.encryptText({
			text,
			channelId,
			sender,
			encryptedKey,
			memberCapId,
		});

		// If there are no attachments, return early
		if (!attachments || attachments.length === 0) {
			return { text: { encryptedBytes: ciphertext, nonce } };
		}

		// Encrypt attachments in parallel
		const encryptedAttachments = await Promise.all(
			attachments.map((file) =>
				this.encryptAttachment({
					file,
					channelId,
					sender,
					encryptedKey,
					memberCapId,
				}),
			),
		);

		return {
			text: { encryptedBytes: ciphertext, nonce },
			attachments: encryptedAttachments,
		};
	}

	/**
	 * Decrypt message text and attachments
	 * @param ciphertext - The encrypted text bytes
	 * @param nonce - The encryption nonce
	 * @param attachments - Optional encrypted attachments
	 * @param channelId - The channel ID
	 * @param sender - The sender address
	 * @param encryptedKey - The encrypted symmetric key
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted message with text and attachments
	 */
	async decryptMessage({
		ciphertext,
		nonce,
		attachments,
		channelId,
		sender,
		encryptedKey,
		memberCapId,
	}: DecryptMessageOpts): Promise<{ text: string; attachments?: DecryptAttachmentResult[] }> {
		// Decrypt text
		const text = await this.decryptText({
			encryptedBytes: ciphertext,
			nonce,
			channelId,
			sender,
			encryptedKey,
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
					encryptedKey,
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
	 * Decrypt encrypted channel data encryption key using Seal
	 * @param encryptedKey - The encrypted symmetric key
	 * @param channelId - The channel ID
	 * @param memberCapId - The member cap ID
	 * @returns Decrypted symmetric key
	 */
	async decryptChannelDEK({
		encryptedKey,
		channelId,
		memberCapId,
	}: DecryptChannelDEKOpts): Promise<SymmetricKey> {
		if (!isValidSuiObjectId(channelId)) {
			throw new Error('The channelId provided is not a valid Sui Object ID');
		}
		if (!isValidSuiObjectId(memberCapId)) {
			throw new Error('The memberCapId provided is not a valid Sui Object ID');
		}

		// === Decrypt the cached key ===
		// Prepare seal_approve ptb

		const channelIdBytes = EncryptedObject.parse(encryptedKey.encryptedBytes).id;

		const tx = new Transaction();
		tx.moveCall({
			target: `${this.#sealApproveContract.packageId}::${this.#sealApproveContract.module}::${this.#sealApproveContract.functionName}`,
			arguments: [
				// Seal Identity Bytes: Channel object ID
				// key form: [packageId][channelId][random nonce]
				tx.pure.vector('u8', fromHex(channelIdBytes)),
				// Channel Object
				tx.object(channelId),
				// Member Cap Object
				tx.object(memberCapId),
			],
		});
		const txBytes = await tx.build({ client: this.#suiClient, onlyTransactionKind: true });
		// Decrypt using Seal
		let dekBytes: any;
		try {
			dekBytes = await this.#suiClient.seal.decrypt({
				data: encryptedKey.encryptedBytes,
				sessionKey: await this.getSessionKey(),
				txBytes,
			});
		} catch (error) {
			console.error('Error decrypting channel DEK', error);
			throw error;
		}
		// const dekBytes = await this.#suiClient.seal.decrypt({
		// 	data: encryptedKey.encryptedBytes,
		// 	sessionKey: await this.getSessionKey(),
		// 	txBytes,
		// });

		return {
			$kind: 'Unencrypted',
			bytes: new Uint8Array(dekBytes || new Uint8Array()),
			version: encryptedKey.version,
		};
	}

	// ===== Private methods =====

	/**
	 * Get Additional Authenticated Data for encryption/decryption
	 * @param channelId - The channel ID
	 * @param keyVersion - The key version
	 * @param sender - The sender address
	 * @returns AAD bytes
	 */
	private encryptionAAD(
		channelId: string,
		keyVersion: number,
		sender: string,
	): Uint8Array<ArrayBuffer> {
		return new Uint8Array(new TextEncoder().encode(channelId + keyVersion.toString() + sender));
	}
}
