// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { EncryptedObject, SessionKey } from '@mysten/seal';
import { fromHex, isValidSuiAddress, isValidSuiObjectId, toHex } from '@mysten/sui/utils';

import {
	AttachmentMetadata,
	CommonEncryptOpts,
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
	async generateEncryptedChannelDEK({
		creatorAddress,
	}: GenerateEncryptedChannelDEKopts): Promise<Uint8Array<ArrayBuffer>> {
		if (!isValidSuiAddress(creatorAddress)) {
			throw new Error('The creatorAddress provided is not a valid Sui Address');
		}
		// Generate a new DEK
		const dek = await this.#encryptionPrimitives.generateDEK();
		// Encrypt with Seal before returning
		const nonce = this.#encryptionPrimitives.generateNonce();
		const sealPolicyBytes = fromHex(creatorAddress); // Using channelId as the policy;
		const id = toHex(new Uint8Array([...sealPolicyBytes, ...nonce]));
		const { encryptedObject: encryptedDekBytes } = await this.#suiClient.seal.encrypt({
			threshold: 2, // TODO: Magic number --> extract this to an option/config/constant
			packageId: this.#sealApproveContract.packageId,
			id,
			data: dek,
		});
		return new Uint8Array(encryptedDekBytes);
	}

	generateNonce(): Uint8Array<ArrayBuffer> {
		return this.#encryptionPrimitives.generateNonce();
	}

	async encryptText(opts: EncryptTextOpts): Promise<EncryptedPayload> {
		const nonce = this.#encryptionPrimitives.generateNonce();
		// Check if the provided key is encrypted or unencrypted
		const dek = await this.#getDEK(opts);

		const ciphertext = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			new Uint8Array(new TextEncoder().encode(opts.text)),
		);
		return {
			encryptedBytes: ciphertext,
			nonce,
		};
	}

	async #getDEK(opts: CommonEncryptOpts): Promise<SymmetricKey> {
		const dek =
			opts.$kind === 'Unencrypted'
				? opts.unEncryptedKey
				: await this.decryptChannelDEK({
						encryptedKey: opts.encryptedKey,
						channelId: opts.channelId,
						memberCapId: opts.memberCapId,
					});
		return dek;
	}

	async decryptText(opts: DecryptTextOpts): Promise<string> {
		const dek: SymmetricKey = await this.#getDEK(opts);

		const decryptedBytes = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			opts.nonce,
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			opts.encryptedBytes,
		);
		return new TextDecoder().decode(decryptedBytes);
	}

	async encryptAttachment(opts: EncryptAttachmentOpts): Promise<EncryptedAttachmentPayload> {
		const { file, ...commonOpts } = opts;
		// Encrypt the attachment Data
		const { encryptedBytes: encryptedData, nonce: dataNonce } = await this.encryptAttachmentData({
			file,
			...commonOpts,
		});
		// Encrypt the attachment Metadata
		const { encryptedBytes: encryptedMetadata, nonce: metadataNonce } =
			await this.encryptAttachmentMetadata({
				file,
				...commonOpts,
			});

		return {
			data: { encryptedBytes: encryptedData, nonce: dataNonce },
			metadata: { encryptedBytes: encryptedMetadata, nonce: metadataNonce },
		};
	}

	async encryptAttachmentData(opts: EncryptAttachmentOpts): Promise<EncryptedPayload> {
		const dek: SymmetricKey = await this.#getDEK(opts);

		const nonce = this.generateNonce();

		// Read file as ArrayBuffer
		const fileData = await opts.file.arrayBuffer();

		// Encrypt file data
		const encryptedData = await this.#encryptionPrimitives.encryptBytes(
			dek.bytes,
			nonce,
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			new Uint8Array(fileData),
		);
		return { encryptedBytes: encryptedData, nonce };
	}

	async encryptAttachmentMetadata(opts: EncryptAttachmentOpts): Promise<EncryptedPayload> {
		const dek: SymmetricKey = await this.#getDEK(opts);

		const nonce = this.generateNonce();

		const file = opts.file;

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
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			new Uint8Array(new TextEncoder().encode(metadataStr)),
		);

		return {
			encryptedBytes: encryptedMetadata,
			nonce,
		};
	}

	async decryptAttachmentMetadata(
		opts: DecryptAttachmentMetadataOpts,
	): Promise<DecryptAttachmentMetadataResult> {
		const dek: SymmetricKey = await this.#getDEK(opts);

		// Decrypt metadata
		const decryptedMetadataBytes = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			opts.nonce,
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			opts.encryptedBytes,
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

	async decryptAttachmentData(
		opts: DecryptAttachmentDataOpts,
	): Promise<DecryptAttachmentDataResult> {
		const dek: SymmetricKey = await this.#getDEK(opts);
		const decryptedData = await this.#encryptionPrimitives.decryptBytes(
			dek.bytes,
			opts.nonce,
			this.encryptionAAD(opts.channelCreatorAddress, dek.version, opts.sender),
			opts.encryptedBytes,
		);
		return { data: decryptedData };
	}

	async decryptAttachment(opts: DecryptAttachmentOpts): Promise<DecryptAttachmentResult> {
		// Decrypt file data
		const decryptedData = await this.decryptAttachmentData({
			...opts,
			encryptedBytes: opts.data.encryptedBytes,
			nonce: opts.data.nonce,
		});

		// Decrypt metadata
		const { fileName, mimeType, fileSize } = await this.decryptAttachmentMetadata({
			...opts,
			encryptedBytes: opts.metadata.encryptedBytes,
			nonce: opts.metadata.nonce,
		});

		return {
			data: decryptedData.data,
			fileName,
			mimeType,
			fileSize,
		};
	}

	async encryptMessage(opts: EncryptMessageOpts): Promise<EncryptedMessagePayload> {
		// Encrypt text
		const { text, attachments, ...commonOpts } = opts;
		const { encryptedBytes: ciphertext, nonce } = await this.encryptText({ ...commonOpts, text });

		// If there are no attachments, return early
		if (!attachments || attachments.length === 0) {
			return { text: { encryptedBytes: ciphertext, nonce } };
		}

		// Encrypt attachments in parallel
		const encryptedAttachments = await Promise.all(
			attachments.map((file) =>
				this.encryptAttachment({
					file,
					...commonOpts,
				}),
			),
		);

		return {
			text: { encryptedBytes: ciphertext, nonce },
			attachments: encryptedAttachments,
		};
	}

	async decryptMessage(
		opts: DecryptMessageOpts,
	): Promise<{ text: string; attachments?: DecryptAttachmentResult[] }> {
		const { ciphertext, nonce, attachments, ...commonOpts } = opts;
		// Decrypt text
		const text = await this.decryptText({
			encryptedBytes: ciphertext,
			nonce,
			...commonOpts,
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
					...commonOpts,
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

		const keyIdBytes = EncryptedObject.parse(encryptedKey.encryptedBytes).id;

		const tx = new Transaction();
		tx.moveCall({
			target: `${this.#sealApproveContract.packageId}::${this.#sealApproveContract.module}::${this.#sealApproveContract.functionName}`,
			arguments: [
				// Seal Identity Bytes: Channel object ID
				// key form: [packageId][creatorAddress][random nonce]
				tx.pure.vector('u8', fromHex(keyIdBytes)),
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
	 * Gets the Additional Authenticated Data for encryption/decryption
	 * (creatorAddress, keyVersion, sender)
	 *
	 * @param creatorAddress
	 * @param keyVersion
	 * @param sender
	 * @returns
	 */
	private encryptionAAD(
		creatorAddress: string,
		keyVersion: number,
		sender: string,
	): Uint8Array<ArrayBuffer> {
		return new Uint8Array(
			new TextEncoder().encode(creatorAddress + keyVersion.toString() + sender),
		);
	}
}
