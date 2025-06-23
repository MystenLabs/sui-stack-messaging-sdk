module sui_messaging::message;

use sui::clock::Clock;
use sui_messaging::attachment::Attachment;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Message has drop, store {
    sender: address,
    encrypted_text: vector<u8>,
    // wrapped_dek: vector<u8>,
    attachments: vector<Attachment>,
    created_at_ms: u64,
}

// === Events ===

// === Method Aliases ===

public fun new(
    sender: address,
    encrypted_text: vector<u8>,
    attachments: vector<Attachment>,
    clock: &Clock,
): Message {
    Message {
        sender,
        encrypted_text,
        attachments,
        created_at_ms: clock.timestamp_ms(),
    }
}

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===
