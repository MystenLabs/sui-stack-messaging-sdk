module sui_messaging::seal_policies;

use sui_messaging::channel::{Channel, MemberCap};
use sui_messaging::errors;

// === Imports ===

// === Errors ===

// === Constants ===

// === Enums ===

// === Witnesses ===

// === Capabilities ===

// === Structs ===

// === Events ===

// === Method Aliases ===

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===
//////////////////////////////////////////////////////////
/// Access control
/// key format: [pkg id]::[allowlist id][random nonce]

/// All allowlisted addresses can access all IDs with the prefix of the allowlist
fun approve_internal(member_cap: &MemberCap, id: vector<u8>, channel: &Channel): bool {
    // Check if the id has the right prefix
    let namespace = channel.namespace();
    if (!is_prefix(namespace, id)) {
        return false
    };

    // Check if user is in the allowlist
    channel.is_member(member_cap)
}

entry fun seal_approve(
    id: vector<u8>,
    channel: &Channel,
    member_cap: &MemberCap,
    _ctx: &TxContext,
) {
    assert!(approve_internal(member_cap, id, channel), errors::e_seal_policies_no_access());
}

/// Returns true if `prefix` is a prefix of `word`.
fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) {
        return false
    };
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != word[i]) {
            return false
        };
        i = i + 1;
    };
    true
}

// === Test Functions ===
