module sui_messaging::attachment;

use std::string::String;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Attachment has copy, drop, store {
    blob_ref: String,
    encrypted_metadata: vector<u8>,
    data_nonce: vector<u8>, // Need separate nonces, because we must not reuse a nonce when encrypting with the same key
    metadata_nonce: vector<u8>,
    key_version: u64,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===
public fun new(
    blob_ref: String,
    encrypted_metadata: vector<u8>,
    data_nonce: vector<u8>,
    metadata_nonce: vector<u8>,
    key_version: u64,
): Attachment {
    Attachment {
        blob_ref,
        encrypted_metadata,
        data_nonce,
        metadata_nonce,
        key_version,
    }
}
// === View Functions ===

public fun get_blob_ref(self: &Attachment): String {
    self.blob_ref
}

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===
