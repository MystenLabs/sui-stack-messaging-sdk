module sui_messaging::attachment;

use std::string::String;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Attachment has drop, store {
    blob_ref: String,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
    // /// The unique DEK for this attachment, wrapped with the channel's KEK.
    // /// Each attachment gets its own DEK for cryptographic hygiene.
    // wrapped_dek: vector<u8>,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===
public fun new(
    blob_ref: String,
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_filesize: vector<u8>,
): Attachment {
    Attachment {
        blob_ref,
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
