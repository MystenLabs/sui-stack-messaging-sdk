import { writeFileSync } from 'fs';
import { join } from 'path';

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { ClientWithExtensions } from '@mysten/sui/experimental';
import { Signer } from '@mysten/sui/cryptography';

import { setupTestEnvironment, createTestClient } from './test-helpers';
import { loadTestUsers, getTestUserKeypair } from './fund-test-users';

import { EncryptedSymmetricKey } from '../src/encryption';
import { MessagingClient } from '../src/client';

// Test data structure
interface TestChannel {
	channelId: string;
	encryptedKey: EncryptedSymmetricKey;
	members: {
		address: string;
		memberCapId: string;
	}[];
}
interface TestChannelData {
	channelId: string;
	encryptedKey: EncryptedSymmetricKey;
	members: {
		address: string;
		memberCapId: string;
	}[];
	messageCount: number;
	messages: {
		sender: string;
		text: string;
		hasAttachments: boolean;
	}[];
}

interface TestData {
	channels: TestChannelData[];
	createdAt: string;
	packageId: string;
}

async function prepareTestData(): Promise<void> {
	console.log('🚀 Starting test data preparation...');

	const testSetup = await setupTestEnvironment();
	const client = createTestClient(testSetup.suiClient, testSetup.config, testSetup.signer);

	// Get test users (funded for testnet, generated for localnet)
	let testUserAddresses: string[];

	if (testSetup.config.environment === 'testnet') {
		// Load pre-funded test users for testnet
		const testUsers = loadTestUsers();
		testUserAddresses = testUsers.map((user) => user.address);
		console.log(`📝 Loaded ${testUserAddresses.length} funded test users for testnet`);
	} else {
		// Generate new test users for localnet
		const testUsers = Array.from({ length: 5 }, () => Ed25519Keypair.generate());
		testUserAddresses = testUsers.map((user) => user.toSuiAddress());
		console.log(`📝 Generated ${testUserAddresses.length} test users for localnet`);
	}

	const channels: TestChannelData[] = [];

	// Scenario 1: Empty channel (1 member, 0 messages)
	console.log('📦 Creating empty channel...');
	const emptyChannel = await createTestChannel(client, testSetup.signer, [testUserAddresses[0]]);
	channels.push({
		channelId: emptyChannel.channelId,
		encryptedKey: emptyChannel.encryptedKey,
		members: emptyChannel.members,
		messageCount: 0,
		messages: [],
	});

	// Scenario 2: Small channel (2 members, 3 messages)
	console.log('📦 Creating small channel with messages...');
	const smallChannel = await createTestChannel(client, testSetup.signer, [testUserAddresses[1]]);
	await sendTestMessages(client, testSetup, smallChannel, [
		{ sender: testSetup.signer.toSuiAddress(), text: 'Hello from creator!', hasAttachments: false },
		{ sender: testUserAddresses[1], text: 'Hi there!', hasAttachments: false },
		{ sender: testSetup.signer.toSuiAddress(), text: 'How are you?', hasAttachments: false },
	]);

	channels.push({
		channelId: smallChannel.channelId,
		encryptedKey: smallChannel.encryptedKey,
		members: smallChannel.members,
		messageCount: 3,
		messages: [
			{
				sender: testSetup.signer.toSuiAddress(),
				text: 'Hello from creator!',
				hasAttachments: false,
			},
			{ sender: testUserAddresses[1], text: 'Hi there!', hasAttachments: false },
			{ sender: testSetup.signer.toSuiAddress(), text: 'How are you?', hasAttachments: false },
		],
	});

	// Scenario 3: Medium channel (3 members, 10 messages for pagination testing)
	console.log('📦 Creating medium channel for pagination testing...');
	const mediumChannel = await createTestChannel(client, testSetup.signer, [
		testUserAddresses[2],
		testUserAddresses[3],
	]);
	const mediumMessages = [];

	for (let i = 0; i < 10; i++) {
		const sender =
			i % 3 === 0
				? testSetup.signer.toSuiAddress()
				: i % 3 === 1
					? testUserAddresses[2]
					: testUserAddresses[3];
		const text = `Message ${i + 1} from ${sender.slice(0, 8)}...`;
		mediumMessages.push({ sender, text, hasAttachments: false });
	}

	await sendTestMessages(client, testSetup, mediumChannel, mediumMessages);

	channels.push({
		channelId: mediumChannel.channelId,
		encryptedKey: mediumChannel.encryptedKey,
		members: mediumChannel.members,
		messageCount: 10,
		messages: mediumMessages,
	});

	// Scenario 4: Channel with attachments
	console.log('📦 Creating channel with attachments...');
	const attachmentChannel = await createTestChannel(client, testSetup.signer, [
		testUserAddresses[4],
	]);

	// Create a test file for attachment
	const testFileContent = new TextEncoder().encode('Test attachment content');
	const testFile = new File([testFileContent], 'test.txt', { type: 'text/plain' });

	await sendTestMessages(
		client,
		testSetup,
		attachmentChannel,
		[
			{
				sender: testSetup.signer.toSuiAddress(),
				text: 'Message with attachment',
				hasAttachments: true,
			},
			{ sender: testUserAddresses[4], text: 'Regular message', hasAttachments: false },
		],
		[testFile],
	);

	channels.push({
		channelId: attachmentChannel.channelId,
		encryptedKey: attachmentChannel.encryptedKey,
		members: attachmentChannel.members,
		messageCount: 2,
		messages: [
			{
				sender: testSetup.signer.toSuiAddress(),
				text: 'Message with attachment',
				hasAttachments: true,
			},
			{ sender: testUserAddresses[4], text: 'Regular message', hasAttachments: false },
		],
	});

	// Save test data
	const testData: TestData = {
		channels,
		createdAt: new Date().toISOString(),
		packageId: testSetup.packageId,
	};

	const outputPath = join(__dirname, 'test-data.json');
	writeFileSync(outputPath, JSON.stringify(testData, null, 2));

	console.log(`✅ Test data prepared successfully!`);
	console.log(
		`📊 Created ${channels.length} channels with ${channels.reduce((sum, ch) => sum + ch.messageCount, 0)} total messages`,
	);
	console.log(`💾 Saved to: ${outputPath}`);

	// Cleanup
	if (testSetup.cleanup) {
		await testSetup.cleanup();
	}
}

async function createTestChannel(
	client: ClientWithExtensions<{ messaging: MessagingClient }>,
	creator: Signer,
	initialMemberAddresses: string[],
): Promise<TestChannel> {
	// Create channel
	const { channelObject, generatedCaps, encryptedKeyBytes } =
		await client.messaging.executeCreateChannelTransaction({
			signer: creator,
			initialMemberAddresses,
		});

	const channelEncryptedKey: EncryptedSymmetricKey = {
		$kind: 'Encrypted',
		encryptedBytes: encryptedKeyBytes,
		version: channelObject.encryption_key_history.latest_version,
	};

	const members = generatedCaps.additionalMemberCaps.map((memberCapWithOwner) => ({
		address: memberCapWithOwner.ownerAddress,
		memberCapId: memberCapWithOwner.capObject.id.id,
	}));
	members.push({
		address: generatedCaps.creatorMemberCap.ownerAddress,
		memberCapId: generatedCaps.creatorMemberCap.capObject.id.id,
	});

	return {
		channelId: channelObject.id.id,
		encryptedKey: channelEncryptedKey,
		members,
	};
}

async function sendTestMessages(
	client: any,
	testSetup: any,
	channel: TestChannel,
	messages: { sender: string; text: string; hasAttachments: boolean }[],
	attachments?: File[],
): Promise<void> {
	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		const senderMember = channel.members.find((m) => m.address === message.sender);

		if (!senderMember) {
			throw new Error(`Sender ${message.sender} not found in channel members`);
		}

		// Find the signer for this sender
		let signer: any = null;

		if (message.sender === testSetup.signer.toSuiAddress()) {
			signer = testSetup.signer;
		} else {
			// For other members, we need to get their keypair
			// This works for both localnet (generated users) and testnet (funded users)
			try {
				if (testSetup.config.environment === 'testnet') {
					signer = getTestUserKeypair(message.sender);
				} else {
					// For localnet, we'd need to track the generated keypairs
					// For now, skip non-creator messages in localnet
					console.warn(
						`Skipping message from ${message.sender} - non-creator messages not supported in localnet`,
					);
					continue;
				}
			} catch (error) {
				console.warn(`Skipping message from ${message.sender} - could not get signer: ${error}`);
				continue;
			}
		}

		const messageAttachments = message.hasAttachments && attachments ? [attachments[0]] : undefined;

		await client.messaging.executeSendMessageTransaction({
			signer,
			channelId: channel.channelId,
			memberCapId: senderMember.memberCapId,
			message: message.text,
			encryptedKey: channel.encryptedKey,
			attachments: messageAttachments,
		});

		// Small delay between messages
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

// Run the script
if (require.main === module) {
	prepareTestData().catch((error) => {
		console.error('❌ Failed to prepare test data:', error);
		process.exit(1);
	});
}

export { prepareTestData, type TestChannelData, type TestData };
