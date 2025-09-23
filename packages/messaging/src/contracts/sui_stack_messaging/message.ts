// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { MoveStruct, normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import type { Transaction } from '@mysten/sui/transactions';
import * as attachment from './attachment.js';
const $moduleName = '@local-pkg/sui-stack-messaging::message';
export const Message = new MoveStruct({
	name: `${$moduleName}::Message`,
	fields: {
		/** The address of the sender of this message. TODO: should we encrypt this as well? */
		sender: bcs.Address,
		/** The message content, encrypted with a DEK(Data Encryption Key) */
		ciphertext: bcs.vector(bcs.u8()),
		/** The nonce used for the encryption of the content. */
		nonce: bcs.vector(bcs.u8()),
		/**
		 * The version of the DEK(Data Encryption Key) that was used to encrypt this
		 * Message
		 */
		key_version: bcs.u32(),
		/** A vector of attachments associated with this message. */
		attachments: bcs.vector(attachment.Attachment),
		/** Timestamp in milliseconds when the message was created. */
		created_at_ms: bcs.u64(),
	},
});
export const MessageAddedEvent = new MoveStruct({
	name: `${$moduleName}::MessageAddedEvent`,
	fields: {
		channel_id: bcs.Address,
		message_index: bcs.u64(),
		sender: bcs.Address,
		ciphertext: bcs.vector(bcs.u8()),
		nonce: bcs.vector(bcs.u8()),
		key_version: bcs.u32(),
		attachment_refs: bcs.vector(bcs.string()),
		attachment_nonces: bcs.vector(bcs.vector(bcs.u8())),
		created_at_ms: bcs.u64(),
	},
});
export interface NewArguments {
	sender: RawTransactionArgument<string>;
	ciphertext: RawTransactionArgument<number[]>;
	nonce: RawTransactionArgument<number[]>;
	keyVersion: RawTransactionArgument<number>;
	attachments: RawTransactionArgument<string[]>;
}
export interface NewOptions {
	package?: string;
	arguments:
		| NewArguments
		| [
				sender: RawTransactionArgument<string>,
				ciphertext: RawTransactionArgument<number[]>,
				nonce: RawTransactionArgument<number[]>,
				keyVersion: RawTransactionArgument<number>,
				attachments: RawTransactionArgument<string[]>,
		  ];
}
export function _new(options: NewOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		'address',
		'vector<u8>',
		'vector<u8>',
		'u32',
		`vector<${packageAddress}::attachment::Attachment>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['sender', 'ciphertext', 'nonce', 'keyVersion', 'attachments', 'clock'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'message',
			function: 'new',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
