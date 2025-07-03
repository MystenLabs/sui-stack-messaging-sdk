/// Public facing api
/// Alternatively, we could have a "module_name_api.move" per module, e.g. "channel_core.move" &
/// "channel_api.move"
/// in the "module_name_core.move" we would have only the struct + enums + events, and only
/// public(package) getters and setters, and of course public "new/mint/share" functions
/// then in the "module_name_api.move" we would have the public/entry functions that interact with
/// the structs and internally call the getters and setters
module sui_messaging::api;

use sui_messaging::channel::{Channel, MemberCap};
use sui_messaging::config::Config;

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
