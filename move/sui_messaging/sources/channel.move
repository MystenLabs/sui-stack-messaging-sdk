module sui_messaging::channel;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::table::{Self, Table};
use sui::table_vec::{Self, TableVec};
use sui::vec_map::{Self, VecMap};
use sui_messaging::admin;
use sui_messaging::message::{Self, Message};
use sui_messaging::permissions::{Self, Role, Permission, permission_update_config};

// === Errors ===
const ENotCreator: u64 = 0;
const ENotMember: u64 = 1;
const ERoleDoesNotExist: u64 = 2;

// === Constants ===
const MAX_CHANNEL_MEMBERS: u64 = 500;
const MAX_CHANNEL_ROLES: u64 = 1024;
const MAX_MESSAGE_TEXT_SIZE_IN_CHARS: u64 = 512;
const MAX_MESSAGE_ATTACHMENTS: u64 = 10;
const REQUIRE_INVITATION: bool = false; // ChannelAdmins cannot freely add a member, the candidate needs to accept
const REQUIRE_REQUEST: bool = false; // A user cannot freely join a channel, needs to send a request, to be added by a Channel Admin

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
    /// rotate the envelope_key when a member is removed from the channel.
    members: Table<ID, MemberInfo>,
    /// The message history of the channel.
    ///
    /// Using `TableVec` to avoid the object size limit.
    messages: TableVec<Message>,
    /// A duplicate of the last entry of the messages TableVec,
    ///
    /// Utilize this for efficient fetching e.g. list of conversations showing
    /// the latest message the user who sent
    last_message: Option<Message>,
    /// The encrypted envelop key (KEK) for this channel, encrypted via `Seal`.
    ///
    /// This key is required to decrypt the DEK of each message.
    encrypted_envelope_key: vector<u8>,
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

/// An object owned by each user, holding all `channel::MemberCap`s via TTO
/// offering easy discoverability of the Channels the user is a member of
public struct Memberships has key {
    id: UID,
}

/// Information about a channel member, including their role and joint time.
public struct MemberInfo has drop, store {
    role_name: String,
    joined_at_ms: u64,
    presense: Presense,
}

public struct Config has drop, store {
    max_channel_members: u64,
    max_channel_roles: u64,
    max_message_text_chars: u64,
    max_message_attachments: u64,
    require_invitation: bool,
    require_request: bool,
}

/// Potato, returned right after new Channel creation+share
/// ensuring that the creator will add a Config to the Channel
public struct ConfigurePromise()

/// Potato, returned after a call to `channel::remove_config`,
/// ensuring that the caller will return/reattach a Config to
/// the Channel after editing.
public struct ConfigReturnPromise()

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

/// Create a new `Channel` object with an encrypted_envelope_key
/// and empty roles & members Tables, and empty messages TableVec
public fun new(
    // initial_roles: &mut VecMap<String, Role>,
    // initial_members: &mut VecMap<address, String>, // address, role_name
    encrypted_envelope_key: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Channel, CreatorCap, ConfigurePromise) {
    let channel = Channel {
        id: object::new(ctx),
        version: admin::version(),
        roles: table::new<String, Role>(ctx),
        members: table::new<ID, MemberInfo>(ctx),
        messages: table_vec::empty<Message>(ctx),
        last_message: option::none<Message>(),
        encrypted_envelope_key,
        key_version: 1,
        created_at_ms: clock.timestamp_ms(),
        updated_at_ms: clock.timestamp_ms(),
    };

    let creator_cap = CreatorCap { id: object::new(ctx), channel_id: channel.id.to_inner() };

    (channel, creator_cap, ConfigurePromise())
}

public fun new_with_defaults(
    encrypted_envelope_key: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Channel, CreatorCap) {
    let mut channel = Channel {
        id: object::new(ctx),
        version: admin::version(),
        roles: table::new<String, Role>(ctx),
        members: table::new<ID, MemberInfo>(ctx),
        messages: table_vec::empty<Message>(ctx),
        last_message: option::none<Message>(),
        encrypted_envelope_key,
        key_version: 1,
        created_at_ms: clock.timestamp_ms(),
        updated_at_ms: clock.timestamp_ms(),
    };

    channel.id.add(ConfigKey<Config>(), default_config());

    let creator_cap = CreatorCap { id: object::new(ctx), channel_id: channel.id.to_inner() };

    (channel, creator_cap)
}

// #[allow(lint(self_transfer))]
// public fun keep_creator_cap(cap: CreatorCap, ctx: &mut TxContext) {
//     transfer::transfer(cap, ctx.sender());
// }

public fun share(self: Channel) {
    transfer::share_object(self);
}

public fun set_initial_roles(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    roles: &mut VecMap<String, Role>,
) {
    assert!(self.id.to_inner() == creator_cap.channel_id, ENotCreator);
    while (!roles.is_empty()) {
        let (role_name, role) = roles.pop();
        self.roles.add(role_name, role);
    }
}

public fun set_initial_members(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    initial_members: &mut VecMap<address, String>, // address -> role_name
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(self.id.to_inner() == creator_cap.channel_id, ENotCreator);
    while (!initial_members.is_empty()) {
        let (member_address, role_name) = initial_members.pop();
        let member_cap = MemberCap { id: object::new(ctx), channel_id: self.id.to_inner() };

        assert!(self.roles.contains(role_name), ERoleDoesNotExist);

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
    // Ensure the creator is also added as a Member
    if (!initial_members.contains(&ctx.sender())) {
        let member_cap = MemberCap { id: object::new(ctx), channel_id: self.id.to_inner() };

        let creator_role_name = b"Creator".to_string();
        self.roles.add(creator_role_name, permissions::new_role(permissions::all()));

        self
            .members
            .add(
                member_cap.id.to_inner(),
                MemberInfo {
                    role_name: creator_role_name,
                    joined_at_ms: clock.timestamp_ms(),
                    presense: Presense::Offline,
                },
            );
        transfer::transfer(member_cap, ctx.sender());
    };
}

// TODO: Cannot add initial entries in Tables before sharing the object
// we need to create an empty one, share it, and then modify it
public fun new_one_to_one(
    recipient: address,
    encrypted_envelope_key: vector<u8>,
    initial_encrypted_text: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): Channel {
    // Initialize channel object
    let mut channel = Channel {
        id: object::new(ctx),
        version: admin::version(),
        members: table::new<ID, MemberInfo>(ctx), // Could use VecMap instead, since we limit it anyway
        roles: table::new<String, Role>(ctx), // Could use VecMap instead, since we limit it anyway
        messages: table_vec::empty(ctx),
        last_message: option::none(),
        encrypted_envelope_key,
        key_version: 1,
        created_at_ms: clock.timestamp_ms(),
        updated_at_ms: clock.timestamp_ms(),
    };

    // Create the MemberCaps
    let member_cap_sender = MemberCap { id: object::new(ctx), channel_id: channel.id.to_inner() };
    let member_cap_recipient = MemberCap {
        id: object::new(ctx),
        channel_id: channel.id.to_inner(),
    };

    // Create and add Default 1-2-1 Roles to the Channel
    // Sender has all permissions | Recipient has no permissions
    let role_sender_key = b"Sender".to_string();
    let role_sender_val = permissions::new_role(permissions::all());

    let role_recipient_key = b"Recipient".to_string();
    let role_recipient_val = permissions::new_role(permissions::empty());

    channel.roles.add(role_sender_key, role_sender_val);
    channel.roles.add(role_recipient_key, role_recipient_val);

    // Add the 2 Members to the Channel
    channel
        .members
        .add(
            member_cap_sender.id.to_inner(),
            MemberInfo {
                role_name: role_sender_key,
                joined_at_ms: clock.timestamp_ms(),
                presense: Presense::Online,
            },
        );

    channel
        .members
        .add(
            member_cap_sender.id.to_inner(),
            MemberInfo {
                role_name: role_recipient_key,
                joined_at_ms: clock.timestamp_ms(),
                presense: Presense::Online,
            },
        );

    // Send the initial message to the Channel
    if (!initial_encrypted_text.is_empty()) {
        channel
            .messages
            .push_back(
                message::new(
                    ctx.sender(),
                    initial_encrypted_text,
                    vector::empty(),
                    clock,
                ),
            );

        channel.last_message =
            option::some(
                message::new(
                    ctx.sender(),
                    initial_encrypted_text,
                    vector::empty(),
                    clock,
                ),
            );
    };
    transfer::transfer(member_cap_sender, ctx.sender());
    transfer::transfer(member_cap_recipient, recipient);

    channel
}

public fun send_message(
    self: &mut Channel,
    member_cap: &MemberCap,
    encrypted_text: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    self.assert_is_member(member_cap);
    // assert has_write_permission???
    self.messages.push_back(message::new(ctx.sender(), encrypted_text, vector::empty(), clock))
}

public fun fulfill_configure_promise(
    self: &mut Channel,
    creator_cap: &CreatorCap,
    promise: ConfigurePromise,
    config: Config,
) {
    // Assert creator of channel
    assert!(self.id.to_inner() == creator_cap.channel_id, ENotCreator);
    // Burn the ConfigurePromise
    let ConfigurePromise() = promise;
    // Attach the Config to the Channel
    self.id.add(ConfigKey<Config>(), config);
}

/// Attach a dynamic config object to the Channel.
public fun add_config(self: &mut Channel, member_cap: &MemberCap, config: Config) {
    self.assert_has_permission(member_cap, permission_update_config());

    // Add a new Config
    self.id.add(ConfigKey<Config>(), config);
}

public fun add_config_with_promise(
    self: &mut Channel,
    member_cap: &MemberCap,
    config: Config,
    promise: ConfigReturnPromise,
) {
    self.assert_has_permission(member_cap, permission_update_config());

    // Burn ConfigReturnPromise
    let ConfigReturnPromise() = promise;

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
    (self.id.remove(ConfigKey<Config>()), ConfigReturnPromise())
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

// Maybe create a separate sui_messaging::config module
public fun default_config(): Config {
    Config {
        max_channel_members: MAX_CHANNEL_MEMBERS,
        max_channel_roles: MAX_CHANNEL_ROLES,
        max_message_text_chars: MAX_MESSAGE_TEXT_SIZE_IN_CHARS,
        max_message_attachments: MAX_MESSAGE_ATTACHMENTS,
        require_invitation: REQUIRE_INVITATION,
        require_request: REQUIRE_REQUEST,
    }
}

public fun new_config(
    max_channel_members: u64,
    max_channel_roles: u64,
    max_message_text_chars: u64,
    max_message_attachments: u64,
    require_invitation: bool,
    require_request: bool,
): Config {
    Config {
        max_channel_members,
        max_channel_roles,
        max_message_text_chars,
        max_message_attachments,
        require_invitation,
        require_request,
    }
}

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

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

fun assert_valid_config(config: &Config) {
    assert!(
        config.max_channel_members <= MAX_CHANNEL_MEMBERS
        && config.max_message_text_chars <= MAX_MESSAGE_TEXT_SIZE_IN_CHARS
        && config.max_message_attachments <= MAX_MESSAGE_ATTACHMENTS,
    )
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

    let encrypted_envelope_key = b"Some key";

    // === Create a new Channel with default configuration ===
    scenario.next_tx(sender_address);
    {
        let (channel, creator_cap) = new_with_defaults(
            encrypted_envelope_key,
            &clock,
            scenario.ctx(),
        );
        assert!(channel.id.to_inner() == creator_cap.channel_id, 0);
        std::debug::print(channel.config());
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

        channel.set_initial_roles(&creator_cap, &mut initial_roles);

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

        channel.set_initial_members(&creator_cap, &mut initial_members, &clock, scenario.ctx());

        std::debug::print(&channel.members);

        scenario.return_to_sender<CreatorCap>(creator_cap);
        channel.share();
    };

    // === Send message to channel ===
    scenario.next_tx(sender_address);
    {
        let mut channel = scenario.take_shared<Channel>();
        let member_cap = scenario.take_from_sender<MemberCap>();
        let encrypted_text = b"Some text";

        channel.send_message(&member_cap, encrypted_text, &clock, scenario.ctx());
        std::debug::print(channel.messages.borrow(0));

        scenario.return_to_sender<MemberCap>(member_cap);
        channel.share();
    };

    clock::destroy_for_testing(clock);
    scenario.end();
}

// #[test]
// fun test_new_one_to_one_share_send_message_e2e() {
//     use std::string;
//     use sui::clock::{Self, Clock};
//     use sui::test_scenario::{Self as ts, Scenario};
//     use sui::test_utils;
//     use sui_messaging::channel::{Self, Channel, MemberCap};

//     // Test addresses
//     let sender_address: address = @0xa;
//     let recipient_address: address = @0xb;

//     let mut scenario = ts::begin(sender_address);
//     let ctx = scenario.ctx();

//     // Create a clock for timestamps
//     let mut clock = clock::create_for_testing(ctx);
//     clock.set_for_testing(1000); // Set initial timestamp

//     // Test data
//     let encrypted_envelope_key = b"test_envelope_key_12345678901234567890";
//     let initial_encrypted_text = b"Hello, this is the initial message!";
//     let second_message_text = b"This is a follow-up message.";

//     // === Step 1: Create one-to-one channel ===
//     scenario.next_tx(sender_address);
//     {
//         let channel = channel::new_one_to_one(
//             recipient_address,
//             encrypted_envelope_key,
//             initial_encrypted_text,
//             &clock,
//             scenario.ctx(),
//         );

//         // Share the channel
//         channel::share(channel);
//     };

//     // === Step 2: Verify sender received MemberCap ===
//     scenario.next_tx(sender_address);
//     {
//         let sender_member_cap = scenario.take_from_sender<MemberCap>();

//         // Verify the MemberCap belongs to the correct channel
//         let mut shared_channel = scenario.take_shared<Channel>();

//         // Test that sender can send a message
//         channel::send_message(
//             &mut shared_channel,
//             &sender_member_cap,
//             second_message_text,
//             &clock,
//             scenario.ctx(),
//         );

//         // Return objects
//         scenario.return_to_sender(sender_member_cap);
//         ts::return_shared(shared_channel);
//     };

//     // === Step 3: Verify recipient received MemberCap ===
//     scenario.next_tx(recipient_address);
//     {
//         let recipient_member_cap = scenario.take_from_sender<MemberCap>();

//         // Verify the recipient's MemberCap
//         let shared_channel = scenario.take_shared<Channel>();

//         // Test that recipient can also send a message (if they have permissions)
//         // Note: Based on the code, recipient has empty permissions by default
//         // So this might fail - we'll test the permission system

//         // Return objects
//         scenario.return_to_sender(recipient_member_cap);
//         ts::return_shared(shared_channel);
//     };

//     // === Step 4: Verify channel state ===
//     scenario.next_tx(sender_address);
//     {
//         let shared_channel = scenario.take_shared<Channel>();

//         // Channel should exist and be accessible
//         // In a real test, we'd verify message count, members, etc.
//         // but since most fields are private, we rely on the fact that
//         // operations completed successfully

//         ts::return_shared(shared_channel);
//     };

//     // Clean up
//     clock.destroy_for_testing();
//     scenario.end();
// }
