// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui-grpc';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createTestClient, setupTestEnvironment, TestEnvironmentSetup } from './test-helpers';
import { EncryptedSymmetricKey } from '../src/encryption/types';
import { MemberCap } from '../src/contracts/sui_stack_messaging/member_cap';

// Type alias for our fully extended client
type TestClient = ReturnType<typeof createTestClient>;

describe('Integration tests - Write Path', () => {
	const DEFAULT_GRAPHQL_URL = 'http://127.0.0.1:9125';

	let testSetup: TestEnvironmentSetup;
	let suiJsonRpcClient: any; // Will be set from testSetup
	// @ts-ignore todo: remove when support added
	let suiGraphQLClient: SuiGraphQLClient;
	// @ts-ignore todo: remove when support added
	let suiGrpcClient: SuiGrpcClient;
	let signer: Signer;
	// let packageId: string; // No longer needed since we use MessagingClient methods

	// --- Test Suite Setup & Teardown ---
	beforeAll(async () => {
		// Setup test environment based on TEST_ENVIRONMENT variable
		testSetup = await setupTestEnvironment();
		suiJsonRpcClient = testSetup.suiClient;
		signer = testSetup.signer;
		// packageId = testSetup.packageId; // No longer needed

		// Setup GraphQL and gRPC clients for localnet only
		if (testSetup.config.environment === 'localnet') {
			suiGraphQLClient = new SuiGraphQLClient({ url: DEFAULT_GRAPHQL_URL });
			suiGrpcClient = new SuiGrpcClient({
				network: 'localnet',
				transport: new GrpcWebFetchTransport({ baseUrl: 'http://127.0.0.1:9000' }),
			});
		}
	}, 200000);

	afterAll(async () => {
		// Cleanup test environment if cleanup function is provided
		if (testSetup.cleanup) {
			await testSetup.cleanup();
		}
	});

	// --- Test Cases ---

	describe('Channel Creation', () => {
		it('should create a channel with correct initial state and roles', async () => {
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);
			const initialMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest, channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [initialMember],
			});
			expect(digest).toBeDefined();
			expect(channelId).toBeDefined();

			const channelObjects = await client.messaging.getChannelObjectsByChannelIds({
				channelIds: [channelId],
				userAddress: signer.toSuiAddress(),
			});
			const channel = channelObjects[0];

			// Assert channel properties
			expect(channel.id.id).toBe(channelId);
			expect(channel.version).toBe('1');
			expect(channel.messages_count).toBe('0');
			expect(channel.created_at_ms).toMatch(/[0-9]+/);
			expect(channel.updated_at_ms).toEqual(channel.created_at_ms);
			expect(channel.encryption_key_history).toBeDefined();

			// Assert member permissions using the new auth system
			expect(channel.auth).toBeDefined();
			expect(channel.auth.member_permissions).toBeDefined();

			// Assert members - get the creator's MemberCap
			const memberships = await client.messaging.getChannelMemberships({
				address: signer.toSuiAddress(),
			});
			const creatorMembership = memberships.memberships.find((m) => m.channel_id === channelId);
			expect(creatorMembership).toBeDefined();

			// Get the actual MemberCap object
			const creatorMemberCapObjects = await client.core.getObjects({
				objectIds: [creatorMembership!.member_cap_id],
			});
			const creatorMemberCapObject = creatorMemberCapObjects.objects[0];
			if (creatorMemberCapObject instanceof Error || !creatorMemberCapObject.content) {
				throw new Error('Failed to fetch creator MemberCap object');
			}
			const creatorMemberCap = MemberCap.parse(await creatorMemberCapObject.content);
			expect(creatorMemberCap).toBeDefined();
			expect(creatorMemberCap.channel_id).toBe(channelId);

			// Get all MemberCaps for this channel using the new auth system
			// We'll get the channel's auth structure and extract member cap IDs
			const channelAuth = channel.auth;
			const memberCapIds = channelAuth.member_permissions.contents.map((entry: any) => entry.key);

			// Fetch all the MemberCap objects using their IDs
			const allMemberCapObjects = await client.core.getObjects({
				objectIds: memberCapIds,
			});

			// Parse the MemberCap objects and filter out any errors
			const channelMemberCaps = [];
			for (const obj of allMemberCapObjects.objects) {
				if (obj instanceof Error || !obj.content) {
					console.warn('Failed to fetch MemberCap object:', obj);
					continue;
				}
				try {
					const memberCap = MemberCap.parse(await obj.content);
					channelMemberCaps.push(memberCap);
				} catch (error) {
					console.warn('Failed to parse MemberCap object:', error);
				}
			}

			// We should have at least the creator's MemberCap
			expect(channelMemberCaps.length).toBeGreaterThanOrEqual(1);

			// Verify the creator's MemberCap is in the list
			const foundCreatorMemberCap = channelMemberCaps.find(
				(cap) => cap.id.id === creatorMemberCap.id.id,
			);
			expect(foundCreatorMemberCap).toBeDefined();
			expect(foundCreatorMemberCap?.channel_id).toBe(channelId);

			// If we have an initial member, verify their MemberCap is also in the list
			if (initialMember) {
				const initialMemberMemberships = await client.messaging.getChannelMemberships({
					address: initialMember,
				});
				const initialMemberMembership = initialMemberMemberships.memberships.find(
					(m) => m.channel_id === channelId,
				);
				expect(initialMemberMembership).toBeDefined();

				// Get the actual MemberCap object
				const initialMemberCapObjects = await client.core.getObjects({
					objectIds: [initialMemberMembership!.member_cap_id],
				});
				const initialMemberCapObject = initialMemberCapObjects.objects[0];
				if (initialMemberCapObject instanceof Error || !initialMemberCapObject.content) {
					throw new Error('Failed to fetch initial member MemberCap object');
				}
				const initialMemberCap = MemberCap.parse(await initialMemberCapObject.content);
				expect(initialMemberCap).toBeDefined();
				expect(initialMemberCap.channel_id).toBe(channelId);

				// Verify the initial member's MemberCap is in the channel's member list
				const foundInitialMemberCap = channelMemberCaps.find(
					(cap) => cap.id.id === initialMemberCap.id.id,
				);
				expect(foundInitialMemberCap).toBeDefined();
			}

			// Test the new getChannelMembers method
			const channelMembers = await client.messaging.getChannelMembers(channelId);
			expect(channelMembers.members).toBeDefined();
			expect(channelMembers.members.length).toBeGreaterThanOrEqual(1);

			// Verify the creator is in the members list
			const creatorMember = channelMembers.members.find(
				(member) => member.memberAddress === signer.toSuiAddress(),
			);
			expect(creatorMember).toBeDefined();
			expect(creatorMember?.memberCapId).toBeDefined();

			// If we have an initial member, verify they are also in the members list
			if (initialMember) {
				const initialMemberInList = channelMembers.members.find(
					(member) => member.memberAddress === initialMember,
				);
				expect(initialMemberInList).toBeDefined();
				expect(initialMemberInList?.memberCapId).toBeDefined();
			}
		}, 60000);
	});

	describe('Message Sending', () => {
		let client: TestClient;
		let channelObj: any; // Will be DecryptedChannelObject from the API
		let memberCap: (typeof MemberCap)['$inferType'];
		let encryptionKey: EncryptedSymmetricKey;

		// Before each message test, create a fresh channel
		beforeAll(async () => {
			client = createTestClient(suiJsonRpcClient, testSetup.config, signer);
			const { channelId: newChannelId, encryptedKeyBytes } =
				await client.messaging.executeCreateChannelTransaction({
					signer,
					initialMembers: [Ed25519Keypair.generate().toSuiAddress()],
				});

			const channelObjects = await client.messaging.getChannelObjectsByChannelIds({
				channelIds: [newChannelId],
				userAddress: signer.toSuiAddress(),
			});
			channelObj = channelObjects[0];

			// Get the creator's MemberCap
			const memberships = await client.messaging.getChannelMemberships({
				address: signer.toSuiAddress(),
			});
			const creatorMembership = memberships.memberships.find((m) => m.channel_id === newChannelId);
			expect(creatorMembership).toBeDefined();

			// Get the actual MemberCap object
			const memberCapObjects = await client.core.getObjects({
				objectIds: [creatorMembership!.member_cap_id],
			});
			const memberCapObject = memberCapObjects.objects[0];
			if (memberCapObject instanceof Error || !memberCapObject.content) {
				throw new Error('Failed to fetch MemberCap object');
			}
			memberCap = MemberCap.parse(await memberCapObject.content);
			console.log('channelObj', JSON.stringify(channelObj, null, 2));
			console.log('memberCap', JSON.stringify(memberCap, null, 2));

			const encryptionKeyVersion = channelObj.encryption_key_history.latest_version;
			expect(encryptionKeyVersion).toBe(1); // First version should be 1
			// This should not be empty
			expect(channelObj.encryption_key_history.latest.length).toBeGreaterThan(0);
			encryptionKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(channelObj.encryption_key_history.latest),
				version: encryptionKeyVersion,
			};
			expect(encryptedKeyBytes).toEqual(new Uint8Array(channelObj.encryption_key_history.latest));
		});

		it('should send and decrypt a message with an attachment', async () => {
			const messageText = 'Hello with attachment!';
			const fileContent = new TextEncoder().encode(`Attachment content: ${Date.now()}`);
			const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

			console.log('channelObj', JSON.stringify(channelObj, null, 2));
			console.log('memberCap', JSON.stringify(memberCap, null, 2));

			const { digest, messageId } = await client.messaging.executeSendMessageTransaction({
				signer,
				channelId: memberCap.channel_id,
				memberCapId: memberCap.id.id,
				message: messageText,
				encryptedKey: encryptionKey,
				attachments: [file],
			});
			expect(digest).toBeDefined();
			expect(messageId).toBeDefined();

			// Refetch channel object to check for last_message
			// const channelObjectsFresh = await client.messaging.getChannelObjectsByChannelIds([memberCap.channel_id]);
			// const channelObjFresh = channelObjectsFresh[0]; // Not used in current test
			const messagesResponse = await client.messaging.getChannelMessages({
				channelId: memberCap.channel_id,
				userAddress: signer.toSuiAddress(),
				limit: 10,
				direction: 'backward',
			});
			// Since we can't match by ID, we'll check that we have exactly one message with the expected properties
			expect(messagesResponse.messages.length).toBe(1);
			const sentMessage = messagesResponse.messages[0];

			expect(sentMessage.sender).toBe(signer.toSuiAddress());
			expect(sentMessage.text).toBe(messageText);
			expect(sentMessage.createdAtMs).toMatch(/[0-9]+/);
			expect(sentMessage.attachments).toHaveLength(1);
		}, 320000);

		it('should send and decrypt a message without an attachment', async () => {
			const messageText = 'Hello, no attachment here.';

			for (let i = 0; i < 5; i++) {
				const { digest, messageId } = await client.messaging.executeSendMessageTransaction({
					signer,
					channelId: memberCap.channel_id,
					memberCapId: memberCap.id.id,
					message: messageText,
					encryptedKey: encryptionKey,
				});
				expect(digest).toBeDefined();
				console.log(`messageId: ${messageId}`);
				// wait for the transaction
				// await client.core.waitForTransaction({ digest });
			}

			const messagesResponse = await client.messaging.getChannelMessages({
				channelId: memberCap.channel_id,
				userAddress: signer.toSuiAddress(),
				limit: 10,
				direction: 'backward',
			});

			// Messages are now automatically decrypted, so we can use them directly
			const decryptedMessages = messagesResponse.messages;

			console.log(
				'messages',
				JSON.stringify(
					decryptedMessages.map((m) => ({
						createdAtMs: m.createdAtMs,
						sender: m.sender,
						text: m.text,
					})),
					null,
					2,
				),
			);
		}, 320000);
	});
});
