import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { Signer } from '@mysten/sui/cryptography';

import { MessagingClient } from '../src/client';
import { WalrusStorageAdapter } from '../src/storage/adapters/walrus/walrus';
import { WalrusClient } from '@mysten/walrus';
import { SealClient } from '@mysten/seal';
import { ALLOWLISTED_SEAL_KEY_SERVERS } from '../src/encryption/constants';

import * as channelModule from '../src/contracts/sui_messaging/channel';
import * as memberCapModule from '../src/contracts/sui_messaging/member_cap';
import * as messageModule from '../src/contracts/sui_messaging/message';
import { StorageAdapter, StorageOptions } from '../src/storage/adapters/storage';

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
 * @param packageId - The ID of the deployed Move package.
 * @param signer - The signer to use for transactions.
 * @returns An instance of the extended MessagingClient.
 */
export function createTestClient(
	suiJsonRpcClient: SuiClient,
	packageId: string,
	signer: Signer,
	network: 'localnet' | 'testnet',
) {
	return network === 'localnet'
		? suiJsonRpcClient
				.$extend(MockSealClient.asClientExtension())
				.$extend(MockWalrusClient.asClientExtension())
				.$extend(
					MessagingClient.experimental_asClientExtension({
						packageConfig: {
							packageId,
							memberCapType: `${packageId}::channel::MemberCap`,
							sealApproveContract: {
								packageId: packageId,
								module: 'seal_policies',
								functionName: 'seal_approve',
							},
							sealSessionKeyTTLmins: 10,
						},
						/*
                        {"error":{"status":"INTERNAL","code":500,"message":"could not find SUI coins with sufficient balance [requested_amount=Some(7141468)]","details":[{"@type":"ErrorInfo","reason":"INTERNAL_ERROR","domain":"daemon.walrus.space","metadata":{}},{"@type":"DebugInfo","stackEntries":[],"detail":"TraceID: 0"}]}}
                        */
						storage: (_client) => new MockStorageAdapter(),
						signer,
					}),
				)
		: suiJsonRpcClient
				.$extend(MockWalrusClient.asClientExtension())
				.$extend(MockSealClient.asClientExtension())
				.$extend(
					SealClient.asClientExtension({
						serverConfigs: ALLOWLISTED_SEAL_KEY_SERVERS['testnet'].map((id) => ({
							objectId: id,
							weight: 1,
						})),
					}),
				)
				.$extend(
					MessagingClient.experimental_asClientExtension({
						packageConfig: {
							packageId,
							memberCapType: `${packageId}::channel::MemberCap`,
							sealApproveContract: {
								packageId: packageId,
								module: 'seal_policies',
								functionName: 'seal_approve',
							},
							sealSessionKeyTTLmins: 10,
						},
						storage: (client) =>
							/*
                            {"error":{"status":"INTERNAL","code":500,"message":"could not find SUI coins with sufficient balance [requested_amount=Some(7141468)]","details":[{"@type":"ErrorInfo","reason":"INTERNAL_ERROR","domain":"daemon.walrus.space","metadata":{}},{"@type":"DebugInfo","stackEntries":[],"detail":"TraceID: 0"}]}}
                            */
							new WalrusStorageAdapter(client, {
								// Use testnet walrus for attachment storage in local tests
								publisher: 'https://publisher.walrus-testnet.walrus.space',
								aggregator: 'https://aggregator.walrus-testnet.walrus.space',
								epochs: 1,
							}),
						signer,
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

	const targetCap = await memberCaps.objects.find(async (cap) => {
		if (!cap.content) return false;
		const parsedCap = memberCapModule.MemberCap.parse(await cap.content);
		return parsedCap.channel_id === channelId;
	});

	if (!targetCap) {
		throw new Error(`MemberCap not found for address ${ownerAddress} in channel ${channelId}`);
	}

	return memberCapModule.MemberCap.parse(await targetCap.content);
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
