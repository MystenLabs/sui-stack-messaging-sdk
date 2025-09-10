import type { EncryptionPrimitivesConfig } from './types.js';

export const ENCRYPTION_PRIMITIVES_CONFIG = {
	keySize: 256,
	nonceSize: 12,
	dekAlgorithm: 'AES-GCM',
} as const satisfies EncryptionPrimitivesConfig;

export const ALLOWLISTED_SEAL_KEY_SERVERS = {
	mainnet: [],
	testnet: [
		'0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
		'0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
	],
};
