/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import {
  MoveStruct,
  MoveEnum,
  MoveTuple,
  normalizeMoveArguments,
  type RawTransactionArgument,
} from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
import * as table from './deps/sui/table.js';
import * as table_vec from './deps/sui/table_vec.js';
import * as message from './message.js';
const $moduleName = '@local-pkg/sui_messaging::channel';
export const CreatorCap = new MoveStruct({
  name: `${$moduleName}::CreatorCap`,
  fields: {
    id: object.UID,
    channel_id: bcs.Address,
  },
});
export const MemberCap = new MoveStruct({
  name: `${$moduleName}::MemberCap`,
  fields: {
    id: object.UID,
    channel_id: bcs.Address,
  },
});
export const Channel = new MoveStruct({
  name: `${$moduleName}::Channel`,
  fields: {
    id: object.UID,
    /** The version of this object, for handling updgrades. */
    version: bcs.u64(),
    /**
     * Maps custom role names(e.g. "Moderator") to `Role` structs containing a granular
     * set of permissions.
     */
    roles: table.Table,
    /**
     * A table mapping `MemberCap` ids to their roles and join timestamps. We do not
     * include the MemberInfo in the `MemberCap` because we want to be able to change
     * permissions.
     *
     * We do not need to worry with burning the MemberCap, since we can simply remove
     * the MemberCap ID from the members Table and rotate the KEK when a member is
     * removed from the channel.
     */
    members: table.Table,
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
    /**
     * The encrypted key encryption key (KEK) for this channel, encrypted via `Seal`.
     *
     * This key is required to decrypt the DEK of each message.
     */
    wrapped_kek: bcs.vector(bcs.u8()),
    /**
     * The version number for the KEK.
     *
     * This is incremented each time the key is rotated.
     */
    kek_version: bcs.u64(),
    /** The timestamp (in milliseconds) when the channel was created. */
    created_at_ms: bcs.u64(),
    /**
     * The timestamp (in milliseconds) when the channel was last updated. (e.g. change
     * in metadata, members, admins, keys)
     */
    updated_at_ms: bcs.u64(),
  },
});
export const Presense = new MoveEnum({
  name: `${$moduleName}::Presense`,
  fields: {
    Online: null,
    Offline: null,
  },
});
export const MemberInfo = new MoveStruct({
  name: `${$moduleName}::MemberInfo`,
  fields: {
    role_name: bcs.string(),
    joined_at_ms: bcs.u64(),
    presense: Presense,
  },
});
export const ConfigReturnPromise = new MoveStruct({
  name: `${$moduleName}::ConfigReturnPromise`,
  fields: {
    channel_id: bcs.Address,
    member_cap_id: bcs.Address,
  },
});
export const ConfigKey = new MoveTuple({ name: `${$moduleName}::ConfigKey`, fields: [bcs.bool()] });
export const MessageSent = new MoveStruct({
  name: `${$moduleName}::MessageSent`,
  fields: {
    sender: bcs.Address,
    timestamp_ms: bcs.u64(),
  },
});
export interface NewArguments {}
export interface NewOptions {
  package?: string;
  arguments?: NewArguments | [];
}
/**
 * Create a new `Channel` object with empty Config, Roles, messages. Adds the
 * creator as a member.
 *
 * The flow is: new() -> (optionally set_initial_roles()) -> (optionally
 * set_initial_members()) -> (optionally add_config())
 */
export function _new(options: NewOptions = {}) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
  ] satisfies string[];
  const parameterNames = ['clock'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'new',
      arguments: normalizeMoveArguments(options.arguments ?? [], argumentsTypes, parameterNames),
    });
}
export interface WithDefaultsArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
}
export interface WithDefaultsOptions {
  package?: string;
  arguments:
    | WithDefaultsArguments
    | [self: RawTransactionArgument<string>, creatorCap: RawTransactionArgument<string>];
}
/** Take a Channel, add default Config and default Roles, */
export function withDefaults(options: WithDefaultsOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_defaults',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AddWrappedKekArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  wrappedKek: RawTransactionArgument<number[]>;
}
export interface AddWrappedKekOptions {
  package?: string;
  arguments:
    | AddWrappedKekArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        wrappedKek: RawTransactionArgument<number[]>,
      ];
}
export function addWrappedKek(options: AddWrappedKekOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    'vector<u8>',
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'wrappedKek'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'add_wrapped_kek',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
}
export interface ShareOptions {
  package?: string;
  arguments:
    | ShareArguments
    | [self: RawTransactionArgument<string>, creatorCap: RawTransactionArgument<string>];
}
export function share(options: ShareOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'share',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithInitialRolesArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  roles: RawTransactionArgument<string>;
}
export interface WithInitialRolesOptions {
  package?: string;
  arguments:
    | WithInitialRolesArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        roles: RawTransactionArgument<string>,
      ];
}
export function withInitialRoles(options: WithInitialRolesOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    `0x0000000000000000000000000000000000000000000000000000000000000002::vec_map::VecMap<0x0000000000000000000000000000000000000000000000000000000000000001::string::String, ${packageAddress}::permissions::Role>`,
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'roles'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_initial_roles',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithInitialMembersWithRolesArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  initialMembers: RawTransactionArgument<string>;
}
export interface WithInitialMembersWithRolesOptions {
  package?: string;
  arguments:
    | WithInitialMembersWithRolesArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        initialMembers: RawTransactionArgument<string>,
      ];
}
export function withInitialMembersWithRoles(options: WithInitialMembersWithRolesOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    '0x0000000000000000000000000000000000000000000000000000000000000002::vec_map::VecMap<address, 0x0000000000000000000000000000000000000000000000000000000000000001::string::String>',
    '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'initialMembers', 'clock'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_initial_members_with_roles',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithInitialMembersArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  initialMembers: RawTransactionArgument<string[]>;
}
export interface WithInitialMembersOptions {
  package?: string;
  arguments:
    | WithInitialMembersArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        initialMembers: RawTransactionArgument<string[]>,
      ];
}
export function withInitialMembers(options: WithInitialMembersOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    'vector<address>',
    '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'initialMembers', 'clock'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_initial_members',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithInitialConfigArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  config: RawTransactionArgument<string>;
}
export interface WithInitialConfigOptions {
  package?: string;
  arguments:
    | WithInitialConfigArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
      ];
}
/** Attach a dynamic config object to the Channel. */
export function withInitialConfig(options: WithInitialConfigOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    `${packageAddress}::config::Config`,
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'config'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_initial_config',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface WithInitialMessageArguments {
  self: RawTransactionArgument<string>;
  creatorCap: RawTransactionArgument<string>;
  ciphertext: RawTransactionArgument<number[]>;
  wrappedDek: RawTransactionArgument<number[]>;
  nonce: RawTransactionArgument<number[]>;
}
export interface WithInitialMessageOptions {
  package?: string;
  arguments:
    | WithInitialMessageArguments
    | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        ciphertext: RawTransactionArgument<number[]>,
        wrappedDek: RawTransactionArgument<number[]>,
        nonce: RawTransactionArgument<number[]>,
      ];
}
/** Add an initial message to the Channel when creating it */
export function withInitialMessage(options: WithInitialMessageOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::CreatorCap`,
    'vector<u8>',
    'vector<u8>',
    'vector<u8>',
    '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock',
  ] satisfies string[];
  const parameterNames = ['self', 'creatorCap', 'ciphertext', 'wrappedDek', 'nonce', 'clock'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'with_initial_message',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ReturnConfigArguments {
  self: RawTransactionArgument<string>;
  memberCap: RawTransactionArgument<string>;
  config: RawTransactionArgument<string>;
  promise: RawTransactionArgument<string>;
}
export interface ReturnConfigOptions {
  package?: string;
  arguments:
    | ReturnConfigArguments
    | [
        self: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        promise: RawTransactionArgument<string>,
      ];
}
export function returnConfig(options: ReturnConfigOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::MemberCap`,
    `${packageAddress}::config::Config`,
    `${packageAddress}::channel::ConfigReturnPromise`,
  ] satisfies string[];
  const parameterNames = ['self', 'memberCap', 'config', 'promise'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'return_config',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigArguments {
  self: RawTransactionArgument<string>;
}
export interface ConfigOptions {
  package?: string;
  arguments: ConfigArguments | [self: RawTransactionArgument<string>];
}
/** Borrow the dynamic config object. (Read-only) */
export function config(options: ConfigOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [`${packageAddress}::channel::Channel`] satisfies string[];
  const parameterNames = ['self'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'config',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface RemoveConfigForEditingArguments {
  self: RawTransactionArgument<string>;
  memberCap: RawTransactionArgument<string>;
}
export interface RemoveConfigForEditingOptions {
  package?: string;
  arguments:
    | RemoveConfigForEditingArguments
    | [self: RawTransactionArgument<string>, memberCap: RawTransactionArgument<string>];
}
/**
 * Detach the dynamic config from the Channel for editing purposes. The member
 * should then add it back.
 */
export function removeConfigForEditing(options: RemoveConfigForEditingOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [
    `${packageAddress}::channel::Channel`,
    `${packageAddress}::channel::MemberCap`,
  ] satisfies string[];
  const parameterNames = ['self', 'memberCap'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'remove_config_for_editing',
      arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface KekVersionArguments {
  self: RawTransactionArgument<string>;
}
export interface KekVersionOptions {
  package?: string;
  arguments: KekVersionArguments | [self: RawTransactionArgument<string>];
}
export function kekVersion(options: KekVersionOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
  const argumentsTypes = [`${packageAddress}::channel::Channel`] satisfies string[];
  const parameterNames = ['self'];
  return (tx: Transaction) =>
    tx.moveCall({
      package: packageAddress,
      module: 'channel',
      function: 'kek_version',
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
export function namespace(options: NamespaceOptions) {
  const packageAddress = options.package ?? '@local-pkg/sui_messaging';
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
