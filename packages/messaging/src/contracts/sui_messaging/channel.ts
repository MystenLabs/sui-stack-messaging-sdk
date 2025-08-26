/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, MoveEnum, MoveTuple, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
import * as table from './deps/sui/table.js';
import * as table_vec from './deps/sui/table_vec.js';
import * as message from './message.js';
const $moduleName = '@local-pkg/sui_messaging::channel';
export const CreatorCap = new MoveStruct({ name: `${$moduleName}::CreatorCap`, fields: {
        id: object.UID,
        channel_id: bcs.Address
    } });
export const MemberCap = new MoveStruct({ name: `${$moduleName}::MemberCap`, fields: {
        id: object.UID,
        channel_id: bcs.Address
    } });
export const Channel = new MoveStruct({ name: `${$moduleName}::Channel`, fields: {
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
        /** The timestamp (in milliseconds) when the channel was created. */
        created_at_ms: bcs.u64(),
        /**
         * The timestamp (in milliseconds) when the channel was last updated. (e.g. change
         * in metadata, members, admins, keys)
         */
        updated_at_ms: bcs.u64()
    } });
export const Presense = new MoveEnum({ name: `${$moduleName}::Presense`, fields: {
        Online: null,
        Offline: null
    } });
export const MemberInfo = new MoveStruct({ name: `${$moduleName}::MemberInfo`, fields: {
        role_name: bcs.string(),
        joined_at_ms: bcs.u64(),
        presense: Presense
    } });
export const ConfigReturnPromise = new MoveStruct({ name: `${$moduleName}::ConfigReturnPromise`, fields: {
        channel_id: bcs.Address,
        member_cap_id: bcs.Address
    } });
export const ConfigKey = new MoveTuple({ name: `${$moduleName}::ConfigKey`, fields: [bcs.bool()] });
export const EncryptionKeyField = new MoveTuple({ name: `${$moduleName}::EncryptionKeyField`, fields: [bcs.bool()] });
export interface NewArguments {
}
export interface NewOptions {
    package?: string;
    arguments?: NewArguments | [
    ];
}
/**
 * Create a new `Channel` object with empty Config, Roles, messages. Adds the
 * creator as a member.
 *
 * The flow is: new() -> (optionally set_initial_roles()) -> (optionally
 * set_initial_members()) -> (optionally add_config()) -> share() -> client
 * generate a DEK and encrypt it with Seal using the ChannelID as identity bytes ->
 * add_encrypted_key(CreatorCap)
 */
export function _new(options: NewOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock'
    ] satisfies string[];
    const parameterNames = ["clock"];
    return (tx: Transaction) => tx.moveCall({
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
    arguments: WithDefaultsArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>
    ];
}
/** Take a Channel, add default Config and default Roles, */
export function withDefaults(options: WithDefaultsOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'with_defaults',
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
    arguments: WithInitialRolesArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        roles: RawTransactionArgument<string>
    ];
}
/** Add custom roles to the Channel, overwriting the default ones */
export function withInitialRoles(options: WithInitialRolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`,
        `0x0000000000000000000000000000000000000000000000000000000000000002::vec_map::VecMap<0x0000000000000000000000000000000000000000000000000000000000000001::string::String, ${packageAddress}::permissions::Role>`
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap", "roles"];
    return (tx: Transaction) => tx.moveCall({
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
    arguments: WithInitialMembersWithRolesArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        initialMembers: RawTransactionArgument<string>
    ];
}
/**
 * Add initial member to the Channel, with custom assigned roles. Note1: the
 * role_names must already exist in the Channel. Note2: the creator is already
 * automatically added as a member, so no need to include them here.
 */
export function withInitialMembersWithRoles(options: WithInitialMembersWithRolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`,
        '0x0000000000000000000000000000000000000000000000000000000000000002::vec_map::VecMap<address, 0x0000000000000000000000000000000000000000000000000000000000000001::string::String>',
        '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock'
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap", "initialMembers", "clock"];
    return (tx: Transaction) => tx.moveCall({
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
    arguments: WithInitialMembersArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        initialMembers: RawTransactionArgument<string[]>
    ];
}
/**
 * Add initial member to the Channel, with the default role. Note1: the creator is
 * already automatically added as a member, so no need to include them here.
 */
export function withInitialMembers(options: WithInitialMembersOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`,
        'vector<address>',
        '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock'
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap", "initialMembers", "clock"];
    return (tx: Transaction) => tx.moveCall({
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
    arguments: WithInitialConfigArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>
    ];
}
/** Attach a dynamic config object to the Channel. */
export function withInitialConfig(options: WithInitialConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`,
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap", "config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'with_initial_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ShareArguments {
    self: RawTransactionArgument<string>;
    creatorCap: RawTransactionArgument<string>;
}
export interface ShareOptions {
    package?: string;
    arguments: ShareArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>
    ];
}
/**
 * Share the Channel object Note: at this point the client needs to attach an
 * encrypted DEK Otherwise, it is considered in an invalid state, and cannot be
 * interacted with.
 */
export function share(options: ShareOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'share',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface AddEncryptedKeyArguments {
    self: RawTransactionArgument<string>;
    creatorCap: RawTransactionArgument<string>;
    encryptedKeyBytes: RawTransactionArgument<number[]>;
}
export interface AddEncryptedKeyOptions {
    package?: string;
    arguments: AddEncryptedKeyArguments | [
        self: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        encryptedKeyBytes: RawTransactionArgument<number[]>
    ];
}
/**
 * Add the encrypted Channel Key (a key encrypted with Seal) to the Channel.
 *
 * This function is meant to be called only once, right after creating and sharing
 * the Channel. This is because we need the ChannelID available on the client side,
 * to use as identity bytes when encrypting the Channel's Data Encryption Key with
 * Seal.
 */
export function addEncryptedKey(options: AddEncryptedKeyOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::CreatorCap`,
        'vector<u8>'
    ] satisfies string[];
    const parameterNames = ["self", "creatorCap", "encryptedKeyBytes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'add_encrypted_key',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigOptions {
    package?: string;
    arguments: ConfigArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrow the dynamic config object. (Read-only) */
export function config(options: ConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
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
    arguments: RemoveConfigForEditingArguments | [
        self: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>
    ];
}
/**
 * Detach the dynamic config from the Channel for editing purposes. The member
 * should then add it back.
 */
export function removeConfigForEditing(options: RemoveConfigForEditingOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::MemberCap`
    ] satisfies string[];
    const parameterNames = ["self", "memberCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'remove_config_for_editing',
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
    arguments: ReturnConfigArguments | [
        self: RawTransactionArgument<string>,
        memberCap: RawTransactionArgument<string>,
        config: RawTransactionArgument<string>,
        promise: RawTransactionArgument<string>
    ];
}
/**
 * Reattach a Config to the Channel after editing it. Burns the
 * `ConfigReturnPromise`.
 */
export function returnConfig(options: ReturnConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`,
        `${packageAddress}::channel::MemberCap`,
        `${packageAddress}::config::Config`,
        `${packageAddress}::channel::ConfigReturnPromise`
    ] satisfies string[];
    const parameterNames = ["self", "memberCap", "config", "promise"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'return_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EncryptionKeyArguments {
    self: RawTransactionArgument<string>;
}
export interface EncryptionKeyOptions {
    package?: string;
    arguments: EncryptionKeyArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Borrow the channel's encryption key. (read-only) */
export function encryptionKey(options: EncryptionKeyOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'encryption_key',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EncryptionKeyVersionArguments {
    self: RawTransactionArgument<string>;
}
export interface EncryptionKeyVersionOptions {
    package?: string;
    arguments: EncryptionKeyVersionArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Get the current version of the encryption key. (read-only) */
export function encryptionKeyVersion(options: EncryptionKeyVersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'encryption_key_version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface NamespaceArguments {
    self: RawTransactionArgument<string>;
}
export interface NamespaceOptions {
    package?: string;
    arguments: NamespaceArguments | [
        self: RawTransactionArgument<string>
    ];
}
/**
 * Returns a namespace for the channel to be utilized by seal_policies In this case
 * we use the Channel's UID bytes
 */
export function namespace(options: NamespaceOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        `${packageAddress}::channel::Channel`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'channel',
        function: 'namespace',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}