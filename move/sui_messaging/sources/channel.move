module sui_messaging::channel;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::event::emit;
use sui::table::{Self, Table};
use sui::table_vec::{Self, TableVec};
use sui::vec_map::{Self, VecMap};
use sui_messaging::admin;
use sui_messaging::attachment::{Self, Attachment};
use sui_messaging::config::{Self, Config};
use sui_messaging::errors;
use sui_messaging::message::{Self, Message};
use sui_messaging::permissions::{Self, Role, Permission, permission_update_config};

// === Errors ===

// === Constants ===
const CREATOR_ROLE_NAME: vector<u8> = b"Creator";
const RESTRICTED_ROLE_NAME: vector<u8> = b"Restricted";

// === Enums ===
public enum Presense has copy, drop, store {
    Online,
    Offline,
}

// === Witnesses ===

// === Capabilities ===

/// Channel Creator Capability
///
/// Can act as a "super admin" for the channel.
/// Used for initializing the Channel
/// Only one per channel.
/// Can be transferred.
public struct CreatorCap has key, store {
    id: UID,
    channel_id: ID,
}

/// Channel Member Capability
///
/// Gets transferred to someone when they join the channel.
/// Can be used for retrieving conversations/channels that
/// they are a member of.
public struct MemberCap has key {
    id: UID,
    channel_id: ID,
}

// === Structs ===

/// A Shared object representing a group-communication channel.
///
/// Dynamic fields:
/// - `config: ConfigKey<C> -> C`
/// - `rotated_kek_history` keep a history of rotated keys for accessing older messages?
/// otherwise we can re-encrypted each message's DEK with the new KEK, however, since
/// this is potentially costly(need to do this for the entire history), let's give it
/// as an option. We could even provide an option for full re-encryption for cases of
/// extra sensitivity.
/// Alternatively, we can leave the responisbility of the rotated_kek_history off-chain
/// by emitting events.
public struct Channel has key {
    id: UID,
    /// The version of this object, for handling updgrades.
    version: u64, // Maybe move this to the Config, or utilize the sui::versioned module
    // Do we need to keep track of this?
    // creator_cap_id: ID,
    /// Maps custom role names(e.g. "Moderator") to `Role` structs containing
    /// a granular set of permissions.
    roles: Table<String, Role>,
    /// A table mapping `MemberCap` ids to their roles and join timestamps.
    /// We do not include the MemberInfo in the `MemberCap` because we want
    /// to be able to change permissions.
    ///
    /// We do not need to worry with burning the MemberCap, since we can simply
    /// remove the MemberCap ID from the members Table and
    /// rotate the KEK when a member is removed from the channel.
    members: Table<ID, MemberInfo>,
    // members_count: u64,
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
    /// The encrypted key encryption key (KEK) for this channel, encrypted via `Seal`.
    ///
    /// This key is required to decrypt the DEK of each message.
    wrapped_kek: vector<u8>,
    /// The version number for the KEK.
    ///
    /// This is incremented each time the key is rotated.
    kek_version: u64,
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
    role_name: String,
    joined_at_ms: u64,
    presense: Presense,
}

// === Potatos ===

/// Returned after a call to `channel::new`,
/// ensuring that the creator of the Channel
/// adds a KEK (Key Encryption Key)
public struct AddWrappedKEKPromise {
    channel_id: ID,
    creator_cap_id: ID,
}

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
public struct MessageSent has copy, drop {
    sender: address,
    timestamp_ms: u64,
}

// === Method Aliases ===
use fun df::add as UID.add;
use fun df::borrow as UID.borrow;
// use fun df::borrow_mut as UID.borrow_mut;
// use fun df::exists_ as UID.exists_;
use fun df::remove as UID.remove;
// === Public Functions ===

/// Create a new `Channel` object with
/// empty Config, Roles, messages.
/// Adds the creator as a member.
///
/// The flow is:
/// new() -> add_wrapped_kek()
///       -> (optionally set_initial_roles())
///       -> (optionally set_initial_members())
///       -> (optionally add_config())
public fun new(clock: &Clock, ctx: &mut TxContext): (Channel, CreatorCap, AddWrappedKEKPromise) {
    let channel_uid = object::new(ctx);
    let channel_id = channel_uid.to_inner();
    let mut channel = Channel {
        id: channel_uid,
        version: admin::version(),
        roles: table::new<String, Role>(ctx),
        members: table::new<ID, MemberInfo>(ctx),
        messages: table_vec::empty<Message>(ctx),
        messages_count: 0,
        last_message: option::none<Message>(),
        wrapped_kek: vector::empty(),
        kek_version: 1,
        created_at_ms: clock.timestamp_ms(),
        updated_at_ms: clock.timestamp_ms(),
    };

    // Mint CreatorCap
    let creator_cap_uid = object::new(ctx);
    let creator_cap_id = creator_cap_uid.to_inner();
    let creator_cap = CreatorCap { id: creator_cap_uid, channel_id: channel.id.to_inner() };
    // Add Creator to Channel.members and Mint&transfer a MemberCap to their address
    channel.add_creator_to_members(&creator_cap, clock, ctx);

    (
        channel,
        creator_cap,
        AddWrappedKEKPromise {
            channel_id: channel_id,
            creator_cap_id: creator_cap_id,
        },
    )
}

// Builder pattern

/// Take a Channel,
/// add default Config and default Roles,
public fun with_defaults(self: &mut Channel, creator_cap: &CreatorCap) {
    assert!(self.id.to_inner() == creator_cap.channel_id, errors::e_channel_not_creator());
    // Add default config
    self.id.add(ConfigKey<Config>(), config::default());

    // Add default Roles: Creator, Restricted
    let mut default_roles = default_roles();

    while (!default_roles.is_empty()) {
        let (name, role) = default_roles.pop();
        self.roles.add(name, role);
    };
}

/// Mandatory function to call after `channel::new`
/// We do this in 2 steps, because we want to use
/// the channel's ID for the seal-encrypted KEK.
public fun add_wrapped_kek(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    promise: AddWrappedKEKPromise,
    wrapped_kek: vector<u8>,
) {
    // Unpack promise
    let AddWrappedKEKPromise { channel_id, creator_cap_id } = promise;
    // Assert correct channel-promise
    assert!(self.id.to_inner() == channel_id, errors::e_channel_invalid_promise());
    assert!(creator_cap.id.to_inner() == creator_cap_id, errors::e_channel_not_creator());
    self.wrapped_kek = wrapped_kek;
}

public fun share(self: Channel) {
    transfer::share_object(self);
}

// Should this overwrite the defaults?
public fun with_initial_roles(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    roles: &mut VecMap<String, Role>,
) {
    assert!(self.id.to_inner() == creator_cap.channel_id, errors::e_channel_not_creator());
    while (!roles.is_empty()) {
        let (role_name, role) = roles.pop();
        self.roles.add(role_name, role);
    }
}

public fun with_initial_members(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    initial_members: &mut VecMap<address, String>, // address -> role_name
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.id.to_inner() == creator_cap.channel_id, errors::e_channel_not_creator());
    self.add_members_internal(initial_members, clock, ctx);
}

// TODO: use default/restricted role name, if not provided
public fun add_members(
    self: &mut Channel,
    member_cap: &MemberCap,
    members: &mut VecMap<address, String>, // address -> role_name
    clock: &Clock,
    ctx: &mut TxContext,
) {
    self.assert_is_member(member_cap);
    self.add_members_internal(members, clock, ctx);
}

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
    self.assert_is_member(member_cap);
    // assert has_write_permission???

    self
        .messages
        .push_back(
            message::new(
                ctx.sender(),
                ciphertext,
                wrapped_dek,
                nonce,
                self.kek_version,
                attachments,
                clock,
            ),
        );

    self.last_message =
        option::some(
            message::new(
                ctx.sender(),
                ciphertext,
                wrapped_dek,
                nonce,
                self.kek_version,
                attachments,
                clock,
            ),
        );

    // emit event
    emit(MessageSent { sender: ctx.sender(), timestamp_ms: clock.timestamp_ms() });
}

/// Attach a dynamic config object to the Channel.
public fun add_config(self: &mut Channel, member_cap: &MemberCap, config: Config) {
    self.assert_has_permission(member_cap, permission_update_config());
    assert_valid_config(&config);

    // Add a new Config
    self.id.add(ConfigKey<Config>(), config);
}

public fun return_config(
    self: &mut Channel,
    member_cap: &MemberCap,
    config: Config,
    promise: ConfigReturnPromise,
) {
    self.assert_has_permission(member_cap, permission_update_config());
    assert_valid_config(&config);

    // Burn ConfigReturnPromise
    let ConfigReturnPromise { channel_id, member_cap_id } = promise;

    assert!(self.id.to_inner() == channel_id, errors::e_channel_invalid_promise());
    assert!(member_cap.id.to_inner() == member_cap_id, errors::e_channel_not_member());

    // Add the new Config
    self.id.add(ConfigKey<Config>(), config);
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
    self.assert_has_permission(member_cap, permission_update_config());
    (
        self.id.remove(ConfigKey<Config>()),
        ConfigReturnPromise {
            channel_id: self.id.to_inner(),
            member_cap_id: member_cap.id.to_inner(),
        },
    )
}

public fun has_permission(self: &Channel, member_cap: &MemberCap, permission: Permission): bool {
    // Assert is member
    self.assert_is_member(member_cap);

    // Get member's role
    let role_name = self.members.borrow(member_cap.id.to_inner()).role_name;
    let role = self.roles.borrow(role_name);

    // Assert permission
    role.permissions().contains(&permission)
}

public fun assert_has_permission(self: &Channel, member_cap: &MemberCap, permission: Permission) {
    assert!(self.has_permission(member_cap, permission));
}

public fun default_roles(): VecMap<String, Role> {
    // Add default Roles: Creator, Restricted
    let mut roles = vec_map::empty<String, Role>();

    let creator_role_name = CREATOR_ROLE_NAME.to_string();
    let restricted_role_name = RESTRICTED_ROLE_NAME.to_string();
    roles.insert(creator_role_name, permissions::new_role(permissions::all()));
    roles.insert(restricted_role_name, permissions::new_role(permissions::empty()));
    roles
}

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// Getters
public(package) fun version(self: &Channel): u64 {
    self.version
}

public(package) fun namespace(self: &Channel): vector<u8> {
    self.id.to_bytes()
}

/// Check if a `MemberCap` id is a member of this Channel.
public(package) fun is_member(self: &Channel, member_cap: &MemberCap): bool {
    self.id.to_inner() == member_cap.channel_id &&
    self.members.contains(member_cap.id.to_inner())
}

public(package) fun restricted_role_name(): String { RESTRICTED_ROLE_NAME.to_string() }

// === Private Functions ===

/// Assert that an address is a member of this Channel.
///
/// Aborts with `errors::e_channel_not_member()` if not.
fun assert_is_member(self: &Channel, member_cap: &MemberCap) {
    assert!(self.is_member(member_cap), errors::e_channel_not_member());
}

fun assert_valid_config(config: &Config) {
    assert!(
        config.max_channel_members() <= config::max_channel_members() 
        && config.max_channel_roles() <= config::max_channel_roles()
        && config.max_message_text_chars() <= config::max_message_text_chars()
        && config.max_message_attachments() <= config::max_message_text_atachments(),
    )
}

fun add_members_internal(
    self: &mut Channel,
    members: &mut VecMap<address, String>, // address -> role_name
    clock: &Clock,
    ctx: &mut TxContext,
) {
    while (!members.is_empty()) {
        let (member_address, role_name) = members.pop();
        let member_cap = MemberCap { id: object::new(ctx), channel_id: self.id.to_inner() };

        assert!(self.roles.contains(role_name), errors::e_channel_role_does_not_exist());

        self
            .members
            .add(
                member_cap.id.to_inner(),
                MemberInfo {
                    role_name,
                    joined_at_ms: clock.timestamp_ms(),
                    presense: Presense::Offline,
                },
            );
        transfer::transfer(member_cap, member_address)
    };
}

fun add_creator_to_members(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.id.to_inner() == creator_cap.channel_id, errors::e_channel_not_creator());
    // Ensure the creator is also added as a Member
    let member_cap = MemberCap { id: object::new(ctx), channel_id: self.id.to_inner() };

    self
        .members
        .add(
            member_cap.id.to_inner(),
            MemberInfo {
                role_name: CREATOR_ROLE_NAME.to_string(),
                joined_at_ms: clock.timestamp_ms(),
                presense: Presense::Offline,
            },
        );
    transfer::transfer(member_cap, ctx.sender());
}

// === Test Functions ===
#[test_only]
use sui::test_scenario::{Self as ts};

#[test_only]
use sui::clock;
#[test]
fun test_new_with_defaults() {
    // Test addresses
    let sender_address: address = @0xa;
    let recipient_address: address = @0xb;

    let mut scenario = ts::begin(sender_address);

    let mut clock = clock::create_for_testing(scenario.ctx());
    clock.set_for_testing(1750762503);

    let wrapped_kek = b"Some key";

    // === Create a new Channel with default configuration ===
    scenario.next_tx(sender_address);
    {
        // create new channel
        let (mut channel, creator_cap, promise) = new(
            &clock,
            scenario.ctx(),
        );
        assert!(channel.id.to_inner() == creator_cap.channel_id, 0);

        // add wrapped KEK for envelop encryption (we handwave it here, should be done with seal)
        channel.add_wrapped_kek(&creator_cap, promise, wrapped_kek);

        // add defaults
        channel.with_defaults(&creator_cap);

        std::debug::print(channel.config());
        std::debug::print(&channel.roles);

        transfer::public_transfer(creator_cap, sender_address);
        channel.share();
    };

    // === Set initial roles ===
    scenario.next_tx(sender_address);
    {
        let creator_cap = scenario.take_from_sender<CreatorCap>();
        let mut channel = scenario.take_shared<Channel>();

        let mut initial_roles = vec_map::empty<String, Role>();
        initial_roles.insert(b"Admin".to_string(), permissions::new_role(permissions::all()));

        channel.with_initial_roles(&creator_cap, &mut initial_roles);

        std::debug::print(&channel.roles);

        scenario.return_to_sender<CreatorCap>(creator_cap);
        channel.share();
    };

    // === Set initial members ===
    scenario.next_tx(sender_address);
    {
        let creator_cap = scenario.take_from_sender<CreatorCap>();
        let mut channel = scenario.take_shared<Channel>();

        let mut initial_members = vec_map::empty<address, String>();
        initial_members.insert(recipient_address, b"Admin".to_string());

        channel.with_initial_members(&creator_cap, &mut initial_members, &clock, scenario.ctx());

        std::debug::print(&channel.members);

        scenario.return_to_sender<CreatorCap>(creator_cap);
        channel.share();
    };

    // === Send message to channel ===
    scenario.next_tx(sender_address);
    {
        let mut channel = scenario.take_shared<Channel>();
        let member_cap = scenario.take_from_sender<MemberCap>();
        let ciphertext = b"Some text";
        let wrapped_dek = vector[0, 1, 0, 1];
        let nonce = vector[9, 0, 9, 0];
        let n: u64 = 2;
        let mut attachments: vector<Attachment> = vector::empty();
        (n).do!(|i| {
            attachments.push_back(
                attachment::new(
                    i.to_string(),
                    vector[1, 2, 3, 4],
                    vector[5, 6, 7, 8],
                    channel.kek_version,
                    vector[9, 10, 11, 12],
                    vector[13, 14, 15, 16],
                    vector[17, 18, 19, 20],
                ),
            );
        });

        channel.send_message(
            &member_cap,
            ciphertext,
            wrapped_dek,
            nonce,
            attachments,
            &clock,
            scenario.ctx(),
        );
        std::debug::print(channel.messages.borrow(0));

        scenario.return_to_sender<MemberCap>(member_cap);
        channel.share();
    };

    clock::destroy_for_testing(clock);
    scenario.end();
}
