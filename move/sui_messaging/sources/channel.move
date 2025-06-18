module sui_messaging::channel;

use std::string::String;
use sui::dynamic_field as df;
use sui::table::Table;
use sui::table_vec::TableVec;
use sui_messaging::message::Message;
use sui_messaging::permissions::{Role, Permission, permission_update_config};

// === Errors ===
const ENotMember: u64 = 0;

// === Constants ===

// === Enums ===

// === Witnesses ===

// === Capabilities ===

/// Channel Creator Capability
///
/// Can act as a "super admin" for the channel.
/// Only one per channel.
/// Can be transferred.
public struct CreatorCap has key, store {
    id: UID,
    channel_id: ID,
}

/// Channel Member Capability
///
/// Gets transferred to someone when they join the channel.
/// Can be used for retrieving messages.
public struct MemberCap has key {
    id: UID,
    channel_id: ID,
}

// === Structs ===

/// A Shared object representing a group-communication channel.
///
/// Dynamic fields:
/// - `config: ConfigKey<C> -> C`
public struct Channel has key {
    id: UID,
    /// The version of this object, for handling updgrades.
    version: u64,
    // Do we need to keep track of this?
    // creator_cap_id: ID,
    /// A table mapping `MemberCap` ids to their roles and join timestamps.
    /// We do not include the MemberInfo in the `MemberCap` because we want
    /// to be able to change permissions.
    ///
    /// We do not need to worry with burning the MemberCap, since we can simply
    /// rotate the envelope_key when a member is removed from the channel.
    members: Table<ID, MemberInfo>,
    /// Maps custom role names(e.g. "Moderator") to `Role` structs containing
    /// a granular set of permissions.
    roles: Table<String, Role>,
    /// The message history of the channel.
    ///
    /// Using `TableVec` to avoid the object size limit.
    messages: TableVec<Message>,
    /// The encrypted envelop key (KEK) for this channel, encrypted via `Seal`.
    ///
    /// This key is required to decrypt the DEK of each message.
    encrypted_evenlope_key: vector<u8>,
    /// The version number for the envelop key.
    ///
    /// This is incremented each time the key is rotated.
    key_version: u64,
    // /// We need a way to include custom seal policy in addition to the "MemberList" one
    // /// Probably via a dynamic field
    // policy_id: ID,
    /// The timestamp (in milliseconds) when the channel was created.
    created_at_ms: u64,
    /// The timestamp (in milliseconds) when the channel was last updated.
    /// (e.g. change in metadata, members, admins, keys)
    updated_at_ms: u64,
}

/// Information about a channel member, including their role and joint time.
public struct MemberInfo has drop, store {
    role: String,
    joined_at_ms: u64,
}

public struct Config has drop, store {
    max_channel_members: u64,
    max_message_text_chars: u64,
    max_message_attachments: u64,
}

// === Keys ===

/// Key for storing a configuration.
public struct ConfigKey<phantom Config>() has copy, drop, store;

// === Events ===

// === Method Aliases ===
use fun df::add as UID.add;
use fun df::borrow as UID.borrow;
// use fun df::borrow_mut as UID.borrow_mut;
// use fun df::exists_ as UID.exists_;
use fun df::remove as UID.remove;
// === Public Functions ===

/// Attach a dynamic config object to the Channel.
public fun add_config(
    self: &mut Channel,
    member_cap: &MemberCap,
    config: Config,
) {
    self.assert_has_permission(member_cap, permission_update_config());

    // Add a new Config
    self.id.add(ConfigKey<Config>(), config);
}

/// Borrow the dynamic config object. (Read-only)
public fun config<Config: store + drop>(self: &Channel): &Config {
    self.id.borrow(ConfigKey<Config>())
}

/// Detach the dynamic config from the Channel for editing purposes.
/// The member should then add it back.
public fun remove_config_for_editing<Config: store + drop>(
    self: &mut Channel,
    member_cap: &MemberCap,
): Config {
    self.assert_has_permission(member_cap, permission_update_config());
    self.id.remove(ConfigKey<Config>())
}

public fun has_permission(self: &Channel, member_cap: &MemberCap, permission: Permission): bool {
    // Assert is member
    self.assert_is_member(member_cap);

    // Get member's role
    let role_name = self.members.borrow(member_cap.id.to_inner()).role;
    let role = self.roles.borrow(role_name);

    // Assert permission
    role.permissions().contains(&permission)
}

public fun assert_has_permission(self: &Channel, member_cap: &MemberCap, permission: Permission) {
    assert!(self.has_permission(member_cap, permission));
}

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===
// public(package) fun new(init_members: vector<address>): Channel {

// }

// === Private Functions ===

/// Check if a `MemberCap` id is a member of this Channel.
fun is_member(self: &Channel, member_cap: &MemberCap): bool {
    self.id.to_inner() == member_cap.channel_id &&
    self.members.contains(member_cap.id.to_inner())
}

/// Assert that an address is a member of this Channel.
///
/// Aborts with `ENotMember` if not.
fun assert_is_member(self: &Channel, member_cap: &MemberCap) {
    assert!(self.is_member(member_cap), ENotMember);
}

// === Test Functions ===
