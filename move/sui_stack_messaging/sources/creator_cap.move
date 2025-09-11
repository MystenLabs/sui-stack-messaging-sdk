module sui_stack_messaging::creator_cap;

/// Channel Creator Capability
///
/// Can act as a "super admin" for the channel.
/// Used for initializing/building the Channel.
/// Only one per channel.
/// Soul Bound - Can be transferred via custom transfer function.
public struct CreatorCap has key {
    id: UID,
    channel_id: ID,
}

/// Mint a new CreatorCap
/// This is meant to be called only when creating a new Channel.
public(package) fun mint(channel_id: ID, ctx: &mut TxContext): CreatorCap {
    CreatorCap { id: object::new(ctx), channel_id }
}

/// Transfer a CreatorCap to the transaction sender.
public fun transfer_to_sender(self: CreatorCap, ctx: &TxContext) {
    transfer::transfer(self, ctx.sender());
}

// Getters

/// Get the associated channel_id for this CreatorCap
public(package) fun channel_id(self: &CreatorCap): ID {
    self.channel_id
}
