/// Package-level Admin features:
/// Change package version
/// Change Channel object's version
/// Change limit constants
module dummy_name::admin;

// === Imports ===

// === Errors ===

// === Constants ===
const VERSION: u64 = 1;

// === Enums ===

// === Witnesses ===

/// The authorization witness.
public struct Admin has drop {}

// === Capabilities ===

// === Structs ===

// === Events ===

// === Method Aliases ===

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===
public(package) fun version(): u64 {
    VERSION
}

// === Private Functions ===

// === Test Functions ===
