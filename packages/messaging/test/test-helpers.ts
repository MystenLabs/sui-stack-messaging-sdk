import { SuiClient } from '@mysten/sui/client';
import { bcs } from '@mysten/sui/bcs';
import { Signer } from '@mysten/sui/cryptography';

import { MessagingClient } from '../src/client';
import { WalrusStorageAdapter } from '../src/storage/adapters/walrus/walrus';
import { WalrusClient } from '@mysten/walrus';
import { SealClient } from '@mysten/seal';
import { ALLOWLISTED_SEAL_KEY_SERVERS } from '../src/encryption/constants';

import * as channelModule from '../src/contracts/sui_messaging/channel';
import * as permissionsModule from '../src/contracts/sui_messaging/permissions';
import * as messageModule from '../src/contracts/sui_messaging/message';
import { StorageAdapter, StorageOptions } from '../src/storage/adapters/storage';

// --- Constants ---

export const TestConstants = {
	ROLES: {
		CREATOR: 'Creator',
		RESTRICTED: 'Restricted',
	},
	PERMISSIONS: {
		CREATOR: [
			{ AddMember: true, $kind: 'AddMember' },
			{ RemoveMember: true, $kind: 'RemoveMember' },
			{ AddRole: true, $kind: 'AddRole' },
			{ PromoteMember: true, $kind: 'PromoteMember' },
			{ DemoteMember: true, $kind: 'DemoteMember' },
			{ RotateKey: true, $kind: 'RotateKey' },
			{ UpdateConfig: true, $kind: 'UpdateConfig' },
			{ UpdateMetadata: true, $kind: 'UpdateMetadata' },
			{ DeleteMessage: true, $kind: 'DeleteMessage' },
			{ PinMessage: true, $kind: 'PinMessage' },
		],
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
	async upload(data: Uint8Array[], options: StorageOptions): Promise<{ ids: string[] }> {
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
						storage: (client) => new MockStorageAdapter(),
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
 * Fetches and parses all roles from a channel's dynamic fields.
 * @param client - The SuiClient instance.
 * @param rolesTableId - The ID of the roles dynamic field table.
 * @returns An array of roles with their names and permissions.
 */
export async function getRoles(client: SuiClient, rolesTableId: string) {
	const rolesResponse = await client.core.getDynamicFields({ parentId: rolesTableId });
	const rolesPromises = rolesResponse.dynamicFields.map(async (role) => {
		const roleResponse = await client.core.getDynamicField({
			parentId: rolesTableId,
			name: role.name,
		});
		const roleNameContent = roleResponse.dynamicField.name.bcs;
		const roleName = bcs.String.parse(roleNameContent);
		const rolePermissionsContent = roleResponse.dynamicField.value.bcs;
		const rolePermissions = permissionsModule.Role.parse(rolePermissionsContent);
		return { name: roleName, permissions: rolePermissions.permissions.contents };
	});
	return Promise.all(rolesPromises);
}

/**
 * Fetches and parses all members from a channel's dynamic fields.
 * @param client - The SuiClient instance.
 * @param membersTableId - The ID of the members dynamic field table.
 * @returns An array of members with their address and info.
 */
export async function getMembers(client: SuiClient, membersTableId: string) {
	const membersResponse = await client.core.getDynamicFields({
		parentId: membersTableId,
	});
	const membersPromises = membersResponse.dynamicFields.map(async (member) => {
		const memberResponse = await client.core.getDynamicField({
			parentId: membersTableId,
			name: member.name,
		});
		const memberNameContent = memberResponse.dynamicField.name.bcs;
		const memberName = bcs.Address.parse(memberNameContent);
		const memberInfoContent = memberResponse.dynamicField.value.bcs;
		const memberInfo = channelModule.MemberInfo.parse(memberInfoContent);
		return { name: memberName, memberInfo };
	});
	return Promise.all(membersPromises);
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
		type: channelModule.MemberCap.name.replace('@local-pkg/sui-messaging', packageId),
	});

	const targetCap = await memberCaps.objects.find(async (cap) => {
		if (!cap.content) return false;
		const parsedCap = channelModule.MemberCap.parse(await cap.content);
		return parsedCap.channel_id === channelId;
	});

	if (!targetCap) {
		throw new Error(`MemberCap not found for address ${ownerAddress} in channel ${channelId}`);
	}

	return channelModule.MemberCap.parse(await targetCap.content);
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
