import { EncryptionPrimitivesConfig } from './types';

export const ENCRYPTION_PRIMITIVES_CONFIG = {
	keySize: 32, // 256 bits
	nonceSize: 12,
	dekAlgorithm: 'AES-GCM',
} as const satisfies EncryptionPrimitivesConfig;
