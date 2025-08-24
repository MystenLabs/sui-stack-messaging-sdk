/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
const $moduleName = '@local-pkg/sui_messaging::attachment';
export const Attachment = new MoveStruct({ name: `${$moduleName}::Attachment`, fields: {
        blob_ref: bcs.string(),
        nonce: bcs.vector(bcs.u8()),
        key_version: bcs.u32(),
        encrypted_filename: bcs.vector(bcs.u8()),
        encrypted_mimetype: bcs.vector(bcs.u8()),
        encrypted_filesize: bcs.vector(bcs.u8())
    } });
export interface NewArguments {
    blobRef: RawTransactionArgument<string>;
    nonce: RawTransactionArgument<number[]>;
    keyVersion: RawTransactionArgument<number>;
    encryptedFilename: RawTransactionArgument<number[]>;
    encryptedMimetype: RawTransactionArgument<number[]>;
    encryptedFilesize: RawTransactionArgument<number[]>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        blobRef: RawTransactionArgument<string>,
        nonce: RawTransactionArgument<number[]>,
        keyVersion: RawTransactionArgument<number>,
        encryptedFilename: RawTransactionArgument<number[]>,
        encryptedMimetype: RawTransactionArgument<number[]>,
        encryptedFilesize: RawTransactionArgument<number[]>
    ];
}
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui_messaging';
    const argumentsTypes = [
        '0x0000000000000000000000000000000000000000000000000000000000000001::string::String',
        'vector<u8>',
        'u32',
        'vector<u8>',
        'vector<u8>',
        'vector<u8>'
    ] satisfies string[];
    const parameterNames = ["blobRef", "nonce", "keyVersion", "encryptedFilename", "encryptedMimetype", "encryptedFilesize"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'attachment',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}