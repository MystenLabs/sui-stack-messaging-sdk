/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * Public facing api Alternatively, we could have a "module_name_api.move" per
 * module, e.g. "channel_core.move" & "channel_api.move" in the
 * "module_name_core.move" we would have only the struct + enums + events, and only
 * public(package) getters and setters, and of course public "new/mint/share"
 * functions then in the "module_name_api.move" we would have the public/entry
 * functions that interact with the structs and internally call the getters and
 * setters
 */

import { type Transaction } from '@mysten/sui/transactions';
import { normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
export interface SendMessageArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	ciphertext: RawTransactionArgument<number[]>;
	wrappedDek: RawTransactionArgument<number[]>;
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
				wrappedDek: RawTransactionArgument<number[]>,
				nonce: RawTransactionArgument<number[]>,
				attachments: RawTransactionArgument<string[]>,
		  ];
}
export function sendMessage(options: SendMessageOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui_messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::channel::MemberCap`,
		'vector<u8>',
		'vector<u8>',
		'vector<u8>',
		`vector<${packageAddress}::attachment::Attachment>`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = [
		'self',
		'memberCap',
		'ciphertext',
		'wrappedDek',
		'nonce',
		'attachments',
		'clock',
	];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'api',
			function: 'send_message',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface AddMembersArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	members: RawTransactionArgument<string>;
}
export interface AddMembersOptions {
	package?: string;
	arguments:
		| AddMembersArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				members: RawTransactionArgument<string>,
		  ];
}
export function addMembers(options: AddMembersOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui_messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::channel::MemberCap`,
		'0x0000000000000000000000000000000000000000000000000000000000000002::vec_map::VecMap<address, 0x0000000000000000000000000000000000000000000000000000000000000001::string::String>',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'members', 'clock'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'api',
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
export function removeMembers(options: RemoveMembersOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui_messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::channel::MemberCap`,
		'vector<0x0000000000000000000000000000000000000000000000000000000000000002::object::ID>',
		'0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'membersToRemove', 'clock'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'api',
			function: 'remove_members',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
export interface EditConfigArguments {
	self: RawTransactionArgument<string>;
	memberCap: RawTransactionArgument<string>;
	config: RawTransactionArgument<string>;
}
export interface EditConfigOptions {
	package?: string;
	arguments:
		| EditConfigArguments
		| [
				self: RawTransactionArgument<string>,
				memberCap: RawTransactionArgument<string>,
				config: RawTransactionArgument<string>,
		  ];
}
/**
 * Edit Config Helper Looks like a candidate for `api.move` module We could also
 * expose separate functions for each config value
 */
export function editConfig(options: EditConfigOptions) {
	const packageAddress = options.package ?? '@local-pkg/sui_messaging';
	const argumentsTypes = [
		`${packageAddress}::channel::Channel`,
		`${packageAddress}::channel::MemberCap`,
		`${packageAddress}::config::Config`,
	] satisfies string[];
	const parameterNames = ['self', 'memberCap', 'config'];
	return (tx: Transaction) =>
		tx.moveCall({
			package: packageAddress,
			module: 'api',
			function: 'edit_config',
			arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
		});
}
