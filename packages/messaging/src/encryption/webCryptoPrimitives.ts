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
	async generateKEK(length?: number): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.kekAlgorithm) {
			case 'AES-KW': {
				const kek = await crypto.subtle.generateKey(
					{ name: this.config.kekAlgorithm, length: length ?? this.config.keySize },
					true,
					['wrapKey', 'unwrapKey'],
				);
				return await crypto.subtle.exportKey('raw', kek).then((kekData) => new Uint8Array(kekData));
			}
			default:
				throw new MessagingClientError('Unsupported Key Encryption Key algorithm');
		}
	}
	/**
	 * Generates a cryptographically secure random Data Encryption Key(DEK)
	 */
	async generateDEK(length?: number): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.dekAlgorithm) {
			case 'AES-GCM': {
				const dek = await crypto.subtle.generateKey(
					{ name: this.config.dekAlgorithm, length: length ?? this.config.keySize },
					true,
					['encrypt', 'decrypt', 'deriveKey'],
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

	/**
	 * Derives a key from a base key
	 * @param baseKey
	 * @param nonce
	 * @param info
	 */
	async deriveKey(
		baseKey: Uint8Array<ArrayBuffer>,
		nonce: Uint8Array<ArrayBuffer>,
		info: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>> {
		// Import the raw key
		const importedBaseKey = await crypto.subtle.importKey(
			'raw',
			baseKey,
			{ name: this.config.dekAlgorithm },
			false,
			['deriveKey'],
		);

		switch (this.config.deriveKeyAlgorithm) {
			case 'HKDF': {
				const derivedKey = await crypto.subtle.deriveKey(
					{
						name: this.config.deriveKeyAlgorithm,
						salt: nonce,
						info: info,
						hash: 'SHA-256',
					},
					importedBaseKey,
					{ name: this.config.dekAlgorithm, length: this.config.keySize },
					false,
					['encrypt', 'decrypt'],
				);
				return await crypto.subtle
					.exportKey('raw', derivedKey)
					.then((keyData) => new Uint8Array(keyData));
			}
			default:
				throw new MessagingClientError('Unsupported derive key algorithm');
		}
	}

	/**
	 *
	 * @param kek
	 * @param keyToWrap
	 */
	wrapKey(kek: Uint8Array, keyToWrap: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
		throw new Error('Method not implemented.');
	}

	unwrapKey(kek: Uint8Array, wrappedKey: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
		throw new Error('Method not implemented.');
	}

	// ===== Encryption methods =====
	encryptBytes(
		key: Uint8Array,
		nonce: Uint8Array,
		bytesToEncrypt: Uint8Array,
	): Promise<Uint8Array<ArrayBuffer>> {
		throw new Error('Method not implemented.');
	}
	decryptBytes(
		key: Uint8Array,
		nonce: Uint8Array,
		encryptedBytes: Uint8Array,
	): Promise<Uint8Array<ArrayBuffer>> {
		throw new Error('Method not implemented.');
	}
}
