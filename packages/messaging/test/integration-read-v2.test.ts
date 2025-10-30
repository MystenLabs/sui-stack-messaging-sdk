// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestClient, setupTestEnvironment, TestEnvironmentSetup } from './test-helpers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TestData } from './prepare-test-data';

describe('Integration tests - Read Path v2', () => {
	let testSetup: TestEnvironmentSetup;
	let testData: TestData;

	beforeAll(async () => {
		testSetup = await setupTestEnvironment();

		// Load test data
		try {
			const testDataPath = join(__dirname, 'test-data.json');
			const testDataContent = readFileSync(testDataPath, 'utf-8');
			testData = JSON.parse(testDataContent);

			// Convert encryptedBytes objects back to Uint8Array
			testData.channels.forEach((channel: any) => {
				channel.members.forEach((member: any) => {
					if (member.encryptedKey?.encryptedBytes) {
						// Convert the object with numeric keys back to Uint8Array
						const bytesObj = member.encryptedKey.encryptedBytes;
						const bytesArray = Object.keys(bytesObj)
							.map((key) => parseInt(key))
							.sort((a, b) => a - b)
							.map((index) => bytesObj[index]);
						member.encryptedKey.encryptedBytes = new Uint8Array(bytesArray);
					}
				});
			});

			console.log(`📊 Loaded test data with ${testData.channels.length} channels`);
		} catch (error) {
			throw new Error(
				'Test data not found. Please run "npm run prepare-test-data" first to generate test data.',
			);
		}
	}, 200000);

	afterAll(async () => {
		if (testSetup.cleanup) {
			await testSetup.cleanup();
		}
	});

	describe('Channel Memberships', () => {
		it('should fetch channel memberships with pagination', async () => {
			const suiClient = testSetup.suiGrpcClient ?? testSetup.suiClient;
			const client = createTestClient(suiClient, testSetup.config, testSetup.signer);
			const testUser = testData.channels[0].members[0].address;

			// Test pagination
			let hasNextPage = true;
			let cursor: string | null = null;
			const allMemberships: any[] = [];

			while (hasNextPage) {
				const result = await client.messaging.getChannelMemberships({
					address: testUser,
					cursor,
					limit: 1, // Small limit to test pagination
				});

				allMemberships.push(...result.memberships);
				hasNextPage = result.hasNextPage;
				cursor = result.cursor;
			}

			expect(allMemberships.length).toBeGreaterThan(0);
			expect(allMemberships.every((m) => m.channel_id && m.member_cap_id)).toBe(true);
		});

		it('should handle empty memberships gracefully', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const nonExistentUser = '0x0000000000000000000000000000000000000000000000000000000000000000';

			const result = await client.messaging.getChannelMemberships({
				address: nonExistentUser,
				limit: 10,
			});

			expect(result.memberships).toEqual([]);
			expect(result.hasNextPage).toBe(false);
			expect(result.cursor).toBe(null);
		});
	});

	describe('Channel Objects', () => {
		it('should fetch channel objects by address', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testUser = testData.channels[0].members[0].address;

			const result = await client.messaging.getChannelObjectsByAddress({
				address: testUser,
				limit: 10,
			});

			expect(result.channelObjects.length).toBeGreaterThan(0);
			expect(result.channelObjects.every((ch) => ch.id && ch.messages_count !== undefined)).toBe(
				true,
			);
		});

		it('should fetch specific channel objects by IDs', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const channelIds = testData.channels.map((ch) => ch.channelId);
			const testUser = testData.channels[0].members[0].address;

			const result = await client.messaging.getChannelObjectsByChannelIds({
				channelIds,
				userAddress: testUser,
			});

			expect(result.length).toBe(channelIds.length);
			expect(result.every((ch) => channelIds.includes(ch.id.id))).toBe(true);
		});

		it('should handle non-existent channel IDs gracefully', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const nonExistentChannelId =
				'0x0000000000000000000000000000000000000000000000000000000000000000';
			const testUser = testData.channels[0].members[0].address;

			await expect(
				client.messaging.getChannelObjectsByChannelIds({
					channelIds: [nonExistentChannelId],
					userAddress: testUser,
				}),
			).rejects.toThrow();
		});
	});

	describe('Channel Members', () => {
		it('should fetch all members of a channel', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.members.length > 1);

			if (!testChannel) {
				throw new Error('No multi-member channel found for testing');
			}

			const result = await client.messaging.getChannelMembers(testChannel.channelId);

			expect(result.members.length).toBe(testChannel.members.length);
			expect(result.members.every((m) => m.memberAddress && m.memberCapId)).toBe(true);

			// Verify all expected members are present
			const expectedAddresses = testChannel.members.map((m) => m.address);
			const actualAddresses = result.members.map((m) => m.memberAddress);
			expect(actualAddresses.sort()).toEqual(expectedAddresses.sort());
		});
	});

	describe('Message Fetching', () => {
		it('should fetch messages in backward direction (latest first)', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 0);

			if (!testChannel) {
				throw new Error('No channel with messages found for testing');
			}
			const testUser = testChannel.members[0].address;

			const result = await client.messaging.getChannelMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				limit: 5,
				direction: 'backward',
			});

			expect(result.messages.length).toBeGreaterThan(0);
			expect(result.messages.length).toBeLessThanOrEqual(5);
			expect(result.direction).toBe('backward');
			expect(result.cursor).toBeDefined();
			expect(typeof result.hasNextPage).toBe('boolean');
		});

		it('should fetch messages in forward direction (oldest first)', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 0);

			if (!testChannel) {
				throw new Error('No channel with messages found for testing');
			}
			const testUser = testChannel.members[0].address;

			const result = await client.messaging.getChannelMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				limit: 5,
				direction: 'forward',
			});

			expect(result.messages.length).toBeGreaterThan(0);
			expect(result.messages.length).toBeLessThanOrEqual(5);
			expect(result.direction).toBe('forward');
			expect(result.cursor).toBeDefined();
			expect(typeof result.hasNextPage).toBe('boolean');
		});

		it('should handle pagination with cursor', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 3);

			if (!testChannel) {
				throw new Error('No channel with enough messages found for pagination testing');
			}
			const testUser = testChannel.members[0].address;

			// First page
			const firstPage = await client.messaging.getChannelMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				limit: 2,
				direction: 'backward',
			});

			expect(firstPage.messages.length).toBe(2);
			expect(firstPage.cursor).toBeDefined();

			// Second page using cursor
			const secondPage = await client.messaging.getChannelMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				cursor: firstPage.cursor,
				limit: 2,
				direction: 'backward',
			});

			expect(secondPage.messages.length).toBeGreaterThan(0);

			// Messages should be different
			const firstPageIds = firstPage.messages.map((m) => m.sender + m.createdAtMs);
			const secondPageIds = secondPage.messages.map((m) => m.sender + m.createdAtMs);
			expect(firstPageIds).not.toEqual(secondPageIds);
		});

		it('should handle empty channels gracefully', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const emptyChannel = testData.channels.find((ch) => ch.messageCount === 0);

			if (!emptyChannel) {
				throw new Error('No empty channel found for testing');
			}

			const testUser = emptyChannel.members[0].address;
			const result = await client.messaging.getChannelMessages({
				channelId: emptyChannel.channelId,
				userAddress: testUser,
				limit: 10,
				direction: 'backward',
			});

			expect(result.messages).toEqual([]);
			expect(result.cursor).toBe(null);
			expect(result.hasNextPage).toBe(false);
		});

		it('should handle polling with getLatestMessages', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 0);

			if (!testChannel) {
				throw new Error('No channel with messages found for polling testing');
			}

			// Create initial polling state
			const testUser = testChannel.members[0].address;
			const channelObjects = await client.messaging.getChannelObjectsByChannelIds({
				channelIds: [testChannel.channelId],
				userAddress: testUser,
			});
			const currentMessageCount = BigInt(channelObjects[0].messages_count);

			const pollingState = {
				lastMessageCount: currentMessageCount,
				lastCursor: null,
				channelId: testChannel.channelId,
			};

			// Should return empty since no new messages
			const result = await client.messaging.getLatestMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				pollingState,
				limit: 10,
			});

			expect(result.messages.length).toBe(0);
			expect(result.cursor).toBe(pollingState.lastCursor);
		});

		it('should handle cursor out of bounds', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 0);

			if (!testChannel) {
				throw new Error('No channel with messages found for testing');
			}

			// Try with cursor beyond message count
			const testUser = testChannel.members[0].address;
			await expect(
				client.messaging.getChannelMessages({
					channelId: testChannel.channelId,
					userAddress: testUser,
					cursor: BigInt(999999),
					limit: 10,
					direction: 'backward',
				}),
			).rejects.toThrow();
		});
	});

	describe('Message Decryption', () => {
		it('should decrypt messages successfully', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const testChannel = testData.channels.find((ch) => ch.messageCount > 0);

			if (!testChannel) {
				throw new Error('No channel with messages found for decryption testing');
			}

			// Get messages
			const testUser = testChannel.members[0].address;
			const messagesResult = await client.messaging.getChannelMessages({
				channelId: testChannel.channelId,
				userAddress: testUser,
				limit: 1,
				direction: 'backward',
			});

			expect(messagesResult.messages.length).toBeGreaterThan(0);
			const decryptedMessage = messagesResult.messages[0];

			// Messages are now automatically decrypted
			expect(decryptedMessage.text).toBeDefined();
			expect(decryptedMessage.sender).toBeDefined();
			expect(decryptedMessage.createdAtMs).toBeDefined();
		});

		it('should handle messages with attachments', async () => {
			const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);
			const attachmentChannel = testData.channels.find((ch) =>
				ch.messages.some((m) => m.hasAttachments),
			);

			if (!attachmentChannel) {
				throw new Error('No channel with attachment messages found for testing');
			}

			// Get messages
			const testUser = attachmentChannel.members[0].address;
			const messagesResult = await client.messaging.getChannelMessages({
				channelId: attachmentChannel.channelId,
				userAddress: testUser,
				limit: 10,
				direction: 'backward',
			});

			// Find a message with attachments
			const messageWithAttachment = messagesResult.messages.find(
				(m) => m.attachments && m.attachments.length > 0,
			);
			if (!messageWithAttachment) {
				throw new Error('No message with attachments found');
			}

			// Messages are now automatically decrypted
			const decryptedResult = messageWithAttachment;

			// download and decrypt the attachments data (the attachments are Promises that we can await)
			const attachments = await Promise.all(
				decryptedResult.attachments!.map(async (attachment) => {
					return await attachment.data;
				}),
			);

			expect(decryptedResult.text).toBeDefined();
			expect(decryptedResult.attachments).toBeDefined();
			expect(decryptedResult.attachments!.length).toBeGreaterThan(0);

			// Verify attachment content
			expect(attachments.length).toBe(1);
			expect(attachments[0].length).toBeGreaterThan(0);

			// Convert the decrypted attachment data back to text and verify content
			const attachmentText = new TextDecoder().decode(attachments[0]);
			expect(attachmentText).toBe('Test attachment content');

			// Verify attachment metadata
			const attachment = decryptedResult.attachments![0];
			expect(attachment.fileName).toBe('test.txt');
			expect(attachment.mimeType).toBe('text/plain');
			expect(attachment.fileSize).toBeGreaterThan(0);
		}, 20000);
	});
});
