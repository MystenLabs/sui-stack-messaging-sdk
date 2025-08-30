import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { GenericContainer, Network, StartedNetwork, StartedTestContainer } from 'testcontainers';
import path from 'path';
import { Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	createTestClient,
	getChannelObject,
	getMemberCapObject,
	getMembers,
	getMessages,
	getRoles,
	TestConstants,
} from './test-helpers';
import { EncryptedSymmetricKey } from '../src/encryption';
import { Channel, MemberCap } from '../src/contracts/sui_messaging/channel';

// Type alias for our fully extended client
type TestClient = ReturnType<typeof createTestClient>;

describe('Integration tests - Write Path', () => {
	const SUI_TOOLS_TAG =
		process.env.SUI_TOOLS_TAG ||
		(process.arch === 'arm64'
			? 'e4d7ef827d609d606907969372bb30ff4c10d60a-arm64'
			: 'e4d7ef827d609d606907969372bb30ff4c10d60a');

	let dockerNetwork: StartedNetwork;
	let pg: StartedTestContainer;
	let suiLocalNode: StartedTestContainer;

	let suiJsonRpcClient: SuiClient;
	let signer: Signer;
	let packageId: string;

	// --- Test Suite Setup & Teardown ---
	beforeAll(async () => {
		dockerNetwork = await new Network().start();

		pg = await new GenericContainer('postgres')
			.withEnvironment({
				POSTGRES_USER: 'postgres',
				POSTGRES_PASSWORD: 'postgrespw',
				POSTGRES_DB: 'sui_indexer_v2',
			})
			.withExposedPorts(5432)
			.withNetwork(dockerNetwork)
			.start();

		suiLocalNode = await new GenericContainer(`mysten/sui-tools:${SUI_TOOLS_TAG}`)
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
			])
			.withCopyDirectoriesToContainer([
				{
					source: path.resolve(__dirname, '../../../move/sui_messaging'),
					target: '/sui/sui_messaging',
				},
			])
			.withNetwork(dockerNetwork)
			.withExposedPorts({ host: 9000, container: 9000 })
			.start();

		// Initialize client, signer, and publish the contract
		const { output: faucetOutput } = await suiLocalNode.exec(['sui', 'client', 'faucet']);
		expect(faucetOutput).toContain('Request successful');

		const { output: keyOutput } = await suiLocalNode.exec(['sui', 'client', 'active-address']);
		const suiAddress = keyOutput.trim();

		const { output: phraseOutput } = await suiLocalNode.exec([
			'sui',
			'client',
			'export-keypair',
			suiAddress,
		]);
		const recoveryPhrase = JSON.parse(phraseOutput).mnemonics;
		signer = Ed25519Keypair.deriveKeypair(recoveryPhrase.join(' '));
		expect(signer.toSuiAddress()).toBe(suiAddress);

		const { output: publishOutput } = await suiLocalNode.exec([
			'sui',
			'client',
			'publish',
			'--json',
			'./sui_messaging',
		]);
		const publishResult = JSON.parse(publishOutput);
		expect(publishResult.effects.status.status).toBe('success');
		const published = publishResult.objectChanges.find(
			(change: any) => change.type === 'published',
		);
		packageId = published.packageId;

		suiJsonRpcClient = new SuiClient({ url: getFullnodeUrl('localnet') });
	}, 200000);

	afterAll(async () => {
		await pg.stop();
		await suiLocalNode.stop();
		await dockerNetwork.stop();
	});

	// --- Test Cases ---

	describe('Channel Creation', () => {
		it('should create a channel with correct initial state and roles', async () => {
			const client = createTestClient(suiJsonRpcClient, packageId, signer, 'localnet');
			const initialMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest, channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [initialMember],
			});
			expect(digest).toBeDefined();
			expect(channelId).toBeDefined();

			const channel = await getChannelObject(client, channelId);

			// Assert channel properties
			expect(channel.id.id).toBe(channelId);
			expect(channel.version).toBe('1');
			expect(channel.messages_count).toBe('0');
			expect(channel.created_at_ms).toMatch(/[0-9]+/);
			expect(channel.updated_at_ms).toEqual(channel.created_at_ms);
			expect(channel.encryption_keys[0].length).toBeGreaterThan(0);

			// Assert roles
			const roles = await getRoles(client, channel.roles.id.id);
			expect(roles).toHaveLength(2);

			const creatorRole = roles.find((r) => r.name === TestConstants.ROLES.CREATOR);
			expect(creatorRole).toBeDefined();
			expect(creatorRole?.permissions).toEqual(TestConstants.PERMISSIONS.CREATOR);

			const restrictedRole = roles.find((r) => r.name === TestConstants.ROLES.RESTRICTED);
			expect(restrictedRole).toBeDefined();
			expect(restrictedRole?.permissions).toHaveLength(0);

			// Assert members
			const creatorMemberCap = await getMemberCapObject(
				client,
				signer.toSuiAddress(),
				packageId,
				channelId,
			);

			const members = await getMembers(client, channel.members.id.id);
			expect(members).toHaveLength(2);
			const creatorMember = members.find((m) => m.name === creatorMemberCap.id.id);
			expect(creatorMember).toBeDefined();
			expect(creatorMember?.memberInfo.role_name).toBe('Creator');
			expect(creatorMember?.memberInfo.presense).toEqual({ Offline: true, $kind: 'Offline' });
			expect(creatorMember?.memberInfo.joined_at_ms).toMatch(/[0-9]+/);

			const restrictedMemberCap = await getMemberCapObject(
				client,
				initialMember,
				packageId,
				channelId,
			);

			const restrictedMember = members.find((m) => m.name === restrictedMemberCap.id.id);
			expect(restrictedMember).toBeDefined();
			expect(restrictedMember?.memberInfo.role_name).toBe('Restricted');
			expect(restrictedMember?.memberInfo.presense).toEqual({ Offline: true, $kind: 'Offline' });
			expect(restrictedMember?.memberInfo.joined_at_ms).toMatch(/[0-9]+/);
		});
	});

	describe('Message Sending', () => {
		let client: TestClient;
		let channelObj: (typeof Channel)['$inferType'];
		let memberCap: (typeof MemberCap)['$inferType'];
		let encryptionKey: EncryptedSymmetricKey;

		// Before each message test, create a fresh channel
		beforeAll(async () => {
			client = createTestClient(suiJsonRpcClient, packageId, signer, 'localnet');
			const { channelId: newChannelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [Ed25519Keypair.generate().toSuiAddress()],
			});

			channelObj = await getChannelObject(client, newChannelId);
			memberCap = await getMemberCapObject(client, signer.toSuiAddress(), packageId, newChannelId);

			const encryptionKeyVersion = channelObj.encryption_keys.length;
			expect(encryptionKeyVersion).toBe('1');
			// This should not be empty
			expect(channelObj.encryption_keys[0].length).toBeGreaterThan(0);
			encryptionKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(channelObj.encryption_keys[0]),
				version: encryptionKeyVersion,
			};
		});

		it('should send and decrypt a message with an attachment', async () => {
			const messageText = 'Hello with attachment!';
			const fileContent = new TextEncoder().encode(`Attachment content: ${Date.now()}`);
			const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

			const { digest, messageId } = await client.messaging.executeSendMessageTransaction({
				signer,
				channelId: channelObj.id.id,
				memberCapId: memberCap.id.id,
				message: messageText,
				attachments: [file],
			});
			expect(digest).toBeDefined();
			expect(messageId).toBeDefined();

			const messages = await getMessages(client, channelObj.messages.contents.id.id);
			expect(messages.length).toBe(1);

			const sentMessage = messages.find((m) => m.id === messageId);
			expect(sentMessage).toBeDefined();

			expect(sentMessage!.name).toBe('0');
			expect(sentMessage!.message.sender).toBe(signer.toSuiAddress());
			expect(channelObj.last_message).toEqual(sentMessage?.message);
			expect(sentMessage!.message.key_version).toBe('1');
			expect(sentMessage!.message.attachments).toHaveLength(1);
			expect(sentMessage!.message.created_at_ms).toMatch(/[0-9]+/);

			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(sentMessage!.message.ciphertext),
				nonce: new Uint8Array(sentMessage!.message.nonce),
				channelId: channelObj.id.id,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.id.id,
			});

			expect(decryptedMessage.text).toBe(messageText);
			expect(decryptedMessage.attachments).toHaveLength(1);
			expect(decryptedMessage.attachments?.[0].fileName).toBe('test.txt');
			expect(decryptedMessage.attachments?.[0].data).toEqual(fileContent);
		}, 120000);

		it('should send and decrypt a message without an attachment', async () => {
			const messageText = 'Hello, no attachment here.';

			const { digest, messageId } = await client.messaging.executeSendMessageTransaction({
				signer,
				channelId: channelObj.id.id,
				memberCapId: memberCap.id.id,
				message: messageText,
			});
			expect(digest).toBeDefined();

			const messages = await getMessages(client, channelObj.messages.contents.id.id);
			const sentMessage = messages.find((m) => m.id === messageId);

			expect(sentMessage).toBeDefined();
			expect(sentMessage?.message.sender).toBe(signer.toSuiAddress());
			expect(sentMessage?.message.attachments).toHaveLength(0);
			expect(channelObj.last_message).toEqual(sentMessage?.message);

			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(sentMessage!.message.ciphertext),
				nonce: new Uint8Array(sentMessage!.message.nonce),
				channelId: channelObj.id.id,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.id.id,
			});
			expect(decryptedMessage.text).toBe(messageText);
			expect(decryptedMessage.attachments).toBeUndefined();
		}, 120000);
	});
});
