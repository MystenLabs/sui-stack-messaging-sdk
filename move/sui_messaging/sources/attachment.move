module sui_messaging::attachment;

use std::string::String;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Attachment has copy, drop, store {
    blob_ref: String,
    nonce: vector<u8>,
    key_version: u64,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===
public fun new(
    blob_ref: String,
    nonce: vector<u8>,
    key_version: u64,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
): Attachment {
    Attachment {
        blob_ref,
        nonce,
        key_version,
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
