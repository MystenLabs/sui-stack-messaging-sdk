/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as attachment from './attachment.js';
const $moduleName = '@local-pkg/sui_messaging::message';
export const Message = new MoveStruct({
  name: `${$moduleName}::Message`,
  fields: {
    sender: bcs.Address,
    /** The message content, encrypted with a DEK */
    ciphertext: bcs.vector(bcs.u8()),
    /** The DEK for this message, wrapped(encrypted) by the channel's KEK. */
    wrapped_dek: bcs.vector(bcs.u8()),
    /** The nonce used for the encryption of the content. */
    nonce: bcs.vector(bcs.u8()),
    /** The version of the channel KEK that was used to wrap the `wrapped_dek` */
    kek_version: bcs.u64(),
    /** A vector of attachments associated with this message. */
    attachments: bcs.vector(attachment.Attachment),
    created_at_ms: bcs.u64(),
  },
});
export interface NewArguments {
  sender: RawTransactionArgument<string>;
  ciphertext: RawTransactionArgument<number[]>;
  wrappedDek: RawTransactionArgument<number[]>;
  nonce: RawTransactionArgument<number[]>;
  kekVersion: RawTransactionArgument<number | bigint>;
  attachments: RawTransactionArgument<string[]>;
}
export interface NewOptions {
  package?: string;
  arguments:
    | NewArguments
    | [
        sender: RawTransactionArgument<string>,
        ciphertext: RawTransactionArgument<number[]>,
        wrappedDek: RawTransactionArgument<number[]>,
        nonce: RawTransactionArgument<number[]>,
        kekVersion: RawTransactionArgument<number | bigint>,
        attachments: RawTransactionArgument<string[]>,
      ];
}
export function _new(options: NewOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    'address',
    'vector<u8>',
    'vector<u8>',
    'vector<u8>',
    'u64',
    `vector<${packageAddress}::attachment::Attachment>`,
    '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
  ] satisfies string[];
  const parameterNames = [
    'sender',
    'ciphertext',
    'wrappedDek',
    'nonce',
    'kekVersion',
    'attachments',
    'clock',
  ];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'message',
      function: 'new',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
