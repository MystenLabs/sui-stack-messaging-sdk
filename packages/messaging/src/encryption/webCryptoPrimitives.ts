// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { MessagingClientError } from '../error';
import { ENCRYPTION_PRIMITIVES_CONFIG } from './constants';
import { EncryptionPrimitives, EncryptionPrimitivesConfig } from './types';

/**
 * Default implementation of the KeyProvider interface using Web Crypto API
 */
export class WebCryptoPrimitives implements EncryptionPrimitives {
	private static instance: WebCryptoPrimitives;
	private config: EncryptionPrimitivesConfig;

	private constructor(config: EncryptionPrimitivesConfig) {
		this.config = config;
	}

	public static getInstance(config?: EncryptionPrimitivesConfig): WebCryptoPrimitives {
		if (!WebCryptoPrimitives.instance) {
			WebCryptoPrimitives.instance = new WebCryptoPrimitives(
				config ?? ENCRYPTION_PRIMITIVES_CONFIG,
			);
		}
		return WebCryptoPrimitives.instance;
	}

	// ===== Key methods =====

	/**
	 * Generates a cryptographically secure random Data Encryption Key(DEK)
	 */
	async generateDEK(length?: number): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.dekAlgorithm) {
			case 'AES-GCM': {
				const dek = await crypto.subtle.generateKey(
					{ name: this.config.dekAlgorithm, length: length ?? this.config.keySize },
					true,
					['encrypt', 'decrypt'],
				);
				return await crypto.subtle.exportKey('raw', dek).then((dekData) => new Uint8Array(dekData));
			}
			default:
				throw new MessagingClientError('Unsupported Data Encryption Key algorithm');
		}
	}

	/**
	 * Generates a cryptographically secure nonce
	 */
	generateNonce(length?: number): Uint8Array<ArrayBuffer> {
		return crypto.getRandomValues(new Uint8Array(length ?? this.config.nonceSize));
	}

	// ===== Encryption methods =====
	/**
	 * Encrypts bytes using a Data Encryption Key (DEK) and a nonce
	 * @param {Uint8Array} dek
	 * @param {Uint8Array} nonce
	 * @param {Uint8Array} bytesToEncrypt
	 * @returns {Promise<Uint8Array>} The encrypted bytes as a Uint8Array
	 */
	async encryptBytes(
		dek: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		bytesToEncrypt: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.dekAlgorithm) {
			case 'AES-GCM': {
				const importedDEK = await crypto.subtle.importKey(
					'raw',
					dek,
					{ name: this.config.dekAlgorithm },
					false,
					['encrypt'],
				);

				return await crypto.subtle
					.encrypt(
						{
							name: this.config.dekAlgorithm,
							iv: nonce,
						},
						importedDEK,
						bytesToEncrypt,
					)
					.then((encryptedData) => new Uint8Array(encryptedData));
			}
			default:
				throw new MessagingClientError('Unsupported key unwrap algorithm');
		}
	}

	async decryptBytes(
		dek: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		encryptedBytes: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.dekAlgorithm) {
			case 'AES-GCM': {
				const importedDEK = await crypto.subtle.importKey(
					'raw',
					dek,
					{ name: this.config.dekAlgorithm },
					false,
					['decrypt'],
				);

				return await crypto.subtle
					.decrypt(
						{
							name: this.config.dekAlgorithm,
							iv: nonce,
						},
						importedDEK,
						encryptedBytes,
					)
					.then((decryptedData) => new Uint8Array(decryptedData));
			}
			default:
				throw new MessagingClientError('Unsupported key unwrap algorithm');
		}
	}
}
