import { Transaction, TransactionObjectArgument } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { Signer } from '@mysten/sui/cryptography';

import {
  addWrappedKek,
  _new as newChannel,
  share as shareChannel,
  withDefaults,
  withInitialMembers,
  withInitialMessage,
  withInitialRoles,
} from '../contracts/sui_messaging/channel';
import { NotImplementedFeatureError } from '../error';

export interface CreateChannelContext {
  signer: Signer;
  tx: Transaction;
  packageId?: string;
  channel: TransactionObjectArgument;
  creatorCap: TransactionObjectArgument;
}

export interface CreateChannelBuilderOptions {
  signer: Signer;
  transaction: Transaction;
  packageId?: string;
}

// The flow entry point
export class CreateChannelBuilder {
  #signer: Signer;
  #tx: Transaction;
  #packageId?: string;

  constructor({ signer, transaction = new Transaction(), packageId = undefined }: CreateChannelBuilderOptions) {
    this.#signer = signer;
    this.#tx = transaction;
    this.#packageId = packageId;
  }
  /** Begin the flow. Must be called first. */
  init(): AddEncryptedKeyStep {
    const [channel, creatorCap] = this.#tx.add(newChannel({ package: this.#packageId }));
    const context: CreateChannelContext = {
      signer: this.#signer,
      tx: this.#tx,
      packageId: this.#packageId,
      channel,
      creatorCap,
    };

    return new AddEncryptedKeyStep(context);
  }
}

// Step 2: add encrypted key step
export class AddEncryptedKeyStep {
  #context: CreateChannelContext;
  constructor(context: CreateChannelContext) {
    this.#context = context;
  }

  addEncryptedKey(): BuildStep {
    // TODO: Implement Envelope Encryption with Seal
    // Mocking it for now
    const wrappedKek = this.#context.tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes());
    this.#context.tx.add(
      addWrappedKek({
        package: this.#context.packageId,
        arguments: {
          self: this.#context.channel,
          creatorCap: this.#context.creatorCap,
          wrappedKek,
        },
      }),
    );
    return new BuildStep(this.#context);
  }
}

// Step 3: build step with optional settings
export class BuildStep {
  #context: CreateChannelContext;

  constructor(context: CreateChannelContext) {
    this.#context = context;
  }

  /** Optional configuration: set default Roles and Config. */
  withDefaults(): this {
    this.#context.tx.add(
      withDefaults({
        package: this.#context.packageId,
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
        package: this.#context.packageId,
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
        package: this.#context.packageId,
        arguments: {
          self: this.#context.channel,
          creatorCap: this.#context.creatorCap,
          initialMembers: initialMemberAddresses,
        },
      }),
    );
    return this;
  }
  /** Optional: set an initial message. */
  withInitialMessage(initialMessage: string): this {
    if (typeof initialMessage !== 'string' || initialMessage.length < 1) {
      return this;
    }
    // TODO: Inocorporate Envelope Encryption once implemented
    // Mocking this for now
    const messageBytes = this.#context.tx.pure(
      bcs.vector(bcs.U8).serialize(new TextEncoder().encode(initialMessage)),
    );
    const nonce = this.#context.tx.pure(bcs.vector(bcs.U8).serialize([9, 0, 9, 0]).toBytes());
    const wrappedDek = this.#context.tx.pure(bcs.vector(bcs.U8).serialize([1, 2, 3]).toBytes());
    this.#context.tx.add(
      withInitialMessage({
        package: this.#context.packageId,
        arguments: {
          self: this.#context.channel,
          creatorCap: this.#context.creatorCap,
          ciphertext: messageBytes,
          wrappedDek,
          nonce,
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

  #shareChannel(): void {
    this.#context.tx.add(
      shareChannel({
        package: this.#context.packageId,
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
