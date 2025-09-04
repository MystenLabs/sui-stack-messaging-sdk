import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { Signer } from '@mysten/sui/cryptography';
import { getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { GenericContainer, Network } from 'testcontainers';
import path from 'path';

import { MessagingClient } from '../src/client';
import { WalrusStorageAdapter } from '../src/storage/adapters/walrus/walrus';
import { WalrusClient } from '@mysten/walrus';
import { SealClient } from '@mysten/seal';

import * as channelModule from '../src/contracts/sui_messaging/channel';
import * as memberCapModule from '../src/contracts/sui_messaging/member_cap';
import * as messageModule from '../src/contracts/sui_messaging/message';
import { StorageAdapter, StorageOptions } from '../src/storage/adapters/storage';
import { getTestConfig, validateTestEnvironment, TestConfig } from './test-config';

// --- Constants ---

export const TestConstants = {
	// Note: The new auth system uses TypeName-based permissions instead of role-based permissions
	// Permissions are now managed through the Auth struct with VecMap<ID, VecSet<TypeName>>
	PERMISSIONS: {
		// These are the permission types available in the new system
		EDIT_PERMISSIONS: 'EditPermissions',
		SIMPLE_MESSENGER: 'SimpleMessenger',
		EDIT_ENCRYPTION_KEY: 'EditEncryptionKey',
		EDIT_CONFIG: 'EditConfig',
	},
};

// --- Test Environment Setup ---

export interface TestEnvironmentSetup {
	config: TestConfig;
	suiClient: SuiClient;
	signer: Signer;
	packageId: string;
	cleanup?: () => Promise<void>;
}

/**
 * Sets up the test environment based on the TEST_ENVIRONMENT variable.
 * For localnet: Sets up Docker containers and deploys the package
 * For testnet: Uses existing testnet infrastructure
 */
export async function setupTestEnvironment(): Promise<TestEnvironmentSetup> {
	// Validate environment variables
	validateTestEnvironment();

	const config = getTestConfig();

	if (config.environment === 'localnet') {
		return await setupLocalnetEnvironment(config);
	} else {
		return await setupTestnetEnvironment(config);
	}
}

async function setupLocalnetEnvironment(config: TestConfig): Promise<TestEnvironmentSetup> {
	const SUI_TOOLS_TAG =
		process.env.SUI_TOOLS_TAG ||
		(process.arch === 'arm64'
			? 'e4d7ef827d609d606907969372bb30ff4c10d60a-arm64'
			: 'e4d7ef827d609d606907969372bb30ff4c10d60a');

	// Start Docker network
	const dockerNetwork = await new Network().start();

	// Start PostgreSQL container
	const pg = await new GenericContainer('postgres')
		.withEnvironment({
			POSTGRES_USER: 'postgres',
			POSTGRES_PASSWORD: 'postgrespw',
			POSTGRES_DB: 'sui_indexer_v2',
		})
		.withCommand(['-c', 'max_connections=500'])
		.withExposedPorts(5432)
		.withNetwork(dockerNetwork)
		.start();

	// Start Sui local node
	const suiLocalNode = await new GenericContainer(`mysten/sui-tools:${SUI_TOOLS_TAG}`)
		.withCommand([
			'sui',
			'start',
			'--with-faucet',
			'--force-regenesis',
			'--with-indexer',
			'--pg-port',
			'5432',
			'--pg-db-name',
			'sui_indexer_v2',
			'--pg-host',
			pg.getIpAddress(dockerNetwork.getName()),
			'--pg-user',
			'postgres',
			'--pg-password',
			'postgrespw',
			'--with-graphql',
		])
		.withCopyDirectoriesToContainer([
			{
				source: path.resolve(__dirname, '../../../move/sui_messaging'),
				target: '/sui/sui_messaging',
			},
		])
		.withNetwork(dockerNetwork)
		.withExposedPorts(
			{ host: 9000, container: 9000 },
			{ host: 9123, container: 9123 },
			{ host: 9124, container: 9124 },
			{ host: 9125, container: 9125 },
		)
		.withLogConsumer((stream) => {
			stream.on('data', (data) => {
				console.log(data.toString());
			});
		})
		.start();

	// Setup Sui client and signer - exactly as it was in the original test
	const configResult = await suiLocalNode.exec([
		'sui',
		'client',
		'--yes',
		'--client.config',
		'/root/.sui/sui_config/client.yaml',
	]);

	const phraseRegex = /Secret Recovery Phrase\s*:\s*\[(.*?)]/;
	const phraseMatch = configResult.stdout.match(phraseRegex);
	if (!phraseMatch || !phraseMatch[1]) {
		throw new Error('Failed to extract recovery phrase from sui client config');
	}

	const recoveryPhrase = phraseMatch[1].trim();
	const signer = Ed25519Keypair.deriveKeypair(recoveryPhrase);

	// Verify the address matches
	const addressRegex = /address with scheme "ed25519" \[.*?: (0x[a-fA-F0-9]+)]/;
	const addressMatch = configResult.stdout.match(addressRegex);
	if (!addressMatch || !addressMatch[1]) {
		throw new Error('Failed to extract address from sui client config');
	}

	const address = addressMatch[1].trim();
	if (signer.toSuiAddress() !== address) {
		throw new Error('Signer address does not match extracted address');
	}

	// Setup localnet environment
	await suiLocalNode.exec([
		'sui',
		'client',
		'new-env',
		'--alias',
		'localnet',
		'--rpc',
		'http://127.0.0.1:9000',
		'--json',
	]);

	await suiLocalNode.exec(['sui', 'client', 'switch', '--env', 'localnet', '--json']);

	// Fund the account
	await suiLocalNode.exec(['sui', 'client', 'faucet']);

	// Publish the package
	const publishResult = await suiLocalNode.exec([
		'sui',
		'client',
		'publish',
		'./sui_messaging',
		'--json',
	]);

	const publishResultJson = JSON.parse(publishResult.stdout);
	if (publishResultJson.effects.status.status !== 'success') {
		throw new Error('Failed to publish package to localnet');
	}

	const published = publishResultJson.objectChanges.find(
		(change: any) => change.type === 'published',
	);
	if (!published) {
		throw new Error('Published package not found in transaction effects');
	}

	const packageId = published.packageId;

	// Create Sui client with the deployed package ID
	const suiClient = new SuiClient({
		url: getFullnodeUrl('localnet'),
		mvr: {
			overrides: {
				packages: {
					'@local-pkg/sui-messaging': packageId,
				},
			},
		},
	});

	// Cleanup function
	const cleanup = async () => {
		await pg.stop();
		await suiLocalNode.stop();
		await dockerNetwork.stop();
	};

	// Update the config with the actual deployed package ID
	const updatedConfig = {
		...config,
		packageConfig: {
			...config.packageConfig,
			packageId,
			memberCapType: `${packageId}::channel::MemberCap`,
			sealApproveContract: {
				...config.packageConfig.sealApproveContract,
				packageId,
			},
		},
	};

	return {
		config: updatedConfig,
		suiClient,
		signer,
		packageId,
		cleanup,
	};
}

async function setupTestnetEnvironment(config: TestConfig): Promise<TestEnvironmentSetup> {
	// For testnet, we use the existing infrastructure without Docker containers
	const suiClient = new SuiClient({
		url: getFullnodeUrl('testnet'),
		mvr: {
			overrides: {
				packages: {
					'@local-pkg/sui-messaging': config.packageConfig.packageId,
				},
			},
		},
	});

	// Generate a test signer for testnet
	// Note: In a real scenario, you might want to use a pre-funded test account
	// For now, we generate a new keypair - you'll need to fund it manually if needed
	const signer = Ed25519Keypair.deriveKeypair(config.phrase);

	return {
		config,
		suiClient,
		signer,
		packageId: config.packageConfig.packageId,
		// No cleanup needed for testnet since we're not using Docker containers
	};
}

// --- Client Creation ---

// --- Mocks ---

/**
 * A mock SealClient for localnet testing.
 * SealClient officially supports only testnet and mainnet. This mock
 * bypasses actual encryption and acts as a pass-through for the DEK,
 * and mimics the static `asClientExtension` method for a consistent API.
 */
class MockSealClient {
	async encrypt({ data }: { data: Uint8Array }): Promise<{
		encryptedObject: Uint8Array;
		key: Uint8Array;
	}> {
		// For local testing, we bypass Seal encryption.
		// The "encrypted" object is simply the original data (the DEK).
		// The returned `key` can be the same, as it's used for backup purposes.
		return {
			encryptedObject: data,
			key: data,
		};
	}

	async decrypt({ data }: { data: Uint8Array }): Promise<Uint8Array> {
		// The mock decrypt is an identity function.
		// It returns the "encrypted object" as is, because for the mock, it's just the raw DEK.
		return data;
	}

	/**
	 * Returns the client extension to be used with `SuiClient.$extend`.
	 * This mirrors the real SealClient's API for consistency.
	 */
	static asClientExtension() {
		return {
			name: 'seal' as const,
			register: () => new MockSealClient() as unknown as SealClient,
		};
	}
}

class MockWalrusClient {
	/**
	 * Returns the client extension to be used with `SuiClient.$extend`.
	 * This mirrors the real SealClient's API for consistency.
	 */
	static asClientExtension() {
		return {
			name: 'walrus' as const,
			register: () => new MockWalrusClient() as unknown as WalrusClient,
		};
	}
}

// Add a mock storage adapter for tests
class MockStorageAdapter implements StorageAdapter {
	async upload(data: Uint8Array[], _options: StorageOptions): Promise<{ ids: string[] }> {
		// artificial delay
		await new Promise((resolve) => setTimeout(resolve, 1000));
		// Return mock blob IDs for testing
		return { ids: data.map((_, i) => `mock-blob-${i}-${Date.now()}`) };
	}
}

/**
 * Creates a fully extended MessagingClient for tests.
 * @param suiJsonRpcClient - The base SuiClient.
 * @param config - The test configuration.
 * @param signer - The signer to use for transactions.
 * @returns An instance of the extended MessagingClient.
 */
export function createTestClient(suiJsonRpcClient: SuiClient, config: TestConfig, signer: Signer) {
	return config.environment === 'localnet'
		? suiJsonRpcClient
				.$extend(MockSealClient.asClientExtension())
				.$extend(MockWalrusClient.asClientExtension())
				.$extend(
					MessagingClient.experimental_asClientExtension({
						packageConfig: config.packageConfig,
						storage: (_client) => new MockStorageAdapter(),
						sessionKeyConfig: {
							address: signer.toSuiAddress(),
							ttlMin: 30,
							signer,
						},
					}),
				)
		: suiJsonRpcClient
				.$extend(MockWalrusClient.asClientExtension())
				.$extend(
					SealClient.asClientExtension({
						serverConfigs: config.sealConfig?.serverConfigs || [],
					}),
				)
				.$extend(
					MessagingClient.experimental_asClientExtension({
						packageConfig: config.packageConfig,
						storage: (client) => {
							if (!config.walrusConfig) {
								throw new Error('Walrus configuration is required for testnet tests');
							}
							return new WalrusStorageAdapter(client, config.walrusConfig);
						},
						sessionKeyConfig: {
							address: signer.toSuiAddress(),
							ttlMin: 30,
							signer,
						},
					}),
				);
}

// --- On-Chain Data Fetching & Parsing Helpers ---

/**
 * Fetches and parses a Channel object from the blockchain.
 * @param client - The SuiClient instance.
 * @param channelId - The ID of the channel object.
 * @returns The parsed Channel object.
 */
export async function getChannelObject(client: SuiClient, channelId: string) {
	const channelResponse = await client.core.getObject({ objectId: channelId });
	const channelContent = await channelResponse.object.content;
	return channelModule.Channel.parse(channelContent);
}

/**
 * Fetches and parses member permissions from a channel's auth struct.
 * @param client - The SuiClient instance.
 * @param channelId - The ID of the channel object.
 * @returns An array of members with their permissions.
 */
export async function getMemberPermissions(client: SuiClient, channelId: string) {
	const channelResponse = await client.core.getObject({ objectId: channelId });
	const channelContent = await channelResponse.object.content;
	const channel = channelModule.Channel.parse(channelContent);

	// The auth struct contains member_permissions: VecMap<ID, VecSet<TypeName>>
	// We need to extract the member permissions from the auth field
	const auth = channel.auth;

	// Note: The actual parsing of VecMap and VecSet would require more complex logic
	// This is a simplified version that returns the auth structure
	return {
		auth,
		memberPermissions: auth.member_permissions, // This contains the VecMap<ID, VecSet<TypeName>>
	};
}

/**
 * Fetches all MemberCap objects for a specific channel.
 * @param client - The SuiClient instance.
 * @param channelId - The ID of the channel.
 * @param packageId - The ID of the Move package.
 * @returns An array of MemberCap objects.
 */
export async function getChannelMemberCaps(client: SuiClient, channelId: string) {
	// Get the channel object to access its auth struct
	const channelResponse = await client.core.getObject({ objectId: channelId });
	const channelContent = await channelResponse.object.content;
	const channel = channelModule.Channel.parse(channelContent);

	// Extract the member permissions from the auth struct
	const memberPermissions = channel.auth.member_permissions;

	// The memberPermissions.contents is a vector of Entry objects
	// Each Entry has a key (MemberCap ID) and value (permission set)
	const memberCapIds = memberPermissions.contents.map((entry: any) => entry.key);

	// Now fetch all the MemberCap objects using their IDs
	const memberCapObjects = await client.core.getObjects({
		objectIds: memberCapIds,
	});

	// Parse the MemberCap objects and filter out any errors
	const memberCaps = [];
	for (const obj of memberCapObjects.objects) {
		if (obj instanceof Error || !obj.content) {
			console.warn('Failed to fetch MemberCap object:', obj);
			continue;
		}

		try {
			const memberCap = memberCapModule.MemberCap.parse(await obj.content);
			memberCaps.push(memberCap);
		} catch (error) {
			console.warn('Failed to parse MemberCap object:', error);
		}
	}

	return memberCaps;
}

/**
 * Fetches a user's MemberCap object for a specific channel.
 * @param client - The SuiClient instance.
 * @param ownerAddress - The address of the owner.
 * @param packageId - The ID of the Move package.
 * @param channelId - The ID of the channel.
 * @returns The MemberCap object.
 */
export async function getMemberCapObject(
	client: SuiClient,
	ownerAddress: string,
	packageId: string,
	channelId: string,
) {
	const memberCaps = await client.core.getOwnedObjects({
		address: ownerAddress,
		type: `${packageId}::member_cap::MemberCap`,
	});

	// Parse all MemberCaps and find the one that matches the channelId
	const parsedCaps = await Promise.all(
		memberCaps.objects.map(async (cap) => {
			if (!cap.content) return null;
			const parsedCap = memberCapModule.MemberCap.parse(await cap.content);
			return parsedCap;
		}),
	);

	const targetCap = parsedCaps.find((cap) => cap && cap.channel_id === channelId);

	if (!targetCap) {
		throw new Error(`MemberCap not found for address ${ownerAddress} in channel ${channelId}`);
	}

	return targetCap;
}

/**
 * Fetches and parses all messages from a channel.
 * @param client - The SuiClient instance.
 * @param messagesTableVecId - The ID of the messages TableVec.
 * @returns An array of parsed message objects.
 */
export async function getMessages(client: SuiClient, messagesTableVecId: string) {
	const messagesResponse = await client.core.getDynamicFields({ parentId: messagesTableVecId });
	const messagesPromises = messagesResponse.dynamicFields.map(async (message) => {
		const messageResponse = await client.core.getDynamicField({
			parentId: messagesTableVecId,
			name: message.name,
		});
		const messageNameContent = messageResponse.dynamicField.name.bcs;
		const messageName = bcs.U64.parse(messageNameContent);
		const messageId = messageResponse.dynamicField.id;
		const messageContent = messageResponse.dynamicField.value.bcs;
		const messageObj = messageModule.Message.parse(messageContent);
		return { name: messageName, id: messageId, message: messageObj };
	});
	return Promise.all(messagesPromises);
}
