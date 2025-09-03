/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveTuple, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/sui-messaging::config';
export const EditConfig = new MoveTuple({ name: `${$moduleName}::EditConfig`, fields: [bcs.bool()] });
export const Config = new MoveStruct({ name: `${$moduleName}::Config`, fields: {
        max_channel_members: bcs.u64(),
        max_channel_roles: bcs.u64(),
        max_message_text_chars: bcs.u64(),
        max_message_attachments: bcs.u64(),
        require_invitation: bcs.bool(),
        require_request: bcs.bool()
    } });
export interface DefaultOptions {
    package?: string;
    arguments?: [
    ];
}
export function _default(options: DefaultOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'default',
    });
}
export interface NewArguments {
    maxChannelMembers: RawTransactionArgument<number | bigint>;
    maxChannelRoles: RawTransactionArgument<number | bigint>;
    maxMessageTextChars: RawTransactionArgument<number | bigint>;
    maxMessageAttachments: RawTransactionArgument<number | bigint>;
    requireInvitation: RawTransactionArgument<boolean>;
    requireRequest: RawTransactionArgument<boolean>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        maxChannelMembers: RawTransactionArgument<number | bigint>,
        maxChannelRoles: RawTransactionArgument<number | bigint>,
        maxMessageTextChars: RawTransactionArgument<number | bigint>,
        maxMessageAttachments: RawTransactionArgument<number | bigint>,
        requireInvitation: RawTransactionArgument<boolean>,
        requireRequest: RawTransactionArgument<boolean>
    ];
}
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        'u64',
        'u64',
        'u64',
        'u64',
        'bool',
        'bool'
    ] satisfies string[];
    const parameterNames = ["maxChannelMembers", "maxChannelRoles", "maxMessageTextChars", "maxMessageAttachments", "requireInvitation", "requireRequest"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsValidConfigArguments {
    config: RawTransactionArgument<string>;
}
export interface IsValidConfigOptions {
    package?: string;
    arguments: IsValidConfigArguments | [
        config: RawTransactionArgument<string>
    ];
}
export function isValidConfig(options: IsValidConfigOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["config"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'is_valid_config',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigMaxChannelMembersArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigMaxChannelMembersOptions {
    package?: string;
    arguments: ConfigMaxChannelMembersArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configMaxChannelMembers(options: ConfigMaxChannelMembersOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_max_channel_members',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigMaxChannelRolesArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigMaxChannelRolesOptions {
    package?: string;
    arguments: ConfigMaxChannelRolesArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configMaxChannelRoles(options: ConfigMaxChannelRolesOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_max_channel_roles',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigMaxMessageTextCharsArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigMaxMessageTextCharsOptions {
    package?: string;
    arguments: ConfigMaxMessageTextCharsArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configMaxMessageTextChars(options: ConfigMaxMessageTextCharsOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_max_message_text_chars',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigMaxMessageAttachmentsArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigMaxMessageAttachmentsOptions {
    package?: string;
    arguments: ConfigMaxMessageAttachmentsArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configMaxMessageAttachments(options: ConfigMaxMessageAttachmentsOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_max_message_attachments',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigRequireInvitationArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigRequireInvitationOptions {
    package?: string;
    arguments: ConfigRequireInvitationArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configRequireInvitation(options: ConfigRequireInvitationOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_require_invitation',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ConfigRequireRequestArguments {
    self: RawTransactionArgument<string>;
}
export interface ConfigRequireRequestOptions {
    package?: string;
    arguments: ConfigRequireRequestArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function configRequireRequest(options: ConfigRequireRequestOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::config::Config`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'config',
        function: 'config_require_request',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}