module sui_messaging::member_stamp;

use sui::vec_map::VecMap;
use sui_messaging::creator_cap::CreatorCap;

const EWrongChannelCreator: u64 = 0;

/// Channel Member Stamp
///
/// Can be used for retrieving conversations/channels that
/// they are a member of.
public struct MemberStamp has key {
    id: UID,
    channel_id: ID,
}

/// Mint a new MemberStamp with the specified channel_id
/// This should be callable only when adding members to a Channel
public(package) fun mint(channel_id: ID, ctx: &mut TxContext): MemberStamp {
    MemberStamp { id: object::new(ctx), channel_id }
}

/// Burn the MemberStamp
/// This should only be callable by a channel.leave function,
/// because we don't want to arbitrarily allow people to burn their MemberStamp.
/// We also want to handle any relevant tracking in the internals of the Channel object.
public(package) fun burn(stamp: MemberStamp) {
    let MemberStamp { id, channel_id: _ } = stamp;
    object::delete(id)
}

/// Transfer a MemberStamp to the specified address.
/// Should only be called by a Channel Creator, after a Channel is created and shared.
public fun transfer_to_recipient(stamp: MemberStamp, creator_cap: &CreatorCap, recipient: address) {
    assert!(stamp.channel_id == creator_cap.channel_id(), EWrongChannelCreator);
    transfer::transfer(stamp, recipient)
}

/// Transfer MemberStamps to the associated addresses
/// Should only be called by a Channel Creator, after a Channel is created and shared.
public fun transfer_member_stamps(
    mut member_stamps_map: VecMap<address, MemberStamp>,
    creator_cap: &CreatorCap,
) {
    while (!member_stamps_map.is_empty()) {
        let (member_address, member_stamp) = member_stamps_map.pop();
        assert!(member_stamp.channel_id == creator_cap.channel_id(), EWrongChannelCreator);
        member_stamp.transfer_to_recipient(creator_cap, member_address);
    };
    member_stamps_map.destroy_empty();
}
