// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui/grpc';
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
	let userSigner: Signer;
	// let packageId: string; // No longer needed since we use MessagingClient methods

	// --- Test Suite Setup & Teardown ---
	beforeAll(async () => {
		// Setup test environment based on TEST_ENVIRONMENT variable
		testSetup = await setupTestEnvironment();
		suiJsonRpcClient = testSetup.suiClient;
		signer = testSetup.signer;
		userSigner = testSetup.userSigner;
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

			// Assert members - get the creator's MemberCap using the new getUserMemberCap method
			const creatorMemberCap = await client.messaging.getUserMemberCap(
				signer.toSuiAddress(),
				channelId,
			);
			expect(creatorMemberCap).toBeDefined();
			expect(creatorMemberCap!.channel_id).toBe(channelId);

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
				(cap) => cap.id.id === creatorMemberCap!.id.id,
			);
			expect(foundCreatorMemberCap).toBeDefined();
			expect(foundCreatorMemberCap?.channel_id).toBe(channelId);

			// If we have an initial member, verify their MemberCap is also in the list
			if (initialMember) {
				// Use getUserMemberCap to get the initial member's MemberCap
				const initialMemberCap = await client.messaging.getUserMemberCap(initialMember, channelId);
				expect(initialMemberCap).toBeDefined();
				expect(initialMemberCap!.channel_id).toBe(channelId);

				// Verify the initial member's MemberCap is in the channel's member list
				const foundInitialMemberCap = channelMemberCaps.find(
					(cap) => cap.id.id === initialMemberCap!.id.id,
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

		it('should handle duplicate member addresses correctly', async () => {
			// Arrange
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);
			const duplicateMemberAddress = Ed25519Keypair.generate().toSuiAddress();
			const creatorAddress = signer.toSuiAddress();

			// Act: Create channel with same address repeated 3 times (should deduplicate to 1)
			const { channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [duplicateMemberAddress, duplicateMemberAddress, duplicateMemberAddress],
			});

			// Assert: Verify deduplication worked

			// 1. Channel should be queryable by ID
			const channelObjects = await client.messaging.getChannelObjectsByChannelIds({
				channelIds: [channelId],
				userAddress: creatorAddress,
			});
			expect(channelObjects).toHaveLength(1);
			expect(channelObjects[0].id.id).toBe(channelId);

			// 2. Should only have 2 members total (creator + 1 deduplicated member, not 4)
			const channelMembers = await client.messaging.getChannelMembers(channelId);
			expect(channelMembers.members).toHaveLength(2);

			// 3. Duplicated address should appear exactly once
			const duplicatedMembers = channelMembers.members.filter(
				(member) => member.memberAddress === duplicateMemberAddress,
			);
			expect(duplicatedMembers).toHaveLength(1);

			// 4. Creator should appear exactly once
			const creatorMembers = channelMembers.members.filter(
				(member) => member.memberAddress === creatorAddress,
			);
			expect(creatorMembers).toHaveLength(1);

			// 5. Both addresses should be in the members list
			const memberAddresses = channelMembers.members.map((m) => m.memberAddress);
			expect(memberAddresses).toContain(creatorAddress);
			expect(memberAddresses).toContain(duplicateMemberAddress);
		}, 60000);

		it('should filter out creator address from initialMembers', async () => {
			// Arrange
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);
			const regularMember = Ed25519Keypair.generate().toSuiAddress();
			const creatorAddress = signer.toSuiAddress();

			// Act: Create channel with creator address in initialMembers (should be filtered out)
			const { channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [regularMember, creatorAddress], // Creator included (should be ignored)
			});

			// Assert: Verify only 2 MemberCaps created (not 3)
			const channelMembers = await client.messaging.getChannelMembers(channelId);

			// Should have exactly 2 members total
			expect(channelMembers.members).toHaveLength(2);

			// Creator should appear exactly once (not twice)
			const creatorMemberships = channelMembers.members.filter(
				(member) => member.memberAddress === creatorAddress,
			);
			expect(creatorMemberships).toHaveLength(1);

			// Regular member should appear exactly once
			const regularMemberMemberships = channelMembers.members.filter(
				(member) => member.memberAddress === regularMember,
			);
			expect(regularMemberMemberships).toHaveLength(1);

			// Both member addresses should be present
			const memberAddresses = channelMembers.members.map((m) => m.memberAddress);
			expect(memberAddresses).toContain(creatorAddress);
			expect(memberAddresses).toContain(regularMember);
		}, 60000);
	});

	describe('Adding Members to Channel', () => {
		it('should add members using executeAddMembersTransaction', async () => {
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);

			// Create a channel first
			const { channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
			});

			// Use getUserMemberCap to get creator's MemberCap
			const creatorMemberCap = await client.messaging.getUserMemberCap(
				signer.toSuiAddress(),
				channelId,
			);
			expect(creatorMemberCap).toBeDefined();

			// Add 3 new members - CreatorCap is auto-fetched using signer's address
			const newMember1 = Ed25519Keypair.generate().toSuiAddress();
			const newMember2 = Ed25519Keypair.generate().toSuiAddress();
			const newMember3 = Ed25519Keypair.generate().toSuiAddress();

			const { digest, addedMembers } = await client.messaging.executeAddMembersTransaction({
				channelId,
				memberCapId: creatorMemberCap!.id.id,
				newMemberAddresses: [newMember1, newMember2, newMember3],
				signer,
			});

			expect(digest).toBeDefined();
			expect(addedMembers).toHaveLength(3);

			// Verify each added member has correct structure
			const expectedAddresses = [newMember1, newMember2, newMember3];
			addedMembers.forEach((addedMember) => {
				expect(addedMember.memberCap).toBeDefined();
				expect(addedMember.memberCap.channel_id).toBe(channelId);
				expect(addedMember.ownerAddress).toBeDefined();
				expect(expectedAddresses).toContain(addedMember.ownerAddress);
			});

			// Verify channel now has 4 members (creator + 3 new)
			const channelMembers = await client.messaging.getChannelMembers(channelId);
			expect(channelMembers.members.length).toBe(4);

			// Verify new members are in the list
			const member1 = channelMembers.members.find((m) => m.memberAddress === newMember1);
			const member2 = channelMembers.members.find((m) => m.memberAddress === newMember2);
			const member3 = channelMembers.members.find((m) => m.memberAddress === newMember3);
			expect(member1).toBeDefined();
			expect(member2).toBeDefined();
			expect(member3).toBeDefined();
		}, 60000);

		it('should handle duplicate addresses when adding members', async () => {
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);

			// Create a channel
			const { channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
			});

			// Use getUserMemberCap to get creator's MemberCap
			const creatorMemberCap = await client.messaging.getUserMemberCap(
				signer.toSuiAddress(),
				channelId,
			);
			expect(creatorMemberCap).toBeDefined();

			// Try adding members with duplicate addresses - CreatorCap auto-fetched
			const newMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest, addedMembers } = await client.messaging.executeAddMembersTransaction({
				channelId,
				memberCapId: creatorMemberCap!.id.id,
				newMemberAddresses: [newMember, newMember, newMember],
				signer,
			});

			expect(digest).toBeDefined();
			// Should only create 1 member cap (deduplicated)
			expect(addedMembers).toHaveLength(1);
			expect(addedMembers[0].ownerAddress).toBe(newMember);

			// Verify channel has 2 members (creator + 1 deduplicated new member)
			const channelMembers = await client.messaging.getChannelMembers(channelId);
			expect(channelMembers.members.length).toBe(2);
		}, 60000);

		it('should use addMembersTransaction to build custom transaction', async () => {
			const client = createTestClient(suiJsonRpcClient, testSetup.config, signer);

			// Create a channel
			const { channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
			});

			// Use getUserMemberCap to get creator's MemberCap
			const creatorMemberCap = await client.messaging.getUserMemberCap(
				signer.toSuiAddress(),
				channelId,
			);
			expect(creatorMemberCap).toBeDefined();

			const newMember = Ed25519Keypair.generate().toSuiAddress();

			// Use addMembersTransaction to get a transaction object - CreatorCap auto-fetched via address
			const tx = await client.messaging.addMembersTransaction({
				channelId,
				memberCapId: creatorMemberCap!.id.id,
				newMemberAddresses: [newMember],
				address: signer.toSuiAddress(),
			});

			expect(tx).toBeDefined();

			// Set the sender before signing
			tx.setSenderIfNotSet(signer.toSuiAddress());

			// Sign and execute the transaction
			const { digest } = await signer.signAndExecuteTransaction({
				transaction: tx,
				client: client.core,
			});

			expect(digest).toBeDefined();

			await client.core.waitForTransaction({ digest });

			// Verify member was added
			const channelMembers = await client.messaging.getChannelMembers(channelId);
			expect(channelMembers.members.length).toBe(2);
			const addedMember = channelMembers.members.find((m) => m.memberAddress === newMember);
			expect(addedMember).toBeDefined();
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

			// Get the creator's MemberCap using getUserMemberCap
			const creatorMemberCap = await client.messaging.getUserMemberCap(
				signer.toSuiAddress(),
				newChannelId,
			);
			expect(creatorMemberCap).toBeDefined();
			memberCap = creatorMemberCap!;
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

			// console.log('channelObj', JSON.stringify(channelObj, null, 2));
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

	describe('Examples.md - In-app Product Support', () => {
		it('should implement complete 1:1 support channel flow from Examples.md', async () => {
			// Step 1: Setup the client (support team uses main signer)
			const supportSigner = signer;
			const client = createTestClient(suiJsonRpcClient, testSetup.config, supportSigner);
			const messaging = client.messaging;

			// Step 2: Create a 1:1 support channel for a user
			const topUserAddress = userSigner.toSuiAddress();

			const { channelId, encryptedKeyBytes } = await messaging.executeCreateChannelTransaction({
				signer: supportSigner,
				initialMembers: [topUserAddress],
			});

			console.log(`Support channel created for user: ${channelId}`);
			expect(channelId).toBeDefined();
			expect(encryptedKeyBytes).toBeDefined();

			// Step 3: Fetch the memberCapId and encryptionKey (support handle) using getUserMemberCap
			const supportMemberCap = await messaging.getUserMemberCap(
				supportSigner.toSuiAddress(),
				channelId,
			);
			expect(supportMemberCap).toBeDefined();
			const supportMemberCapId = supportMemberCap!.id.id;

			// Get the channel object with encryption key info
			const channelObjects = await messaging.getChannelObjectsByChannelIds({
				channelIds: [channelId],
				userAddress: supportSigner.toSuiAddress(),
			});
			const channelObj = channelObjects[0];
			const channelEncryptionKey: EncryptedSymmetricKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(channelObj.encryption_key_history.latest),
				version: channelObj.encryption_key_history.latest_version,
			};

			// Step 3b: Get user's memberCapId using getUserMemberCap
			const userMemberCap = await messaging.getUserMemberCap(topUserAddress, channelId);
			expect(userMemberCap).toBeDefined();
			const userMemberCapId = userMemberCap!.id.id;

			// Get user's channel object with encryption key
			const userChannelObjects = await messaging.getChannelObjectsByChannelIds({
				channelIds: [channelId],
				userAddress: topUserAddress,
			});
			const userChannelObj = userChannelObjects[0];
			const userChannelEncryptionKey: EncryptedSymmetricKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(userChannelObj.encryption_key_history.latest),
				version: userChannelObj.encryption_key_history.latest_version,
			};

			// Step 4: User sends a support query
			const userClient = createTestClient(suiJsonRpcClient, testSetup.config, userSigner);
			const userQuery = "I can't claim my reward from yesterday's tournament.";

			const { digest: userDigest, messageId: userMessageId } =
				await userClient.messaging.executeSendMessageTransaction({
					signer: userSigner,
					channelId,
					memberCapId: userMemberCapId,
					message: userQuery,
					encryptedKey: userChannelEncryptionKey,
				});

			console.log(`User sent query ${userMessageId} in tx ${userDigest}`);
			expect(userDigest).toBeDefined();
			expect(userMessageId).toBeDefined();

			// Step 5: Support team reads the user query
			const messages = await messaging.getChannelMessages({
				channelId,
				userAddress: supportSigner.toSuiAddress(),
				limit: 5,
				direction: 'backward',
			});

			expect(messages.messages).toHaveLength(1);
			const receivedQuery = messages.messages[0];
			expect(receivedQuery.sender).toBe(topUserAddress);
			expect(receivedQuery.text).toBe(userQuery);

			console.log(`👤 ${receivedQuery.sender}: ${receivedQuery.text}`);

			// Support sends a reply
			const supportReply = 'Thanks for reaching out! Can you confirm the reward ID?';
			const { digest: supportDigest, messageId: supportMessageId } =
				await messaging.executeSendMessageTransaction({
					signer: supportSigner,
					channelId,
					memberCapId: supportMemberCapId,
					message: supportReply,
					encryptedKey: channelEncryptionKey,
				});

			console.log(`Support sent reply ${supportMessageId} in tx ${supportDigest}`);
			expect(supportDigest).toBeDefined();
			expect(supportMessageId).toBeDefined();

			// Verify user can read support's reply
			const userMessages = await userClient.messaging.getChannelMessages({
				channelId,
				userAddress: topUserAddress,
				limit: 5,
				direction: 'backward',
			});

			expect(userMessages.messages).toHaveLength(2);
			const supportResponse = userMessages.messages.find(
				(m) => m.sender === supportSigner.toSuiAddress(),
			);
			expect(supportResponse).toBeDefined();
			expect(supportResponse!.text).toBe(supportReply);

			console.log(`👨‍💼 ${supportResponse!.sender}: ${supportResponse!.text}`);
		}, 320000);
	});
});
