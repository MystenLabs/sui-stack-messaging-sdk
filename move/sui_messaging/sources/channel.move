module sui_messaging::channel;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::table::{Self, Table};
use sui::table_vec::{Self, TableVec};
use sui::vec_map::{Self, VecMap};
use sui::vec_set::{Self, VecSet};
use sui_messaging::admin;
use sui_messaging::attachment::Attachment;
use sui_messaging::auth::{Self, Auth};
use sui_messaging::config::{Self, Config};
use sui_messaging::creator_cap::{Self, CreatorCap};
use sui_messaging::encryption_key_history::{Self, EncryptionKeyHistory};
use sui_messaging::errors;
use sui_messaging::member_cap::{Self, MemberCap};
use sui_messaging::message::{Self, Message};
use sui_messaging::permissions::{Self, Role, Permission, permission_update_config};

// === Enums ===

// === Capabilities ===

// === Structs ===

/// A Shared object representing a group-communication channel.
public struct Channel has key {
    id: UID,
    /// The version of this object, for handling updgrades.
    version: u64, // Maybe move this to the Config, or utilize the sui::versioned module
    /// The Authorization struct, gating actions to member permissions.
    /// Note: It also, practically, keeps tracks of the members (MemberCap ID -> Permissions)
    auth: Auth,
    /// The message history of the channel.
    ///
    /// Using `TableVec` to avoid the object size limit.
    messages: TableVec<Message>,
    /// The total number of messages, for efficiency, so that we don't have to
    /// make a call to messages.length() (Maybe I am overthinking this, need to measure)
    messages_count: u64,
    /// A duplicate of the last entry of the messages TableVec,
    ///
    /// Utilize this for efficient fetching e.g. list of conversations showing
    /// the latest message and the user who sent it
    last_message: Option<Message>,
    /// The timestamp (in milliseconds) when the channel was created.
    created_at_ms: u64,
    /// The timestamp (in milliseconds) when the channel was last updated.
    /// (e.g. change in metadata, members, admins, keys)
    updated_at_ms: u64,
    /// History of Encryption keys
    ///
    /// Holds the latest key, the latest_version,
    /// and a TableVec of the historical keys
    encryption_key_history: EncryptionKeyHistory,
}

// === Potatos ===

/// Returned after a call to `channel::remove_config_for_editing`,
/// ensuring that the caller will return/reattach a Config to
/// the Channel after editing.
public struct ConfigReturnPromise {
    channel_id: ID,
    member_cap_id: ID,
}

// === Keys ===

/// Key for storing a configuration.
public struct ConfigKey<phantom TConfig>() has copy, drop, store;

// === Events ===

// === Method Aliases ===
use fun df::add as UID.add;
use fun df::borrow as UID.borrow;
use fun df::remove as UID.remove;
// === Public Functions ===

/// Create a new `Channel` object with
/// empty Config, Roles, messages.
/// Adds the creator as a member.
///
/// The flow is:
/// new() -> (optionally set initial config)
///       -> (optionally set initial members)
///       -> share()
///       -> client generate a DEK and encrypt it with Seal using the ChannelID as identity bytes
///       -> add_encrypted_key(CreatorCap)
public fun new(clock: &Clock, ctx: &mut TxContext): (Channel, CreatorCap, MemberCap) {
    let channel_uid = object::new(ctx);
    let creator_cap = creator_cap::mint(channel_uid.to_inner(), ctx);
    let creator_member_cap = member_cap::mint(channel_uid.to_inner(), ctx);

    // create the initial Auth struct
    // when calling new(), we automatically add the creator on the permissions map, granting them
    // the EditPermissions() permission.
    // So at this point, the creator can grant permissions to the initial members that can be added
    // with a "set_initial_members" call
    let auth = auth::new(object::id(&creator_member_cap), ctx);

    // create the Channel object, with an empty encryption_key_history
    // An encryption key MUST be added later on, in order for the Channel object
    // to be considered in a valid state/interactable.
    let channel = Channel {
        id: channel_uid,
        version: admin::version(),
        auth,
        messages: table_vec::empty<Message>(ctx),
        messages_count: 0,
        last_message: option::none<Message>(),
        created_at_ms: clock.timestamp_ms(),
        updated_at_ms: clock.timestamp_ms(),
        encryption_key_history: encryption_key_history::empty(ctx),
    };

    (channel, creator_cap, creator_member_cap)
}

// Setters

/// Add initial member to the Channel, with the default role.
/// Note1: the creator is already automatically added as a member, so no need to include them here.
/// Returns a VecMap mapping member addresses to their MemberCaps.
public fun set_initial_members(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    initial_members: vector<address>,
    clock: &Clock,
    ctx: &mut TxContext,
): VecMap<address, MemberCap> {
    assert!(self.id.to_inner() == creator_cap.channel_id(), errors::e_channel_not_creator());
    self.add_members_with_default_role_internal(vec_set::from_keys(initial_members), clock, ctx)
}

/// Attach a dynamic config object to the Channel.
public fun set_initial_config(self: &mut Channel, creator_cap: &CreatorCap, config: Config) {
    assert!(self.is_creator(creator_cap), errors::e_channel_not_creator());
    config::assert_is_valid_config(&config);

    // Add a new Config
    // TODO: overwrite existing config
    self.id.add(ConfigKey<Config>(), config);
}

/// Share the Channel object
/// Note: at this point the client needs to attach an encrypted DEK
/// Otherwise, it is considered in an invalid state, and cannot be interacted with.
public fun share(self: Channel, creator_cap: &CreatorCap) {
    assert!(self.is_creator(creator_cap), errors::e_channel_not_creator());
    transfer::share_object(self);
}

/// Add the encrypted Channel Key (a key encrypted with Seal) to the Channel.
///
/// This function is meant to be called only once, right after creating and sharing the Channel.
/// This is because we need the ChannelID available on the client side, to use as identity bytes
/// when encrypting the Channel's Data Encryption Key with Seal.
public fun add_encrypted_key(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    encrypted_key_bytes: vector<u8>,
) {
    assert!(self.is_creator(creator_cap), errors::e_channel_not_creator());
    self.encryption_keys.push_back(encrypted_key_bytes);
}

/// Borrow the dynamic config object. (Read-only)
public fun config(self: &Channel): &Config {
    self.id.borrow(ConfigKey<Config>())
}

/// Detach the dynamic config from the Channel for editing purposes.
/// The member should then add it back.
public fun remove_config_for_editing(
    self: &mut Channel,
    member_cap: &MemberCap,
): (Config, ConfigReturnPromise) {
    assert!(self.has_permission(member_cap, permission_update_config()));
    (
        self.id.remove(ConfigKey<Config>()),
        ConfigReturnPromise {
            channel_id: self.id.to_inner(),
            member_cap_id: member_cap.id.to_inner(),
        },
    )
}

/// Reattach a Config to the Channel after editing it.
/// Burns the `ConfigReturnPromise`.
public fun return_config(
    self: &mut Channel,
    member_cap: &MemberCap,
    config: Config,
    promise: ConfigReturnPromise,
) {
    assert!(
        self.has_permission(member_cap, permission_update_config()),
        errors::e_channel_no_permission(),
    );
    config::assert_is_valid_config(&config);

    // Burn ConfigReturnPromise
    let ConfigReturnPromise { channel_id, member_cap_id } = promise;

    assert!(self.id.to_inner() == channel_id, errors::e_channel_invalid_promise());
    assert!(member_cap.id.to_inner() == member_cap_id, errors::e_channel_not_member());

    // Add the new Config
    self.id.add(ConfigKey<Config>(), config);
}

// === View Functions ===

/// Returns a namespace for the channel to be
/// utilized by seal_policies
/// In this case we use the Channel's UID bytes
public fun namespace(self: &Channel): vector<u8> {
    self.id.to_bytes()
}

// === Package Functions ===

// Getters
public(package) fun version(self: &Channel): u64 {
    self.version
}

// The default, minimum Permission that is granted to initial members
public struct SimpleMessenger() has drop;

/// Check if a `MemberCap` id is a member of this Channel.
public(package) fun is_member(self: &Channel, member_cap: &MemberCap): bool {
    self.auth.has_permission<SimpleMessenger>(object::id(member_cap))
}

/// Check if a `CreatorCap` is the creator of this Channel.
public(package) fun is_creator(self: &Channel, creator_cap: &CreatorCap): bool {
    self.id.to_inner() == creator_cap.channel_id()
}

// Setters

public(package) fun remove_members_internal(
    self: &mut Channel,
    members_to_remove: vector<ID>, // MemberCap IDs
    clock: &Clock,
) {
    members_to_remove.do!(|member_id| {
        self
    });
    self.updated_at_ms = clock.timestamp_ms();
}

public(package) fun add_message_internal(
    self: &mut Channel,
    ciphertext: vector<u8>,
    nonce: vector<u8>,
    attachments: vector<Attachment>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let key_version = self.encryption_key_history.latest_key_version();
    self
        .messages
        .push_back(
            message::new(
                ctx.sender(),
                ciphertext,
                nonce,
                key_version,
                attachments,
                clock,
            ),
        );

    self.messages_count = self.messages_count + 1;

    self.last_message =
        option::some(
            message::new(
                ctx.sender(),
                ciphertext,
                nonce,
                key_version,
                attachments,
                clock,
            ),
        );
}

// === Private Functions ===
