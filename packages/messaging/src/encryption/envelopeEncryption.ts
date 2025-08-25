// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import {
	DecryptTextArgs,
	EncryptedTextPayload,
	EncryptionPrimitives,
	EncryptTextArgs,
	MessagingEncryptor,
	SymmetricKey,
} from './types';
import { WebCryptoPrimitives } from './webCryptoPrimitives';

/**
 * Core encryption service that handles both single-layer and double-layer envelope encryption
 */
export class EnvelopeEncryption implements MessagingEncryptor {
	constructor(
		private readonly encryptionPrimitives: EncryptionPrimitives = WebCryptoPrimitives.getInstance(),
	) {}

	// ===== MessagingEncryptor methods =====

	async encryptText({
		text,
		channelId,
		key,
		sender,
	}: EncryptTextArgs): Promise<EncryptedTextPayload> {
		const nonce = this.encryptionPrimitives.generateNonce();
		const ciphertext = await this.encryptionPrimitives.encryptBytes(
			key.bytes,
			nonce,
			new TextEncoder().encode(channelId + sender + key.version.toString()),
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
	}: DecryptTextArgs): Promise<string> {
		const decryptedBytes = await this.encryptionPrimitives.decryptBytes(
			key.bytes,
			nonce,
			this.encryptionAAD(channelId, key.version, sender),
			ciphertext,
		);
		return new TextDecoder().decode(decryptedBytes);
	}
	encryptAttachment(): void {
		throw new Error('Method not implemented.');
	}
	decryptAttachment(): void {
		throw new Error('Method not implemented.');
	}
	encryptMessage(): void {
		throw new Error('Method not implemented.');
	}
	decryptMessage(): void {
		throw new Error('Method not implemented.');
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
	// 	if (!isValidSuiObjectId(channelId)) {
	// 		throw new Error('The channelId provided is not a valid Sui Object ID');
	// 	}
	// 	if (!isValidSuiObjectId(memberCapId)) {
	// 		throw new Error('The memberCapId provided is not a valid Sui Object ID');
	// 	}

	// 	// First check in the cache
	// 	if (this.config.cacheChannelKeys && this.encryptedChannelKeyCache.has(channelId)) {
	// 		const cachedEncryptedKey = this.encryptedChannelKeyCache.get(channelId)!;
	// 		// === Decrypt the cached key ===
	// 		// Prepare seal_approve ptb
	// 		const tx = new Transaction();
	// 		tx.moveCall({
	// 			target: `${this.sealApproveContract.packageId}::${this.sealApproveContract.module}::${this.sealApproveContract.functionName}`,
	// 			arguments: [
	// 				// Seal Identity Bytes: Channel object ID
	// 				// key form: [packageId][channelId][random nonce]
	// 				tx.pure.vector('u8', fromHex(channelId)),
	// 				// Channel Object
	// 				tx.object(channelId),
	// 				// Member Cap Object
	// 				tx.object(memberCapId),
	// 			],
	// 		});
	// 		const txBytes = await tx.build({ client: this.suiClient, onlyTransactionKind: true });
	// 		// Decrypt using Seal
	// 		const dekBytes = await this.client.decrypt({
	// 			data: cachedEncryptedKey.encryptedBytes,
	// 			sessionKey: this.sessionKey,
	// 			txBytes,
	// 		});
	// 		return {
	// 			$kind: 'Unencrypted',
	// 			bytes: new Uint8Array(dekBytes),
	// 			version: cachedEncryptedKey.version,
	// 		};
	// 	}
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
