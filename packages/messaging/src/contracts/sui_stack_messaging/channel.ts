// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0
import { MoveStruct, MoveTuple, normalizeMoveArguments } from '../utils/index.js';
import type { RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import type { Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
import * as auth from './auth.js';
import * as table_vec from './deps/sui/table_vec.js';
import * as message from './message.js';
import * as encryption_key_history from './encryption_key_history.js';
const $moduleName = '@local-pkg/sui-stack-messaging::channel';
export const Channel = new MoveStruct({
	name: `${$moduleName}::Channel`,
	fields: {
		id: object.UID,
		/** The version of this object, for handling updgrades. */
		version: bcs.u64(),
		/**
		 * The Authorization struct, gating actions to member permissions. Note: It also,
		 * practically, keeps tracks of the members (MemberCap ID -> Permissions)
		 */
		auth: auth.Auth,
		/**
		 * The message history of the channel.
		 *
		 * Using `TableVec` to avoid the object size limit.
		 */
		messages: table_vec.TableVec,
		/**
		 * The total number of messages, for efficiency, so that we don't have to make a
		 * call to messages.length() (Maybe I am overthinking this, need to measure)
		 */
		messages_count: bcs.u64(),
		/**
		 * A duplicate of the last entry of the messages TableVec,
		 *
		 * Utilize this for efficient fetching e.g. list of conversations showing the
		 * latest message and the user who sent it
		 */
		last_message: bcs.option(message.Message),
		/** The timestamp (in milliseconds) when the channel was created. */
		created_at_ms: bcs.u64(),
		/**
		 * The timestamp (in milliseconds) when the channel was last updated. (e.g. change
		 * in metadata, members, admins, keys)
		 */
		updated_at_ms: bcs.u64(),
		/**
		 * History of Encryption keys
		 *
		 * Holds the latest key, the latest_version, and a TableVec of the historical keys
		 */
		encryption_key_history: encryption_key_history.EncryptionKeyHistory,
	},
});
export const ReadMessages = new MoveTuple({
	name: `${$moduleName}::ReadMessages`,
	fields: [bcs.bool()],
});
export const SendMessage = new MoveTuple({
	name: `${$moduleName}::SendMessage`,
	fields: [bcs.bool()],
});
export interface NewArguments {
	config: RawTransactionArgument<string | null>;
}
export interface NewOptions {
	package?: string;
	arguments: NewArguments | [config: RawTransactionArgument<string | null>];
}
/**
 * Create a new `Channel` object with empty Config, Roles, messages. Adds the
 * creator as a member.
 *
 * The flow is: new() -> (optionally set initial config) -> (optionally set initial
 * members) -> share() -> client generate a DEK and encrypt it with Seal using the
 * ChannelID as identity bytes -> add_encrypted_key()
 */
export function _new(options: NewOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`0x0000000000000000000000000000000000000000000000000000000000000001::option::Option<${packageAddress}::config::Config>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['config'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'new',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface ShareArguments {
	self: RawTransactionArgument<string>;
}
export interface ShareOptions {
	package?: string;
	arguments: ShareArguments | [self: RawTransactionArgument<string>];
}
/**
 * Share the Channel object, making it accessible to all members. Note: at this
 * point the client needs to attach an encrypted DEK. Otherwise, the channel is
 * considered in an invalid state.
 */
export function share(options: ShareOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [`${packageAddress}::channel::Channel`] satisfies string[];
	const parameterNames = ['self'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'share',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface AddEncryptedKeyArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	newEncryptionKeyBytes: RawTransactionArgument<number[]>;
}
export interface AddEncryptedKeyOptions {
	package?: string;
	arguments:
		| AddEncryptedKeyArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				newEncryptionKeyBytes: RawTransactionArgument<number[]>,
		  ];
}
/** Add the encrypted Channel Key (a key encrypted with Seal) to the Channel. */
export function addEncryptedKey(options: AddEncryptedKeyOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'vector<u8>',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'newEncryptionKeyBytes'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'add_encrypted_key',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface AddMembersArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	n: RawTransactionArgument<number | bigint>;
}
export interface AddMembersOptions {
	package?: string;
	arguments:
		| AddMembersArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				n: RawTransactionArgument<number | bigint>,
		  ];
}
/**
 * Add new members to the Channel with the default ReadMessages permission.
 * ReadMessages is the minimum permission granted to all members.
 */
export function addMembers(options: AddMembersOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'u64',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'n'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'add_members',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface RemoveMembersArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	membersToRemove: RawTransactionArgument<string[]>;
}
export interface RemoveMembersOptions {
	package?: string;
	arguments:
		| RemoveMembersArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				membersToRemove: RawTransactionArgument<string[]>,
		  ];
}
/**
 * Remove members from the Channel TODO: should we enforce a key rotation here, by
 * asking for a new_encryption_key arg?
 */
export function removeMembers(options: RemoveMembersOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'vector<0x0000000000000000000000000000000000000000000000000000000000000002::object::ID>',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'membersToRemove'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'remove_members',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface PromoteMemberArguments {
	self: RawTransactionArgument<string>;
	granterCap: RawTransactionArgument<string>;
	memberCapId: RawTransactionArgument<string>;
}
export interface PromoteMemberOptions {
	package?: string;
	arguments:
		| PromoteMemberArguments
		| [
				self: RawTransactionArgument<string>,
				granterCap: RawTransactionArgument<string>,
				memberCapId: RawTransactionArgument<string>,
		  ];
	typeArguments: [string];
}
/**
 * Grant a permission to a member. Requires ManagePermissions permission.
 *
 * Example: promote_member<SendMessage>(&mut channel, &admin_cap, member_id,
 * &clock)
 */
export function promoteMember(options: PromoteMemberOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::ID',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'granterCap', 'memberCapId'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'promote_member',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface PromoteMembersArguments {
	self: RawTransactionArgument<string>;
	granterCap: RawTransactionArgument<string>;
	memberCaps: RawTransactionArgument<string[]>;
}
export interface PromoteMembersOptions {
	package?: string;
	arguments:
		| PromoteMembersArguments
		| [
				self: RawTransactionArgument<string>,
				granterCap: RawTransactionArgument<string>,
				memberCaps: RawTransactionArgument<string[]>,
		  ];
	typeArguments: [string];
}
/**
 * Grant a permission to multiple members at once. Requires ManagePermissions
 * permission.
 *
 * This is useful for promoting initial members during channel creation. Takes a
 * vector of MemberCaps and grants the specified permission to all of them.
 */
export function promoteMembers(options: PromoteMembersOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		`vector<${packageAddress}::member_cap::MemberCap>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'granterCap', 'memberCaps'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'promote_members',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface DemoteMemberArguments {
	self: RawTransactionArgument<string>;
	revokerCap: RawTransactionArgument<string>;
	memberCapId: RawTransactionArgument<string>;
}
export interface DemoteMemberOptions {
	package?: string;
	arguments:
		| DemoteMemberArguments
		| [
				self: RawTransactionArgument<string>,
				revokerCap: RawTransactionArgument<string>,
				memberCapId: RawTransactionArgument<string>,
		  ];
	typeArguments: [string];
}
/**
 * Revoke a permission from a member. Requires ManagePermissions permission.
 *
 * Example: demote_member<SendMessage>(&mut channel, &admin_cap, member_id, &clock)
 */
export function demoteMember(options: DemoteMemberOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::object::ID',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'revokerCap', 'memberCapId'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'demote_member',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
			typeArguments: options.typeArguments,
		});
}
export interface SendMessageArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	ciphertext: RawTransactionArgument<number[]>;
	nonce: RawTransactionArgument<number[]>;
	attachments: RawTransactionArgument<string[]>;
}
export interface SendMessageOptions {
	package?: string;
	arguments:
		| SendMessageArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				ciphertext: RawTransactionArgument<number[]>,
				nonce: RawTransactionArgument<number[]>,
				attachments: RawTransactionArgument<string[]>,
		  ];
}
/** Send a new message to the Channel. Requires SendMessage permission. */
export function sendMessage(options: SendMessageOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::member_cap::MemberCap`,
		'vector<u8>',
		'vector<u8>',
		`vector<${packageAddress}::attachment::Attachment>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'ciphertext', 'nonce', 'attachments'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'send_message',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface NamespaceArguments {
	self: RawTransactionArgument<string>;
}
export interface NamespaceOptions {
	package?: string;
	arguments: NamespaceArguments | [self: RawTransactionArgument<string>];
}
/**
 * Returns a namespace for the channel to be utilized by seal_policies In this case
 * we use the Channel's UID bytes
 */
export function namespace(options: NamespaceOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
	const argumentsTypes = [`${packageAddress}::channel::Channel`] satisfies string[];
	const parameterNames = ['self'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'channel',
			function: 'namespace',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
