module sui_stack_messaging::member_cap;

use sui_stack_messaging::creator_cap::CreatorCap;

const EWrongChannelCreator: u64 = 0;
const EVectorsLengthMismatch: u64 = 1;

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
/// Should only be called by a Channel Creator, after a Channel is created and shared.
public fun transfer_to_recipient(cap: MemberCap, creator_cap: &CreatorCap, recipient: address) {
    assert!(cap.channel_id == creator_cap.channel_id(), EWrongChannelCreator);
    transfer::transfer(cap, recipient)
}

/// Transfer MemberCaps to the associated addresses
/// Should only be called by a Channel Creator, after a Channel is created and shared.
public fun transfer_member_caps(
    member_addresses: vector<address>,
    mut member_caps: vector<MemberCap>,
    creator_cap: &CreatorCap,
) {
    assert!(member_addresses.length() == member_caps.length(), EVectorsLengthMismatch);
    let mut i = 0;
    let len = member_addresses.length();
    while (i < len) {
        let member_cap = member_caps.pop_back();
        assert!(member_cap.channel_id == creator_cap.channel_id(), EWrongChannelCreator);
        member_cap.transfer_to_recipient(creator_cap, member_addresses[i]);
        i = i + 1;
    };
    member_caps.destroy_empty();
}

// Getters

public fun channel_id(self: &MemberCap): ID {
    self.channel_id
}
