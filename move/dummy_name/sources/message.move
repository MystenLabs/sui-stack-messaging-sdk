module dummy_name::message;

use dummy_name::attachment::Attachment;
use sui::clock::Clock;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Message has drop, store {
    sender: address,
    /// The message content, encrypted with a DEK
    ciphertext: vector<u8>,
    /// The DEK for this message, wrapped(encrypted) by the channel's KEK.
    wrapped_dek: vector<u8>,
    /// The nonce used for the encryption of the content.
    nonce: vector<u8>,
    /// The version of the channel KEK that was used to wrap the `wrapped_dek`
    kek_version: u64,
    /// A vector of attachments associated with this message.
    attachments: vector<Attachment>,
    created_at_ms: u64,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===

public fun new(
    sender: address,
    ciphertext: vector<u8>,
    wrapped_dek: vector<u8>,
    nonce: vector<u8>,
    kek_version: u64,
    attachments: vector<Attachment>,
    clock: &Clock,
): Message {
    Message {
        sender,
        ciphertext,
        wrapped_dek,
        nonce,
        kek_version,
        attachments,
        created_at_ms: clock.timestamp_ms(),
    }
}

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===
