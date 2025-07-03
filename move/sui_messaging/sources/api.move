/// Public facing api
/// Alternatively, we could have a "module_name_api.move" per module, e.g. "channel_core.move" &
/// "channel_api.move"
/// in the "module_name_core.move" we would have only the struct + enums + events, and only
/// public(package) getters and setters, and of course public "new/mint/share" functions
/// then in the "module_name_api.move" we would have the public/entry functions that interact with
/// the structs and internally call the getters and setters
module sui_messaging::api;

use std::string::String;
use sui::clock::Clock;
use sui::vec_map::VecMap;
use sui_messaging::attachment::Attachment;
use sui_messaging::channel::{Self, Channel, MemberCap};
use sui_messaging::config::Config;
use sui_messaging::errors;
use sui_messaging::permissions;

public fun send_message(
    self: &mut Channel,
    member_cap: &MemberCap,
    ciphertext: vector<u8>,
    wrapped_dek: vector<u8>,
    nonce: vector<u8>,
    attachments: vector<Attachment>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.is_member(member_cap), errors::e_channel_not_member());
    // assert has_write_permission???

    self.add_message_internal(ciphertext, wrapped_dek, nonce, attachments, clock, ctx);

    self.set_last_message_internal(ciphertext, wrapped_dek, nonce, attachments, clock, ctx);

    // emit event
    channel::emit_message_sent(clock, ctx);
}

// TODO: use default/restricted role name, if not provided
public fun add_members(
    self: &mut Channel,
    member_cap: &MemberCap,
    members: &mut VecMap<address, String>, // address -> role_name
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.is_member(member_cap), errors::e_channel_not_member());
    assert!(self.has_permission(member_cap, permissions::permission_add_member()));
    self.add_members_internal(members, clock, ctx);
}

public fun remove_members(
    self: &mut Channel,
    member_cap: &MemberCap,
    members_to_remove: vector<ID>, // MemberCap IDs
    clock: &Clock,
) {
    assert!(self.is_member(member_cap), errors::e_channel_not_member());
    assert!(self.has_permission(member_cap, permissions::permission_remove_member()));
    self.remove_members_internal(members_to_remove, clock);
}

/// Edit Config Helper
/// Looks like a candidate for `api.move` module
/// We could also expose separate functions for each config value
public fun edit_config(self: &mut Channel, member_cap: &MemberCap, config: Config) {
    let (_editable_config, promise) = self.remove_config_for_editing(member_cap);
    self.return_config(member_cap, config, promise);
}

// TODO: Doesn't look like we can do this on move-side, since we
// need to generate an encrypted(with seal) channel Key, and subsequently
// we need to generate an encrypted Data Encryption Key for the initial message.
// public fun new_one_to_one(
//     recipient: address,
//     initial_encrypted_text: vector<u8>,
//     clock: &Clock,
//     ctx: &mut TxContext,
// ): (Channel, AddWrappedKEKPromise) {
//     // Initialize channel object
//     let (mut channel, creator_cap, promise) = channel::new(
//         clock,
//         ctx,
//     );

//     channel.with_defaults(&creator_cap);
//     transfer::public_transfer(creator_cap, ctx.sender());
//     let mut initial_members = vec_map::empty<address, String>();
//     initial_members.insert(recipient, channel::restricted_role_name());
//     channel.with_initial_members(&creator_cap, &mut initial_members, clock, ctx);

//     // Send the initial message to the Channel
//     if (!initial_encrypted_text.is_empty()) {
//         channel.send_message(member_cap, ciphertext, wrapped_dek, nonce, attachments, clock, ctx)
//     };

//     (channel, promise)
// }
