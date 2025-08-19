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
	 * Wraps a Data Encryption Key (DEK) with a Key Encryption Key (KEK)
	 * @param {Uint8Array} kek The Key Encryption Key used to wrap the DEK
	 * @param {Uint8Array} keyToWrap The Data Encryption Key to be wrapped
	 * @returns {Promise<Uint8Array>} The wrapped DEK as a Uint8Array
	 * @throws MessagingClientError if the wrapping algorithm is not supported
	 */
	async wrapKey(
		kek: Uint8Array<ArrayBuffer>,
		keyToWrap: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.wrapAlgorithm) {
			case 'AES-KW': {
				const importedKEK = await crypto.subtle.importKey(
					'raw',
					kek,
					{ name: this.config.wrapAlgorithm },
					false,
					['wrapKey'],
				);
				const importedKeyToWrap = await crypto.subtle.importKey(
					'raw',
					keyToWrap,
					{ name: this.config.dekAlgorithm },
					false,
					['encrypt'],
				);
				return await crypto.subtle
					.wrapKey('raw', importedKeyToWrap, importedKEK, { name: this.config.wrapAlgorithm })
					.then((wrappedKey) => new Uint8Array(wrappedKey));
			}
			default:
				throw new MessagingClientError('Unsupported key wrap algorithm');
		}
	}

	/**
	 * Unwraps a wrapped Data Encryption Key (DEK) using a Key Encryption Key (KEK)
	 * @param {Uint8Array} kek The Key Encryption Key that was used to wrap the DEK
	 * @param {Uint8Array} wrappedKey The wrapped Data Encryption Key to be unwrapped
	 * @returns {Promise<Uint8Array>} The unwrapped DEK as a Uint8Array
	 * @throws MessagingClientError if the unwrapping algorithm is not supported
	 */
	async unwrapKey(
		kek: Uint8Array<ArrayBuffer>,
		wrappedKey: Uint8Array<ArrayBuffer>,
	): Promise<Uint8Array<ArrayBuffer>> {
		switch (this.config.wrapAlgorithm) {
			case 'AES-KW': {
				const importedKEK = await crypto.subtle.importKey(
					'raw',
					kek,
					{ name: this.config.wrapAlgorithm },
					false,
					['unwrapKey'],
				);

				return await crypto.subtle
					.unwrapKey(
						'raw',
						wrappedKey,
						importedKEK,
						{ name: this.config.wrapAlgorithm },
						{ name: this.config.dekAlgorithm, length: this.config.keySize },
						false,
						['encrypt', 'decrypt'],
					)
					.then((unwrappedKey) => crypto.subtle.exportKey('raw', unwrappedKey))
					.then((keyData) => new Uint8Array(keyData));
			}
			default:
				throw new MessagingClientError('Unsupported key unwrap algorithm');
		}
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
