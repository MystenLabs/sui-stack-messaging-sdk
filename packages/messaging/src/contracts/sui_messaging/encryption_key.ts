/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveEnum, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/sui-messaging::encryption_key';
export const State = new MoveEnum({ name: `${$moduleName}::State`, fields: {
        Enabled: null,
        Disabled: null
    } });
export const EncryptionKey = new MoveStruct({ name: `${$moduleName}::EncryptionKey`, fields: {
        encrypted_key_bytes: bcs.vector(bcs.u8()),
        version: bcs.u32(),
        state: State
    } });
export interface NewArguments {
    encryptedKeyBytes: RawTransactionArgument<number[]>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        encryptedKeyBytes: RawTransactionArgument<number[]>
    ];
}
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        'vector<u8>'
    ] satisfies string[];
    const parameterNames = ["encryptedKeyBytes"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface VersionArguments {
    key: RawTransactionArgument<string>;
}
export interface VersionOptions {
    package?: string;
    arguments: VersionArguments | [
        key: RawTransactionArgument<string>
    ];
}
export function version(options: VersionOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::encryption_key::EncryptionKey`
    ] satisfies string[];
    const parameterNames = ["key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'version',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EncryptedKeyBytesArguments {
    key: RawTransactionArgument<string>;
}
export interface EncryptedKeyBytesOptions {
    package?: string;
    arguments: EncryptedKeyBytesArguments | [
        key: RawTransactionArgument<string>
    ];
}
export function encryptedKeyBytes(options: EncryptedKeyBytesOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::encryption_key::EncryptionKey`
    ] satisfies string[];
    const parameterNames = ["key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'encrypted_key_bytes',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsEnabledArguments {
    key: RawTransactionArgument<string>;
}
export interface IsEnabledOptions {
    package?: string;
    arguments: IsEnabledArguments | [
        key: RawTransactionArgument<string>
    ];
}
export function isEnabled(options: IsEnabledOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::encryption_key::EncryptionKey`
    ] satisfies string[];
    const parameterNames = ["key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'is_enabled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface IsDisabledArguments {
    key: RawTransactionArgument<string>;
}
export interface IsDisabledOptions {
    package?: string;
    arguments: IsDisabledArguments | [
        key: RawTransactionArgument<string>
    ];
}
export function isDisabled(options: IsDisabledOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::encryption_key::EncryptionKey`
    ] satisfies string[];
    const parameterNames = ["key"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'is_disabled',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface CreateEnabledStateOptions {
    package?: string;
    arguments?: [
    ];
}
export function createEnabledState(options: CreateEnabledStateOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'create_enabled_state',
    });
}
export interface CreateDisabledStateOptions {
    package?: string;
    arguments?: [
    ];
}
export function createDisabledState(options: CreateDisabledStateOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'encryption_key',
        function: 'create_disabled_state',
    });
}