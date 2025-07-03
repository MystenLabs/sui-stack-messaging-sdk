module sui_messaging::membership;

// TODO: implement logic for adding/removing MemberCaps

/// An object owned by each user, holding all `channel::MemberCap`s via TTO
/// offering easy discoverability of the Channels the user is a member of
///
/// You can, for example, mint and transfer this to a user, when they register
/// with the chat-app.
/// Using the TTO pattern, to have all MemberCaps under this, would avoid
/// polluting the user's Wallet.
/// However, it might affect performance: We have to fetch this MembershipRegistry,
/// and then fetch the MemberCaps under this MemberRegistry, in order to list
/// the user's "conversations".
///
/// phantom T for differentiating among chat-apps ??
public struct MembershipRegistry<phantom T> has key {
    id: UID,
}

// When user Registers with the chat-app, send them one of these
public fun mint_membership_registry<T>(ctx: &mut TxContext): MembershipRegistry<T> {
    MembershipRegistry<T> {
        id: object::new(ctx),
    }
}

public fun mint_and_transfer_membershp_regisitry<T>(recipient: address, ctx: &mut TxContext) {
    transfer::transfer(mint_membership_registry<T>(ctx), recipient);
}
