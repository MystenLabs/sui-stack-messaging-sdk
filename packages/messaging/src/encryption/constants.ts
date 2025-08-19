import { EncryptionPrimitivesConfig } from './types';

export const ENCRYPTION_PRIMITIVES_CONFIG = {
	keySize: 32, // 256 bits
	nonceSize: 12,
	kekAlgorithm: 'AES-KWP',
	dekAlgorithm: 'AES-GCM',
	wrapAlgorithm: 'AES-KWP',
	deriveKeyAlgorithm: 'HKDF',
} satisfies EncryptionPrimitivesConfig;
