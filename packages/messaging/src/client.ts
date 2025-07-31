import { Transaction } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';

import {
	_new as newChannel,
	addWrappedKek,
	withDefaults,
	share as shareChannel,
} from './contracts/sui_messaging/channel';

// TODO: These will be implemented later
import { Command } from '@mysten/sui/transactions';
const addMember = ({ arguments: { self, creatorCap, member } }: any): Command => ({
	$kind: 'MoveCall',
	MoveCall: {
		package: '0x0',
		module: 'channel',
		function: 'add_member',
		typeArguments: [],
		arguments: [self, creatorCap, member],
	},
});
const addMessage = ({ arguments: { self, creatorCap, message } }: any): Command => ({
	$kind: 'MoveCall',
	MoveCall: {
		package: '0x0',
		module: 'channel',
		function: 'add_message',
		typeArguments: [],
		arguments: [self, creatorCap, message],
	},
});

import {
	ChannelMembershipsRequest,
	MessagingCompatibleClient,
	MessagingPackageConfig,
	TransactionNestedResultArgument,
} from './types';
import { MAINNET_MESSAGING_PACKAGE_CONFIG, TESTNET_MESSAGING_PACKAGE_CONFIG } from './constants';
import { MessagingClientError } from './error';
import { bcs } from '@mysten/sui/bcs';

export interface MessagingClientExtensionOptions {
	packageConfig?: MessagingPackageConfig;
	network?: 'mainnet' | 'testnet';
}

export interface MessagingClientOptions extends MessagingClientExtensionOptions {
	suiClient: MessagingCompatibleClient;
}

export class MessagingClient {
	#suiClient: MessagingCompatibleClient;
	#packageConfig: MessagingPackageConfig;

	constructor(public options: MessagingClientOptions) {
		this.#suiClient = options.suiClient;

		if (options.network && !options.packageConfig) {
			const network = options.network;
			switch (network) {
				case 'testnet':
					this.#packageConfig = TESTNET_MESSAGING_PACKAGE_CONFIG;
					break;
				case 'mainnet':
					this.#packageConfig = MAINNET_MESSAGING_PACKAGE_CONFIG;
					break;
				default:
					throw new MessagingClientError(`Unsupported network: ${network}`);
			}
		} else {
			this.#packageConfig = options.packageConfig!;
		}
	}

	static experimental_asClientExtension(options: MessagingClientExtensionOptions) {
		return {
			name: 'messaging' as const,
			register: (client: MessagingCompatibleClient) => {
				return new MessagingClient({
					suiClient: client,
					...options,
				});
			},
		};
	}

	// ===== Read Path =====

	async fetchChannelMemberships(request: ChannelMembershipsRequest) {
		return this.#suiClient.core.getOwnedObjects({
			...request,
			type: this.#packageConfig.memberCapType,
		});
	}

	// ===== Write Path =====
	createChannel(
		initialMembers: string[],
		initialMessage?: string,
	): (tx: Transaction) => [TransactionNestedResultArgument, TransactionNestedResultArgument] {
		return (tx: Transaction) => {
			// Create a new channel
			const [channel, creatorCap] = tx.add(newChannel());

			// TODO: Use Seal to generate and wrap a KEK (Key Encryption Key)
			tx.add(
				addWrappedKek({
					arguments: {
						self: channel,
						creatorCap,
						wrappedKek: tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes()),
					},
				}),
			);

			// Use defaults
			tx.add(
				withDefaults({
					arguments: {
						self: channel,
						creatorCap,
					},
				}),
			);

			// Add initial members
			for (const member of initialMembers) {
				tx.add(
					addMember({
						arguments: {
							self: channel,
							creatorCap,
							member,
						},
					}),
				);
			}

			// Add initial message if provided
			if (initialMessage) {
				tx.add(
					addMessage({
						arguments: {
							self: channel,
							creatorCap,
							message: initialMessage,
						},
					}),
				);
			}

			return [channel, creatorCap];
		};
	}

	async executeCreateChanneltransaction({
		signer,
		initialMembers,
		initialMessage,
	}: { initialMembers: string[]; initialMessage?: string } & { signer: Signer }) {
		const tx = new Transaction();
		const [channel, creatorCap] = tx.add(this.createChannel(initialMembers, initialMessage));
		// Share the channel
		tx.add(
			shareChannel({
				arguments: {
					self: channel,
				},
			}),
		);

		// Transfer creatorCap to the signer
		tx.transferObjects([creatorCap], signer.toSuiAddress());

		// Execute the transaction
		const { digest } = await this.#executeTransaction(tx, signer, 'create channel');

		return { digest };
	}

	// ===== Private Methods =====
	async #executeTransaction(transaction: Transaction, signer: Signer, action: string) {
		transaction.setSenderIfNotSet(signer.toSuiAddress());

		const { digest, effects } = await signer.signAndExecuteTransaction({
			transaction,
			client: this.#suiClient,
		});

		if (effects?.status.error) {
			throw new MessagingClientError(`Failed to ${action} (${digest}): ${effects?.status.error}`);
		}

		await this.#suiClient.core.waitForTransaction({
			digest,
		});

		return { digest, effects };
	}
}
