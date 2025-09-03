module sui_messaging::creator_cap;

/// Channel Creator Capability
///
/// Can act as a "super admin" for the channel.
/// Used for initializing the Channel
/// Only one per channel.
/// Can be transferred via custom transfer function.
public struct CreatorCap has key {
    id: UID,
    channel_id: ID,
}

public(package) fun mint(channel_id: ID, ctx: &mut TxContext): CreatorCap {
    CreatorCap { id: object::new(ctx), channel_id }
}

public fun transfer_to_sender(self: CreatorCap, ctx: &TxContext) {
    transfer::transfer(self, ctx.sender());
}

// Getters
public(package) fun channel_id(self: &CreatorCap): ID {
    self.channel_id
}
