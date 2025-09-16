module sui_stack_messaging::message;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui_stack_messaging::attachment::Attachment;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Message has drop, store {
    /// The address of the sender of this message. TODO: should we encrypt this as well?
    sender: address,
    /// The message content, encrypted with a DEK(Data Encryption Key)
    ciphertext: vector<u8>,
    /// The nonce used for the encryption of the content.
    nonce: vector<u8>,
    /// The version of the DEK(Data Encryption Key) that was used to encrypt this Message
    key_version: u32,
    /// A vector of attachments associated with this message.
    attachments: vector<Attachment>,
    /// Timestamp in milliseconds when the message was created.
    created_at_ms: u64,
}

// === Events ===

public struct MessageAddedEvent has copy, drop {
    channel_id: ID,
    message_index: u64,
    sender: address,
    ciphertext: vector<u8>,
    nonce: vector<u8>,
    key_version: u32,
    attachment_refs: vector<String>,
    attachment_nonces: vector<vector<u8>>,
    created_at_ms: u64,
}

// === Method Aliases ===

// === Public Functions ===

public fun new(
    sender: address,
    ciphertext: vector<u8>,
    nonce: vector<u8>,
    key_version: u32,
    attachments: vector<Attachment>,
    clock: &Clock,
): Message {
    Message {
        sender,
        ciphertext,
        nonce,
        key_version,
        attachments,
        created_at_ms: clock.timestamp_ms(),
    }
}

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===
public(package) fun emit_event(self: &Message, channel_id: ID, message_index: u64) {
    let event = MessageAddedEvent {
        channel_id,
        message_index,
        sender: self.sender,
        ciphertext: self.ciphertext,
        nonce: self.nonce,
        key_version: self.key_version,
        attachment_refs: self.attachments.map!(|attachment| attachment.blob_ref()),
        attachment_nonces: self.attachments.map!(|attachment| attachment.data_nonce()),
        created_at_ms: self.created_at_ms,
    };
    event::emit(event)
}

// === Private Functions ===

// === Test Functions ===
