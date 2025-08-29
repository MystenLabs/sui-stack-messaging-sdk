import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessagingCompatibleClient } from '../src/types';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { MessagingClient } from '../src/client';
import { SuiGraphQLClient } from '@mysten/sui/graphql';
import { SuiGrpcClient } from '@mysten/sui-grpc';
import { GrpcWebFetchTransport } from '@protobuf-ts/grpcweb-transport';
import { GenericContainer, Network, StartedNetwork, StartedTestContainer } from 'testcontainers';
import path from 'path';
import { Signer } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import * as channelModule from '../src/contracts/sui_messaging/channel';
import * as permissionsModule from '../src/contracts/sui_messaging/permissions';
import * as messageModule from '../src/contracts/sui_messaging/message';
import { bcs } from '@mysten/sui/bcs';
import { WalrusStorageAdapter } from '../src/storage/adapters/walrus/walrus';
import { WalrusClient } from '@mysten/walrus';
import { SealClient } from '@mysten/seal';
import { ALLOWLISTED_SEAL_KEY_SERVERS } from '../src/encryption/constants';
import { EncryptedSymmetricKey } from '../src/encryption';

describe('Integration tests - Write Path', () => {
	const SUI_TOOLS_TAG =
		process.env.SUI_TOOLS_TAG || process.arch === 'arm64'
			? 'e4d7ef827d609d606907969372bb30ff4c10d60a-arm64'
			: 'e4d7ef827d609d606907969372bb30ff4c10d60a';

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

		suiJsonRpcClient = new SuiClient({ url: getFullnodeUrl('localnet') });

		// todo
		suiGraphQLClient = new SuiGraphQLClient({ url: DEFAULT_GRAPHQL_URL });
		suiGrpcClient = new SuiGrpcClient({
			network: 'localnet',
			transport: new GrpcWebFetchTransport({ baseUrl: 'http://127.0.0.1:9000' }),
		});
	}, 180000);

	afterAll(async () => {
		await pg.stop();
		await suiLocalNode.stop();
		await dockerNetwork.stop();
	});

	it(
		'test: Execute crate channel transaction - json rpc client extension',
		{ timeout: 12000 },
		async () => {
			const client = suiJsonRpcClient
				.$extend(WalrusClient.experimental_asClientExtension())
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
						// If you want to use a custom storage adapter:
						// (In this case you might not need to extend the client with walrus)
						storage: (client) =>
							new WalrusStorageAdapter(client, {
								publisher: '',
								aggregator: '',
							}),
						signer,
					}),
				);

			const initialMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest, channelId } = await client.messaging.executeCreateChannelTransaction({
				signer,
				initialMembers: [initialMember],
			});
			expect(digest).toBeDefined();

			const channelResponse = await client.core.getObject({ objectId: channelId });
			const channelContent = await channelResponse.object.content;
			const channelObj = channelModule.Channel.parse(channelContent);
			expect(channelObj).toBeDefined();

			expect(channelObj.id.id).toBe(channelId);
			expect(channelObj.version).toBe('1');
			expect(channelObj.created_at_ms).toMatch(/[0-9]+/);
			expect(channelObj.updated_at_ms).toEqual(channelObj.created_at_ms);
			expect(channelObj.messages_count).toBe('0');

			// Encryption Keys: vector<vector<u8>>
			expect(channelObj.encryption_keys.length).toBe('1');
			// This should not be empty
			expect(channelObj.encryption_keys[0].length).toBeGreaterThan(0);

			// Roles
			expect(channelObj.roles.size).toBe('2');

			const rolesResponse = await client.core.getDynamicFields({
				parentId: channelObj.roles.id.id,
			});
			const rolesPromises = rolesResponse.dynamicFields.map(async (role) => {
				const roleResponse = await client.core.getDynamicField({
					parentId: channelObj.roles.id.id,
					name: role.name,
				});
				const roleNameContent = roleResponse.dynamicField.name.bcs;
				const roleName = bcs.String.parse(roleNameContent);
				const rolePermissionsContent = roleResponse.dynamicField.value.bcs;
				const rolePermissions = permissionsModule.Role.parse(rolePermissionsContent);
				return { name: roleName, permissions: rolePermissions.permissions.contents };
			});
			const roles = await Promise.all(rolesPromises);

			expect(roles.length).toBe(2);
			const creator = roles.find((role) => role.name === 'Creator');
			expect(creator).toBeDefined();
			expect(creator?.permissions.length).toBe(10);
			expect(creator?.permissions).toEqual([
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
			]);

			const restricted = roles.find((role) => role.name === 'Restricted');
			expect(restricted).toBeDefined();
			expect(restricted?.permissions).toHaveLength(0);

			// Members
			const membersResponse = await client.core.getDynamicFields({
				parentId: channelObj.members.id.id,
			});
			const membersPromises = membersResponse.dynamicFields.map(async (member) => {
				const memberResponse = await client.core.getDynamicField({
					parentId: channelObj.members.id.id,
					name: member.name,
				});
				const memberNameContent = memberResponse.dynamicField.name.bcs;
				const memberName = bcs.Address.parse(memberNameContent);
				const memberInfoContent = memberResponse.dynamicField.value.bcs;
				const memberInfo = channelModule.MemberInfo.parse(memberInfoContent);
				return { name: memberName, memberInfo };
			});
			const members = await Promise.all(membersPromises);
			expect(members.length).toBe(2);

			const creatorMemberCap = await client.core.getOwnedObjects({
				address: signer.toSuiAddress(),
				type: channelModule.MemberCap.name.replace('@local-pkg/sui_messaging', packageId),
				limit: 1,
			});
			expect(creatorMemberCap).toBeDefined();
			expect(creatorMemberCap.objects).toHaveLength(1);

			const creatorMember = members.find(
				(member) => member.name === creatorMemberCap.objects[0].id,
			);
			expect(creatorMember).toBeDefined();
			expect(creatorMember?.memberInfo.role_name).toBe('Creator');
			expect(creatorMember?.memberInfo.presense).toEqual({ Offline: true, $kind: 'Offline' });
			expect(creatorMember?.memberInfo.joined_at_ms).toMatch(/[0-9]+/);

			const restrictedMemberCap = await client.core.getOwnedObjects({
				address: initialMember,
				type: channelModule.MemberCap.name.replace('@local-pkg/sui_messaging', packageId),
				limit: 1,
			});
			expect(restrictedMemberCap).toBeDefined();
			expect(restrictedMemberCap.objects).toHaveLength(1);

			const restrictedMember = members.find(
				(member) => member.name === restrictedMemberCap.objects[0].id,
			);
			expect(restrictedMember).toBeDefined();
			expect(restrictedMember?.memberInfo.role_name).toBe('Restricted');
			expect(restrictedMember?.memberInfo.presense).toEqual({ Offline: true, $kind: 'Offline' });
			expect(restrictedMember?.memberInfo.joined_at_ms).toMatch(/[0-9]+/);

			// Messages
			// const messagesResponse = await client.core.getDynamicFields({
			// 	parentId: channelObj.messages.contents.id.id,
			// });
			// const messagesPromises = messagesResponse.dynamicFields.map(async (message) => {
			// 	const messageResponse = await client.core.getDynamicField({
			// 		parentId: channelObj.messages.contents.id.id,
			// 		name: message.name,
			// 	});
			// 	const messageNameContent = messageResponse.dynamicField.name.bcs;
			// 	const messageName = bcs.U64.parse(messageNameContent);
			// 	const messageContent = messageResponse.dynamicField.value.bcs;
			// 	const messageObj = messageModule.Message.parse(messageContent);
			// 	return { name: messageName, message: messageObj };
			// });
			// const messages = await Promise.all(messagesPromises);
			// expect(messages.length).toBe(1);

			// const initialMessage = messages[0];
			// expect(initialMessage.name).toBe('0');
			// expect(initialMessage.message.sender).toBe(signer.toSuiAddress());
			// expect(initialMessage.message.nonce).toEqual([9, 0, 9, 0]);
			// expect(new TextDecoder().decode(new Uint8Array(messages[0].message.ciphertext))).toBe(
			// 	'hello world',
			// );
			// expect(initialMessage.message.key_version).toBe('1');
			// expect(initialMessage.message.attachments).toHaveLength(0);
			// expect(initialMessage.message.created_at_ms).toMatch(/[0-9]+/);

			// // Last Message
			// expect(channelObj.last_message).toEqual(initialMessage.message);
		},
	);

	it('test: Execute create channel transaction - json rpc client', async () => {
		// Marked constructor as private for now, so we enforce the $extend flow
	});

	it(
		'test: Execute send message with attachment - json rpc client extension, walrus publisher',
		{ timeout: 120000 },
		async () => {
			const client = suiJsonRpcClient
				.$extend(
					WalrusClient.experimental_asClientExtension({
						network: 'testnet',
					}),
				)
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
							new WalrusStorageAdapter(client, {
								publisher: 'https://publisher.walrus-testnet.walrus.space',
								aggregator: 'https://aggregator.walrus-testnet.walrus.space',
							}),
						signer,
					}),
				);

			const initialMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest: cnlDigest, channelId } =
				await client.messaging.executeCreateChannelTransaction({
					signer,
					initialMembers: [initialMember],
				});
			expect(cnlDigest).toBeDefined();
			expect(channelId).toBeDefined();

			const memberCap = await client.core.getOwnedObjects({
				address: signer.toSuiAddress(),
				type: channelModule.MemberCap.name.replace('@local-pkg/sui_messaging', packageId),
				limit: 1,
			});

			const rndText = Math.random().toString(36).substring(2, 15);
			const data = new TextEncoder().encode(`hello world, ${rndText}`);
			const file = new File([data], 'hello.txt', { type: 'text/plain' });
			const { digest: msgDigest, messageId } = await client.messaging.executeSendMessageTransaction(
				{
					signer,
					channelId,
					memberCapId: memberCap.objects[0].id,
					message: 'hello world',
					attachments: [file],
				},
			);
			expect(msgDigest).toBeDefined();

			const channelResponse = await client.core.getObject({ objectId: channelId });
			const channelContent = await channelResponse.object.content;
			const channelObj = channelModule.Channel.parse(channelContent);
			const encryptionKeyVersion = channelObj.encryption_keys.length;
			expect(encryptionKeyVersion).toBe('1');
			// This should not be empty
			expect(channelObj.encryption_keys[0].length).toBeGreaterThan(0);
			const encryptionKey: EncryptedSymmetricKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(channelObj.encryption_keys[0]),
				version: encryptionKeyVersion,
			};

			const messagesResponse = await client.core.getDynamicFields({
				parentId: channelObj.messages.contents.id.id,
			});
			const messagesPromises = messagesResponse.dynamicFields.map(async (message) => {
				const messageResponse = await client.core.getDynamicField({
					parentId: channelObj.messages.contents.id.id,
					name: message.name,
				});
				const messageNameContent = messageResponse.dynamicField.name.bcs;
				const messageName = bcs.U64.parse(messageNameContent);
				const messageId = messageResponse.dynamicField.id;
				const messageContent = messageResponse.dynamicField.value.bcs;
				const messageObj = messageModule.Message.parse(messageContent);
				return { name: messageName, id: messageId, message: messageObj };
			});
			const messages = await Promise.all(messagesPromises);
			expect(messages.length).toBe(1);

			const message = messages[0];
			expect(message.name).toBe('0');
			expect(message.id).toBe(messageId);
			expect(message.message.sender).toBe(signer.toSuiAddress());
			expect(message.message.key_version).toBe('1');
			expect(message.message.attachments).toHaveLength(1);
			expect(message.message.created_at_ms).toMatch(/[0-9]+/);

			// Decrypt the message
			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(message.message.ciphertext),
				nonce: new Uint8Array(message.message.nonce),
				channelId,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.objects[0].id,
			});
			expect(decryptedMessage.text).toBe('hello world');
			expect(decryptedMessage.attachments).toHaveLength(1);
			expect(decryptedMessage.attachments?.[0].fileName).toBe('hello.txt');
			expect(decryptedMessage.attachments?.[0].mimeType).toBe('text/plain');
			expect(decryptedMessage.attachments?.[0].fileSize).toBe(data.length);
			expect(decryptedMessage.attachments?.[0].data).toEqual(data);

			// Last Message
			expect(channelObj.last_message).toEqual(message.message);
		},
	);

	it(
		'test: Execute send message without attachment - json rpc client extension, walrus publisher',
		{ timeout: 120000 },
		async () => {
			const client = suiJsonRpcClient
				// @ts-ignore
				.$extend(
					WalrusClient.experimental_asClientExtension({
						network: 'testnet',
					}),
				)
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
							new WalrusStorageAdapter(client, {
								publisher: 'https://publisher.walrus-testnet.walrus.space',
								aggregator: 'https://aggregator.walrus-testnet.walrus.space',
							}),
						signer,
					}),
				);

			const initialMember = Ed25519Keypair.generate().toSuiAddress();

			const { digest: cnlDigest, channelId } =
				await client.messaging.executeCreateChannelTransaction({
					signer,
					initialMembers: [initialMember],
				});
			expect(cnlDigest).toBeDefined();
			expect(channelId).toBeDefined();

			const memberCap = await client.core.getOwnedObjects({
				address: signer.toSuiAddress(),
				type: channelModule.MemberCap.name.replace('@local-pkg/sui_messaging', packageId),
				limit: 1,
			});

			const { digest: msgDigest, messageId } = await client.messaging.executeSendMessageTransaction(
				{
					signer,
					channelId,
					memberCapId: memberCap.objects[0].id,
					message: 'hello world',
				},
			);
			expect(msgDigest).toBeDefined();

			const channelResponse = await client.core.getObject({ objectId: channelId });
			const channelContent = await channelResponse.object.content;
			const channelObj = channelModule.Channel.parse(channelContent);
			const encryptionKeyVersion = channelObj.encryption_keys.length;
			expect(encryptionKeyVersion).toBe('1');
			// This should not be empty
			expect(channelObj.encryption_keys[0].length).toBeGreaterThan(0);
			const encryptionKey: EncryptedSymmetricKey = {
				$kind: 'Encrypted',
				encryptedBytes: new Uint8Array(channelObj.encryption_keys[0]),
				version: encryptionKeyVersion,
			};

			const messagesResponse = await client.core.getDynamicFields({
				parentId: channelObj.messages.contents.id.id,
			});
			const messagesPromises = messagesResponse.dynamicFields.map(async (message) => {
				const messageResponse = await client.core.getDynamicField({
					parentId: channelObj.messages.contents.id.id,
					name: message.name,
				});
				const messageNameContent = messageResponse.dynamicField.name.bcs;
				const messageName = bcs.U64.parse(messageNameContent);
				const messageId = messageResponse.dynamicField.id;
				const messageContent = messageResponse.dynamicField.value.bcs;
				const messageObj = messageModule.Message.parse(messageContent);
				return { name: messageName, id: messageId, message: messageObj };
			});
			const messages = await Promise.all(messagesPromises);
			expect(messages.length).toBe(1);

			const message = messages[0];
			expect(message.name).toBe('0');
			expect(message.id).toBe(messageId);
			expect(message.message.sender).toBe(signer.toSuiAddress());
			expect(message.message.key_version).toBe('1');
			expect(message.message.attachments).toHaveLength(1);
			expect(message.message.created_at_ms).toMatch(/[0-9]+/);

			// Decrypt the message

			const decryptedMessage = await client.messaging.decryptMessage({
				ciphertext: new Uint8Array(message.message.ciphertext),
				nonce: new Uint8Array(message.message.nonce),
				channelId,
				sender: signer.toSuiAddress(),
				encryptedKey: encryptionKey,
				memberCapId: memberCap.objects[0].id,
			});
			expect(decryptedMessage.text).toBe('hello world');

			// Last Message
			expect(channelObj.last_message).toEqual(message.message);
		},
	);
});
