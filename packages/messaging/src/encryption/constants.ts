import { EncryptionPrimitivesConfig } from './types';

export const ENCRYPTION_PRIMITIVES_CONFIG = {
	keySize: 32, // 256 bits
	nonceSize: 12,
	kekAlgorithm: 'AES-KW',
	dekAlgorithm: 'AES-GCM',
	wrapAlgorithm: 'AES-KW',
	deriveKeyAlgorithm: 'HKDF',
} as const satisfies EncryptionPrimitivesConfig;
