module sui_stack_messaging::seal_policies;

use sui_stack_messaging::channel::Channel;
use sui_stack_messaging::member_cap::MemberCap;

// === Errors ===
const ENoAccess: u64 = 0;

// === Package Functions ===
//////////////////////////////////////////////////////////
/// Access control
/// key format: [pkg id]::[creator's address][random nonce]

/// All allowlisted addresses can access all IDs with the prefix of the allowlist
fun approve_internal(member_cap: &MemberCap, id: vector<u8>, channel: &Channel): bool {
    // Check identity bytes
    let key_id = compute_key_id(channel.creator(), channel.latest_encryption_key_nonce());
    if (key_id != id) {
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
    assert!(approve_internal(member_cap, id, channel), ENoAccess);
}

/// The encryption key id is [pkg id][creator address][random nonce]
/// - The creator address is used to ensure that only the creator can create an object for that key
/// id
///   (otherwise, others can try to frontrun and create an object for the same key id).
/// - A single user can create unlimited number of key ids, simply by using different nonces.
fun compute_key_id(sender: address, nonce: vector<u8>): vector<u8> {
    let mut key_id = sender.to_bytes();
    key_id.append(nonce);
    key_id
}
