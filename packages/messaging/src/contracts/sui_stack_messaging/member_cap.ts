/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as object from './deps/sui/object.js';
const $moduleName = '@local-pkg/sui-stack-messaging::member_cap';
export const MemberCap = new MoveStruct({ name: `${$moduleName}::MemberCap`, fields: {
        id: object.UID,
        channel_id: bcs.Address
    } });
export interface TransferToRecipientArguments {
    cap: RawTransactionArgument<string>;
    creatorCap: RawTransactionArgument<string>;
    recipient: RawTransactionArgument<string>;
}
export interface TransferToRecipientOptions {
    package?: string;
    arguments: TransferToRecipientArguments | [
        cap: RawTransactionArgument<string>,
        creatorCap: RawTransactionArgument<string>,
        recipient: RawTransactionArgument<string>
    ];
}
/**
 * Transfer a MemberCap to the specified address. Should only be called by a
 * Channel Creator, after a Channel is created and shared.
 */
export function transferToRecipient(options: TransferToRecipientOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        `${packageAddress}::member_cap::MemberCap`,
        `${packageAddress}::creator_cap::CreatorCap`,
        'address'
    ] satisfies string[];
    const parameterNames = ["cap", "creatorCap", "recipient"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'member_cap',
        function: 'transfer_to_recipient',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface TransferMemberCapsArguments {
    memberAddresses: RawTransactionArgument<string[]>;
    memberCaps: RawTransactionArgument<string[]>;
    creatorCap: RawTransactionArgument<string>;
}
export interface TransferMemberCapsOptions {
    package?: string;
    arguments: TransferMemberCapsArguments | [
        memberAddresses: RawTransactionArgument<string[]>,
        memberCaps: RawTransactionArgument<string[]>,
        creatorCap: RawTransactionArgument<string>
    ];
}
/**
 * Transfer MemberCaps to the associated addresses Should only be called by a
 * Channel Creator, after a Channel is created and shared.
 */
export function transferMemberCaps(options: TransferMemberCapsOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        'vector<address>',
        `vector<${packageAddress}::member_cap::MemberCap>`,
        `${packageAddress}::creator_cap::CreatorCap`
    ] satisfies string[];
    const parameterNames = ["memberAddresses", "memberCaps", "creatorCap"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'member_cap',
        function: 'transfer_member_caps',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface ChannelIdArguments {
    self: RawTransactionArgument<string>;
}
export interface ChannelIdOptions {
    package?: string;
    arguments: ChannelIdArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function channelId(options: ChannelIdOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-stack-messaging';
    const argumentsTypes = [
        `${packageAddress}::member_cap::MemberCap`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'member_cap',
        function: 'channel_id',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}