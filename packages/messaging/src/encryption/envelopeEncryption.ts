// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SealClient, SessionKey } from '@mysten/seal';
import { SymmetricKey, EncryptedPayload, Encryptor, KeyWrapper, KeyProvider } from './types';
import { DefaultKeyProvider } from './webCryptoKeyProvider';



/**
 * Core encryption service that handles both single-layer and double-layer envelope encryption
 */
export class EnvelopeEncryptionService {
	private keyProvider: KeyProvider;

	constructor(
		private readonly sealClient: SealClient,
		private readonly useDoubleLayer: boolean = false,
		private readonly padToNearestBlock: boolean = true,
		keyProvider?: KeyProvider,
	) {
		this.keyProvider = keyProvider || DefaultKeyProvider.getInstance();
	}

	/**
	 * Encrypts data with the provided key using AES-GCM
	 * @returns EncryptedPayload containing ciphertext and necessary metadata
	 */
	private async encryptWithKey(
		data: Uint8Array,
		key: SymmetricKey,
		nonce?: Uint8Array,
	): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
		const cryptoKey = await crypto.subtle.importKey('raw', key.bytes, { name: 'AES-GCM' }, false, [
			'encrypt',
		]);

		const nonceToUse = nonce || this.keyProvider.generateNonce();
		const ciphertext = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv: nonceToUse,
			},
			cryptoKey,
			this.padDataIfNeeded(data),
		);

		return {
			ciphertext: new Uint8Array(ciphertext),
			nonce: nonceToUse,
		};
	}

	/**
	 * Decrypts data with the provided key using AES-GCM
	 */
	private async decryptWithKey(
		ciphertext: Uint8Array,
		key: SymmetricKey,
		nonce: Uint8Array,
	): Promise<Uint8Array> {
		const cryptoKey = await crypto.subtle.importKey('raw', key.bytes, { name: 'AES-GCM' }, false, [
			'decrypt',
		]);

		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: nonce,
			},
			cryptoKey,
			ciphertext,
		);

		return this.unpadDataIfNeeded(new Uint8Array(decrypted));
	}

	/**
	 * Pads data to nearest block size if configured
	 */
	private padDataIfNeeded(data: Uint8Array): Uint8Array {
		if (!this.padToNearestBlock) {
			return data;
		}

		const blockSize = 16; // AES block size
		const paddingLength = blockSize - (data.length % blockSize);
		if (paddingLength === blockSize) {
			return data;
		}

		const padded = new Uint8Array(data.length + paddingLength);
		padded.set(data);
		padded.fill(paddingLength, data.length); // PKCS#7 padding
		return padded;
	}

	/**
	 * Removes padding if present
	 */
	private unpadDataIfNeeded(data: Uint8Array): Uint8Array {
		if (!this.padToNearestBlock) {
			return data;
		}

		const paddingLength = data[data.length - 1];
		if (paddingLength > 16) {
			// Invalid padding
			return data;
		}

		return data.slice(0, data.length - paddingLength);
	}

	/**
	 * Encrypts plaintext using single or double layer encryption based on configuration
	 */
	async encrypt(plaintext: Uint8Array, key: SymmetricKey): Promise<EncryptedPayload> {
		if (this.useDoubleLayer) {
			// Double-layer: Generate a DEK, encrypt data with DEK, wrap DEK with KEK
			const dek = await this.keyProvider.generateKey();
			const wrappedDek = await this.wrapKey({ bytes: dek, version: 0 }, key as KeyEncryptionKey);
			const { ciphertext, nonce } = await this.encryptWithKey(plaintext, {
				bytes: dek,
				version: 0,
			});

			return {
				ciphertext,
				nonce,
				wrappedKey: wrappedDek,
				kekVersion: key.version,
			};
		} else {
			// Single-layer: Encrypt data directly with provided key
			const { ciphertext, nonce } = await this.encryptWithKey(plaintext, key);

			return {
				ciphertext,
				nonce,
				kekVersion: key.version,
			};
		}
	}

	/**
	 * Decrypts a payload using single or double layer decryption based on the payload structure
	 */
	async decrypt(payload: EncryptedPayload, key: SymmetricKey): Promise<Uint8Array> {
		if (payload.wrappedKey) {
			// Double-layer: First unwrap the DEK, then decrypt the data
			const dek = await this.unwrapKey(payload.wrappedKey, key as KeyEncryptionKey);
			return this.decryptWithKey(payload.ciphertext, dek, payload.nonce);
		} else {
			// Single-layer: Decrypt directly with provided key
			return this.decryptWithKey(payload.ciphertext, key, payload.nonce);
		}
	}

	/**
	 * Wraps (encrypts) a key using the Seal client
	 */
	async wrapKey(key: SymmetricKey, wrappingKey: KeyEncryptionKey): Promise<Uint8Array> {
		try {
			// Use Seal to encrypt the key
			// const { encryptedObject } = await this.sealClient.encrypt({
			// 	threshold: TODO
			// 	packageId: TODO
			// 	id: TODO --> what should we use as identity? []
			// 	data: TODO
			// });

			// return encryptedObject;
			return new Uint8Array();
		} catch (error) {
			// TODO: MessagingEncryptionError
			throw new Error(`Failed to wrap key: ${error}`);
		}
	}

	/**
	 * Unwraps (decrypts) a key using the Seal client and a valid session key
	 * The caller must provide an initialized SessionKey with valid signature
	 * along with the transaction bytes from seal_approve* function calls
	 */
	async unwrapKey(
		wrappedKey: Uint8Array,
		wrappingKey: KeyEncryptionKey,
		sessionKey?: SessionKey,
		txBytes?: Uint8Array,
	): Promise<SymmetricKey> {
		try {
			if (!sessionKey || !txBytes) {
				throw new Error('SessionKey and transaction bytes are required for decryption');
			}

			// Decrypt the wrapped key using the provided session key and transaction
			const decrypted = await this.sealClient.decrypt({
				data: wrappedKey,
				sessionKey,
				txBytes,
			});

			return {
				bytes: decrypted,
				version: wrappingKey.version,
			};
		} catch (error) {
			throw new Error(`Failed to unwrap key: ${error}`);
		}
	}
}
