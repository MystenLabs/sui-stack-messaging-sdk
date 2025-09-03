module sui_messaging::message;

use sui::clock::Clock;
use sui_messaging::attachment::Attachment;

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

// === Private Functions ===

// === Test Functions ===
