import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { GenericContainer, Network, StartedNetwork, StartedTestContainer } from 'testcontainers';
import path from 'path';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui-grpc';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
	createTestClient,
	getChannelObject,
	getMemberCapObject,
	getMemberPermissions,
	getChannelMemberCaps,
	getMessages,
} from './test-helpers';
import { EncryptedSymmetricKey } from '../src/encryption';
import { Channel } from '../src/contracts/sui_messaging/channel';
import { MemberCap } from '../src/contracts/sui_messaging/member_cap';

// Type alias for our fully extended client
type TestClient = ReturnType<typeof createTestClient>;

describe('Integration tests - Write Path', () => {
	const SUI_TOOLS_TAG =
		process.env.SUI_TOOLS_TAG ||
		(process.arch === 'arm64'
			? 'e4d7ef827d609d606907969372bb30ff4c10d60a-arm64'
			: 'e4d7ef827d609d606907969372bb30ff4c10d60a');

	const DEFAULT_GRAPHQL_URL = 'http://127.0.0.1:9125';

	let dockerNetwork: StartedNetwork;
	let pg: StartedTestContainer;
	let suiLocalNode: StartedTestContainer;

	let suiJsonRpcClient: SuiClient;
	// @ts-ignore todo: remove when support added
	let suiGraphQLClient: SuiGraphQLClient;
	// @ts-ignore todo: remove when support added
	let suiGrpcClient: SuiGrpcClient;
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
			.withCommand(['-c', 'max_connections=500'])
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

		let configResult = await suiLocalNode.exec([
			'sui',
			'client',
			'--yes',
			'--client.config',
			'/root/.sui/sui_config/client.yaml',
		]);
		const phraseRegex = /Secret Recovery Phrase\s*:\s*\[(.*?)]/;
		const phraseMatch = configResult.stdout.match(phraseRegex);
		expect(phraseMatch).toBeTruthy();
		expect(phraseMatch![1]).toBeTruthy();
		let recoveryPhrase = phraseMatch![1].trim();
		signer = Ed25519Keypair.deriveKeypair(recoveryPhrase);

		const addressRegex = /address with scheme "ed25519" \[.*?: (0x[a-fA-F0-9]+)]/;
		const addressMatch = configResult.stdout.match(addressRegex);
		expect(addressMatch).toBeTruthy();
		expect(addressMatch![1]).toBeTruthy();
		let address = addressMatch![1].trim();
		expect(signer.toSuiAddress()).toBe(address);

		let localnetResult = await suiLocalNode.exec([
			'sui',
			'client',
			'new-env',
			'--alias',
			'localnet',
			'--rpc',
			'http://127.0.0.1:9000',
			'--json',
		]);
		expect(JSON.parse(localnetResult.stdout).alias).toBe('localnet');

		let switchResult = await suiLocalNode.exec([
			'sui',
			'client',
			'switch',
			'--env',
			'localnet',
			'--json',
		]);
		expect(JSON.parse(switchResult.stdout).env).toBe('localnet');

		let faucetResult = await suiLocalNode.exec(['sui', 'client', 'faucet']);
		expect(faucetResult.stdout).toMatch(/^Request successful/);

		let publishResult = await suiLocalNode.exec([
			'sui',
			'client',
			'publish',
			'./sui_messaging',
			'--json',
		]);
		const publishResultJson = JSON.parse(publishResult.stdout);
		expect(publishResultJson.effects.status.status).toBe('success');

		const published = publishResultJson.objectChanges.find(
			(change: any) => change.type === 'published',
		);
		expect(published).toBeDefined();
		packageId = published.packageId;

		suiJsonRpcClient = new SuiClient({
			url: getFullnodeUrl('localnet'),
			mvr: {
				overrides: {
					packages: {
						'@local-pkg/sui-messaging': packageId,
					},
				},
			},
		});

		// todo
		suiGraphQLClient = new SuiGraphQLClient({ url: DEFAULT_GRAPHQL_URL });
		suiGrpcClient = new SuiGrpcClient({
			network: 'localnet',
			transport: new GrpcWebFetchTransport({ baseUrl: 'http://127.0.0.1:9000' }),
		});
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
			expect(channel.encryption_key_history).toBeDefined();

			// Assert member permissions using the new auth system
			const memberPermissions = await getMemberPermissions(client, channelId);
			expect(memberPermissions.auth).toBeDefined();
			expect(memberPermissions.memberPermissions).toBeDefined();

			// Assert members - get the creator's MemberCap
			const creatorMemberCap = await getMemberCapObject(
				client,
				signer.toSuiAddress(),
				packageId,
				channelId,
			);
			expect(creatorMemberCap).toBeDefined();
			expect(creatorMemberCap.channel_id).toBe(channelId);

			// Get all MemberCaps for this channel using the new auth system
			const channelMemberCaps = await getChannelMemberCaps(client, channelId);

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
				const initialMemberCap = await getMemberCapObject(
					client,
					initialMember,
					packageId,
					channelId,
				);
				expect(initialMemberCap).toBeDefined();
				expect(initialMemberCap.channel_id).toBe(channelId);

				// Verify the initial member's MemberCap is in the channel's member list
				const foundInitialMemberCap = channelMemberCaps.find(
					(cap) => cap.id.id === initialMemberCap.id.id,
				);
				expect(foundInitialMemberCap).toBeDefined();
			}
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
			const { channelId: newChannelId, encryptedKeyBytes } =
				await client.messaging.executeCreateChannelTransaction({
					signer,
					initialMembers: [Ed25519Keypair.generate().toSuiAddress()],
				});

			channelObj = await getChannelObject(client, newChannelId);

			memberCap = await getMemberCapObject(client, signer.toSuiAddress(), packageId, newChannelId);
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
			let channelObjFresh = await getChannelObject(client, memberCap.channel_id);
			const messages = await getMessages(client, channelObjFresh.messages.contents.id.id);
			expect(messages.length).toBe(1);

			const sentMessage = messages.find((m) => m.id === messageId);
			expect(sentMessage).toBeDefined();

			expect(sentMessage!.name).toBe('0');
			expect(sentMessage!.message.sender).toBe(signer.toSuiAddress());
			expect(sentMessage!.message.key_version).toBe(1);
			expect(sentMessage!.message.created_at_ms).toMatch(/[0-9]+/);
			expect(sentMessage!.message.attachments).toHaveLength(1);

			// TODO: need to think about what should be exposed as public API
			// Do we want to expose the encrypt/decrypt apis, or just the send/receive messages?
			// Perhaps it would make sense to also offer a "SendMessageFlow", with individual steps available
			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(sentMessage!.message.ciphertext),
				nonce: new Uint8Array(sentMessage!.message.nonce),
				channelId: memberCap.channel_id,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.id.id,
			});

			expect(decryptedMessage.text).toBe(messageText);
		}, 120000);

		it('should send and decrypt a message without an attachment', async () => {
			const messageText = 'Hello, no attachment here.';

			const { digest, messageId } = await client.messaging.executeSendMessageTransaction({
				signer,
				channelId: memberCap.channel_id,
				memberCapId: memberCap.id.id,
				message: messageText,
				encryptedKey: encryptionKey,
			});
			expect(digest).toBeDefined();

			// Refetch channel object to check for last_message
			let channelObjFresh = await getChannelObject(client, memberCap.channel_id);
			const messages = await getMessages(client, channelObjFresh.messages.contents.id.id);
			const sentMessage = messages.find((m) => m.id === messageId);

			expect(sentMessage).toBeDefined();
			expect(sentMessage?.message.sender).toBe(signer.toSuiAddress());
			expect(sentMessage?.message.attachments).toHaveLength(0);

			expect(channelObjFresh.last_message).toEqual(sentMessage?.message);

			// not very nice that we are relying on the state of a previous test
			expect(channelObjFresh.messages_count).toBe('2');

			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(sentMessage!.message.ciphertext),
				nonce: new Uint8Array(sentMessage!.message.nonce),
				channelId: memberCap.channel_id,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.id.id,
			});
			expect(decryptedMessage.text).toBe(messageText);
			expect(decryptedMessage.attachments).toBeUndefined();
		}, 120000);
	});
});
