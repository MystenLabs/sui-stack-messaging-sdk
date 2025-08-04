// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { KeyProvider, KeyEncryptionKey, DataEncryptionKey } from './types';

const KEY_SIZE = 32; // 256 bits
const NONCE_SIZE = 12; // 96 bits - standard for AES-GCM

/**
 * Default implementation of the KeyProvider interface using Web Crypto API
 */
export class DefaultKeyProvider implements KeyProvider {
	private static instance: DefaultKeyProvider;

	private constructor() {}

	public static getInstance(): DefaultKeyProvider {
		if (!DefaultKeyProvider.instance) {
			DefaultKeyProvider.instance = new DefaultKeyProvider();
		}
		return DefaultKeyProvider.instance;
	}

	/**
	 * Generates a cryptographically secure random key
	 */
	async generateKey(): Promise<Uint8Array> {
		return crypto.getRandomValues(new Uint8Array(KEY_SIZE));
	}

	/**
	 * Generates a cryptographically secure nonce
	 */
	generateNonce(): Uint8Array {
		return crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
	}

	/**
	 * Creates a new Key Encryption Key (KEK)
	 */
	async createKEK(version: number = 0): Promise<KeyEncryptionKey> {
		return {
			bytes: await this.generateKey(),
			version,
			$kind: 'kek',
		};
	}

	/**
	 * Creates a new Data Encryption Key (DEK)
	 */
	async createDEK(version: number = 0): Promise<DataEncryptionKey> {
		return {
			bytes: await this.generateKey(),
			version,
			$kind: 'dek',
		};
	}
}
