import { MessagingPackageConfig } from '../src/types';

export type TestEnvironment = 'localnet' | 'testnet';

export interface TestConfig {
	environment: TestEnvironment;
	packageConfig: MessagingPackageConfig;
	suiClientConfig: {
		url: string;
		network: 'localnet' | 'testnet';
	};
	sealConfig?: {
		serverConfigs: Array<{ objectId: string; weight: number }>;
	};
	walrusConfig?: {
		publisher: string;
		aggregator: string;
		epochs: number;
	};
}

/**
 * Gets the test configuration based on environment variables.
 *
 * Environment Variables:
 * - TEST_ENVIRONMENT: 'localnet' | 'testnet' (default: 'localnet')
 * - TESTNET_PACKAGE_ID: Required for testnet tests
 * - TESTNET_SEAL_APPROVE_PACKAGE_ID: Required for testnet tests
 * - SUI_RPC_URL: Optional, overrides default RPC URL
 */
export function getTestConfig(): TestConfig {
	const environment = (process.env.TEST_ENVIRONMENT as TestEnvironment) || 'localnet';

	if (environment === 'localnet') {
		return getLocalnetConfig();
	} else if (environment === 'testnet') {
		return getTestnetConfig();
	} else {
		throw new Error(
			`Unsupported test environment: ${environment}. Supported values: 'localnet', 'testnet'`,
		);
	}
}

function getLocalnetConfig(): TestConfig {
	// For localnet, package ID will be determined during Docker setup and package deployment
	// This is just a placeholder that gets replaced with the actual deployed package ID
	const packageId = '0x4e2d2aa45a092cdc9974d826619f08658b0408b898f9039b46113e0f6756b172';

	return {
		environment: 'localnet',
		packageConfig: {
			packageId,
			memberCapType: `${packageId}::channel::MemberCap`,
			sealApproveContract: {
				packageId,
				module: 'seal_policies',
				functionName: 'seal_approve',
			},
			sealSessionKeyTTLmins: 10,
		},
		suiClientConfig: {
			url: process.env.SUI_RPC_URL || 'http://127.0.0.1:9000',
			network: 'localnet',
		},
	};
}

function getTestnetConfig(): TestConfig {
	const packageId = process.env.TESTNET_PACKAGE_ID;
	const sealApprovePackageId = process.env.TESTNET_SEAL_APPROVE_PACKAGE_ID;

	if (!packageId) {
		throw new Error('TESTNET_PACKAGE_ID environment variable is required for testnet tests');
	}

	if (!sealApprovePackageId) {
		throw new Error(
			'TESTNET_SEAL_APPROVE_PACKAGE_ID environment variable is required for testnet tests',
		);
	}

	return {
		environment: 'testnet',
		packageConfig: {
			packageId,
			memberCapType: `${packageId}::channel::MemberCap`,
			sealApproveContract: {
				packageId: sealApprovePackageId,
				module: 'seal_policies',
				functionName: 'seal_approve',
			},
			sealSessionKeyTTLmins: 30,
		},
		suiClientConfig: {
			url: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
			network: 'testnet',
		},
		sealConfig: {
			serverConfigs: [
				{
					objectId: '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
					weight: 1,
				},
				{
					objectId: '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
					weight: 1,
				},
			],
		},
		walrusConfig: {
			publisher: 'https://publisher.walrus-testnet.walrus.space',
			aggregator: 'https://aggregator.walrus-testnet.walrus.space',
			epochs: 1,
		},
	};
}

/**
 * Validates that all required environment variables are set for the current test environment.
 */
export function validateTestEnvironment(): void {
	const config = getTestConfig();

	if (config.environment === 'testnet') {
		const requiredVars = ['TESTNET_PACKAGE_ID', 'TESTNET_SEAL_APPROVE_PACKAGE_ID'];
		const missing = requiredVars.filter((varName) => !process.env[varName]);

		if (missing.length > 0) {
			throw new Error(
				`Missing required environment variables for testnet tests: ${missing.join(', ')}\n` +
					'Please set these variables before running testnet tests.',
			);
		}
	}
}
