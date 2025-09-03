/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/
import { MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
import { type Transaction } from '@mysten/sui/transactions';
import * as attachment from './attachment.js';
const $moduleName = '@local-pkg/sui-messaging::message';
export const Message = new MoveStruct({ name: `${$moduleName}::Message`, fields: {
        /** The address of the sender of this message. TODO: should we encrypt this as well? */
        sender: bcs.Address,
        /** The message content, encrypted with a DEK(Data Encryption Key) */
        ciphertext: bcs.vector(bcs.u8()),
        /** The nonce used for the encryption of the content. */
        nonce: bcs.vector(bcs.u8()),
        /**
         * The version of the DEK(Data Encryption Key) that was used to encrypt this
         * Message
         */
        key_version: bcs.u64(),
        /** A vector of attachments associated with this message. */
        attachments: bcs.vector(attachment.Attachment),
        /** Timestamp in milliseconds when the message was created. */
        created_at_ms: bcs.u64()
    } });
export const MessageAddedEvent = new MoveStruct({ name: `${$moduleName}::MessageAddedEvent`, fields: {
        channel_id: bcs.Address,
        message_index: bcs.u64(),
        sender: bcs.Address,
        ciphertext: bcs.vector(bcs.u8()),
        nonce: bcs.vector(bcs.u8()),
        key_version: bcs.u64(),
        attachment_refs: bcs.vector(bcs.string()),
        attachment_nonces: bcs.vector(bcs.vector(bcs.u8())),
        created_at_ms: bcs.u64()
    } });
export interface NewArguments {
    sender: RawTransactionArgument<string>;
    ciphertext: RawTransactionArgument<number[]>;
    nonce: RawTransactionArgument<number[]>;
    keyVersion: RawTransactionArgument<number | bigint>;
    attachments: RawTransactionArgument<string[]>;
}
export interface NewOptions {
    package?: string;
    arguments: NewArguments | [
        sender: RawTransactionArgument<string>,
        ciphertext: RawTransactionArgument<number[]>,
        nonce: RawTransactionArgument<number[]>,
        keyVersion: RawTransactionArgument<number | bigint>,
        attachments: RawTransactionArgument<string[]>
    ];
}
export function _new(options: NewOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        'address',
        'vector<u8>',
        'vector<u8>',
        'u64',
        `vector<${packageAddress}::attachment::Attachment>`,
        '0x0000000000000000000000000000000000000000000000000000000000000002::clock::Clock'
    ] satisfies string[];
    const parameterNames = ["sender", "ciphertext", "nonce", "keyVersion", "attachments", "clock"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'message',
        function: 'new',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface EmitEventArguments {
    self: RawTransactionArgument<string>;
    channelId: RawTransactionArgument<string>;
    messageIndex: RawTransactionArgument<number | bigint>;
}
export interface EmitEventOptions {
    package?: string;
    arguments: EmitEventArguments | [
        self: RawTransactionArgument<string>,
        channelId: RawTransactionArgument<string>,
        messageIndex: RawTransactionArgument<number | bigint>
    ];
}
export function emitEvent(options: EmitEventOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::message::Message`,
        '0x0000000000000000000000000000000000000000000000000000000000000002::object::ID',
        'u64'
    ] satisfies string[];
    const parameterNames = ["self", "channelId", "messageIndex"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'message',
        function: 'emit_event',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}