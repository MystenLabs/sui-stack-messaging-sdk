import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import { Signer } from '@mysten/sui/cryptography';

import {
	_new as newChannel,
	share as shareChannel,
	withDefaults,
	withInitialMembers,
	withInitialRoles,
} from '../contracts/sui_messaging/channel';
import { NotImplementedFeatureError } from '../error';

export interface CreateChannelContext {
	signer: Signer;
	tx: Transaction;
	channel: TransactionObjectArgument;
	creatorCap: TransactionObjectArgument;
}

export interface CreateChannelBuilderOptions {
	signer: Signer;
	transaction: Transaction;
}

// The flow entry point
export class CreateChannelBuilder {
	#signer: Signer;
	#tx: Transaction;
	constructor({ signer, transaction = new Transaction() }: CreateChannelBuilderOptions) {
		this.#signer = signer;
		this.#tx = transaction;
	}
	/** Begin the flow. Must be called first. */
	init(): BuildStep{
		const [channel, creatorCap] = this.#tx.add(newChannel());
		const context: CreateChannelContext = {
			signer: this.#signer,
			tx: this.#tx,
			channel,
			creatorCap,
		};

		return new BuildStep(context);
	}
}


// Step 2: build step with optional settings
export class BuildStep {
	#context: CreateChannelContext;

	constructor(context: CreateChannelContext) {
		this.#context = context;
	}

	/** Optional configuration: set default Roles and Config. */
	withDefaults(): this {
		this.#context.tx.add(
			withDefaults({
				arguments: {
					self: this.#context.channel,
					creatorCap: this.#context.creatorCap,
				},
			}),
		);
		return this;
	}

	/** Optional: add initial roles.
	 *
	 * Note: overwrites any roles set previously
	 * (either from calling `withDefaults`, or from previous `withInitialRoles` calls)
	 */
	withInitialRoles(roles: any): this {
		this.#context.tx.add(
			withInitialRoles({
				arguments: {
					self: this.#context.channel,
					creatorCap: this.#context.creatorCap,
					roles,
				},
			}),
		);
		throw new NotImplementedFeatureError();
		return this;
	}
	/** Optional: add initial members. */
	withInitialMembers(initialMemberAddresses: string[]): this {
		if (initialMemberAddresses.length < 1) {
			return this;
		}
		this.#context.tx.add(
			withInitialMembers({
				arguments: {
					self: this.#context.channel,
					creatorCap: this.#context.creatorCap,
					initialMembers: initialMemberAddresses,
				},
			}),
		);
		return this;
	}
	
	/** Required action: finalize the build. */
	build(): Transaction {
		// Finalize by sharing the channel and transferring the creatorCap to the signer
		this.#shareChannel();
		this.#transferCreatorCap();
		return this.#context.tx;
	}

	context(): CreateChannelContext {
		return this.#context;
	}

	#shareChannel(): void {
		this.#context.tx.add(
			shareChannel({
				arguments: {
					self: this.#context.channel,
					creatorCap: this.#context.creatorCap,
				},
			}),
		);
	}

	#transferCreatorCap(): void {
		this.#context.tx.transferObjects(
			[this.#context.creatorCap],
			this.#context.signer.toSuiAddress(),
		);
	}
}
