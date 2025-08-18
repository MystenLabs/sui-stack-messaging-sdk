// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { KeyProvider } from './types';

const KEY_SIZE = 32; // 256 bits
const NONCE_SIZE = 12; // 96 bits - standard for AES-GCM

/**
 * Default implementation of the KeyProvider interface using Web Crypto API
 */
export class WebCryptoKeyProvider implements KeyProvider {
	private static instance: WebCryptoKeyProvider;

	private constructor() {}

	public static getInstance(): WebCryptoKeyProvider {
		if (!WebCryptoKeyProvider.instance) {
			WebCryptoKeyProvider.instance = new WebCryptoKeyProvider();
		}
		return WebCryptoKeyProvider.instance;
	}

	/**
	 * Generates a cryptographically secure random key
	 */
	async generateKey(): Promise<Uint8Array> {
		return crypto.subtle.generateKey({ name: 'AES-GCM', length: KEY_SIZE });
	}

	/**
	 * Generates a cryptographically secure nonce
	 */
	generateNonce(): Uint8Array {
		return crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
	}
}
