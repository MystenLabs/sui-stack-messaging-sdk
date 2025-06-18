module sui_messaging::message;

// === Imports ===
use sui::display::Display;
use sui::table::Table;
use sui::table_vec::TableVec;
use sui::vec_set::VecSet;

use sui_messaging::attachment::Attachment;

// === Errors ===

// === Constants ===

// === Structs ===

public struct Message has drop, store {
    sender: address,
    encrypted_text: vector<u8>,
    wrapped_dek: vector<u8>,
    attachments: vector<Attachment>,
    timestamp_ms: u64,
}


// === Events ===

// === Method Aliases ===

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===