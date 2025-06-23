module sui_messaging::message;

// === Imports ===
use sui_messaging::attachment::Attachment;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Message has drop, store {
    sender: address,
    encrypted_text: vector<u8>,
    wrapped_dek: vector<u8>,
    attachments: vector<Attachment>,
    created_at_ms: u64,
}


// === Events ===

// === Method Aliases ===

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===