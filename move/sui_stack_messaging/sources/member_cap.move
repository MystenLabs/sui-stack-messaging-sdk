module sui_stack_messaging::member_cap;

use sui_stack_messaging::auth::{Auth, AddMemberEntry};

const EVectorsLengthMismatch: u64 = 0;
const ENotPermitted: u64 = 1;
const EWrongChannel: u64 = 2;

/// Channel Member cap
///
/// Can be used for retrieving conversations/channels that
/// they are a member of.
public struct MemberCap has key {
    id: UID,
    channel_id: ID,
}

/// Mint a new MemberCap with the specified channel_id
/// This should be callable only when adding members to a Channel
public(package) fun mint(channel_id: ID, ctx: &mut TxContext): MemberCap {
    MemberCap { id: object::new(ctx), channel_id }
}

/// Burn the MemberCap
/// This should only be callable by a channel.leave function,
/// because we don't want to arbitrarily allow people to burn their MemberCap.
/// We also want to handle any relevant tracking in the internals of the Channel object.
public(package) fun burn(cap: MemberCap) {
    let MemberCap { id, channel_id: _ } = cap;
    object::delete(id)
}

/// Transfer a MemberCap to the specified address.
/// Requires the caller to have AddMemberEntry permission.
public fun transfer_to_recipient(
    cap: MemberCap,
    auth: &Auth,
    caller_cap: &MemberCap,
    recipient: address,
) {
    assert!(cap.channel_id == caller_cap.channel_id, EWrongChannel);
    assert!(auth.has_permission<AddMemberEntry>(object::id(caller_cap)), ENotPermitted);
    transfer::transfer(cap, recipient)
}

/// Transfer MemberCaps to the associated addresses.
/// Requires the caller to have AddMemberEntry permission.
public fun transfer_member_caps(
    auth: &Auth,
    caller_cap: &MemberCap,
    member_addresses: vector<address>,
    mut member_caps: vector<MemberCap>,
) {
    assert!(member_addresses.length() == member_caps.length(), EVectorsLengthMismatch);
    assert!(auth.has_permission<AddMemberEntry>(object::id(caller_cap)), ENotPermitted);

    let mut i = 0;
    let len = member_addresses.length();
    while (i < len) {
        let member_cap = member_caps.pop_back();
        assert!(member_cap.channel_id == caller_cap.channel_id, EWrongChannel);
        transfer::transfer(member_cap, member_addresses[i]);
        i = i + 1;
    };
    member_caps.destroy_empty();
}

// Getters

public fun channel_id(self: &MemberCap): ID {
    self.channel_id
}
