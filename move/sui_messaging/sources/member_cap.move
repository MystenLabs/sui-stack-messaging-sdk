module sui_messaging::member_cap;

use sui::vec_map::VecMap;
use sui_messaging::creator_cap::CreatorCap;

const EWrongChannelCreator: u64 = 0;

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
    mut member_caps_map: VecMap<address, MemberCap>,
    creator_cap: &CreatorCap,
) {
    while (!member_caps_map.is_empty()) {
        let (member_address, member_cap) = member_caps_map.pop();
        assert!(member_cap.channel_id == creator_cap.channel_id(), EWrongChannelCreator);
        member_cap.transfer_to_recipient(creator_cap, member_address);
    };
    member_caps_map.destroy_empty();
}

// Getters

public fun channel_id(self: &MemberCap): ID {
    self.channel_id
}
