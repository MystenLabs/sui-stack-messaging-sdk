/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/sui-stack-messaging::attachment';
export const Attachment = new MoveStruct({ name: `${$moduleName}::Attachment`, fields: {
        blob_ref: bcs.string(),
        encrypted_metadata: bcs.vector(bcs.u8()),
        data_nonce: bcs.vector(bcs.u8()),
        metadata_nonce: bcs.vector(bcs.u8()),
        key_version: bcs.u32()
    } });
export interface NewArguments {
    blobRef: RawTransactionArgument<string>;
    encryptedMetadata: RawTransactionArgument<number[]>;
    dataNonce: RawTransactionArgument<number[]>;
    metadataNonce: RawTransactionArgument<number[]>;
    keyVersion: RawTransactionArgument<number>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        blobRef: RawTransactionArgument<string>,
        encryptedMetadata: RawTransactionArgument<number[]>,
        dataNonce: RawTransactionArgument<number[]>,
        metadataNonce: RawTransactionArgument<number[]>,
        keyVersion: RawTransactionArgument<number>
    ];
}
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        '0x0000000000000000000000000000000000000000000000000000000000000001::string::String',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>',
        'u32'
    ] satisfies string[];
    const parameterNames = ["blobRef", "encryptedMetadata", "dataNonce", "metadataNonce", "keyVersion"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'attachment',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface BlobRefArguments {
    self: RawTransactionArgument<string>;
}
export interface BlobRefOptions {
    package?: string;
    arguments: BlobRefArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function blobRef(options: BlobRefOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        `${packageAddress}::attachment::Attachment`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'attachment',
        function: 'blob_ref',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DataNonceArguments {
    self: RawTransactionArgument<string>;
}
export interface DataNonceOptions {
    package?: string;
    arguments: DataNonceArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function dataNonce(options: DataNonceOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        `${packageAddress}::attachment::Attachment`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'attachment',
        function: 'data_nonce',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}