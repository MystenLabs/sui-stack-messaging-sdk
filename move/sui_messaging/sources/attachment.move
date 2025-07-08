module sui_messaging::attachment;

use std::string::String;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Attachment has copy, drop, store {
    blob_ref: String,
    wrapped_dek: vector<u8>,
    nonce: vector<u8>,
    kek_version: u64,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===
public fun new(
    blob_ref: String, // Q: should we encrypt this as well?
    wrapped_dek: vector<u8>,
    nonce: vector<u8>,
    kek_version: u64,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
): Attachment {
    Attachment {
        blob_ref,
        wrapped_dek,
        nonce,
        kek_version,
        encrypted_filename,
        encrypted_mimetype,
        encrypted_filesize,
    }
}
// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===
