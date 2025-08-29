/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { type Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
const $moduleName = '@local-pkg/sui-messaging::membership';
export const MembershipRegistry = new MoveStruct({ name: `${$moduleName}::MembershipRegistry`, fields: {
        id: object.UID
    } });
export interface MintOptions {
    package?: string;
    arguments?: [
    ];
    typeArguments: [
        string
    ];
}
export function mint(options: MintOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'membership',
        function: 'mint',
        typeArguments: options.typeArguments
    });
}
export interface MintAndTransferArguments {
    recipient: RawTransactionArgument<string>;
}
export interface MintAndTransferOptions {
    package?: string;
    arguments: MintAndTransferArguments | [
        recipient: RawTransactionArgument<string>
    ];
    typeArguments: [
        string
    ];
}
export function mintAndTransfer(options: MintAndTransferOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        'address'
    ] satisfies string[];
    const parameterNames = ["recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'membership',
        function: 'mint_and_transfer',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
        typeArguments: options.typeArguments
    });
}