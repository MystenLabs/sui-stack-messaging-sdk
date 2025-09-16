/// Package-level Admin features:
/// Change package version
/// Change Channel object's version
/// Change limit constants
module sui_stack_messaging::admin;

// === Errors ===

// === Constants ===
const VERSION: u64 = 1;

// === Witnesses ===

/// The authorization witness.
public struct Admin() has drop;

// === Package Functions ===
public(package) fun version(): u64 {
    VERSION
}
