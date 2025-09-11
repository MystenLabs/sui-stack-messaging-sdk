/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
const $moduleName = '@local-pkg/sui-stack-messaging::creator_cap';
export const CreatorCap = new MoveStruct({ name: `${$moduleName}::CreatorCap`, fields: {
        id: object.UID,
        channel_id: bcs.Address
    } });
export interface TransferToSenderArguments {
    self: RawTransactionArgument<string>;
}
export interface TransferToSenderOptions {
    package?: string;
    arguments: TransferToSenderArguments | [
        self: RawTransactionArgument<string>
    ];
}
/** Transfer a CreatorCap to the transaction sender. */
export function transferToSender(options: TransferToSenderOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        `${packageAddress}::creator_cap::CreatorCap`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'creator_cap',
        function: 'transfer_to_sender',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}