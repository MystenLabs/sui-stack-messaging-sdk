module sui_stack_messaging::channel;

use sui::clock::Clock;
use sui::table_vec::{Self, TableVec};
use sui_stack_messaging::admin;
use sui_stack_messaging::attachment::Attachment;
use sui_stack_messaging::auth::{Self, Auth};
use sui_stack_messaging::config::{Config, EditConfig};
use sui_stack_messaging::creator_cap::{Self, CreatorCap};
use sui_stack_messaging::encryption_key_history::{Self, EncryptionKeyHistory, EditEncryptionKey};
use sui_stack_messaging::member_cap::{Self, MemberCap};
use sui_stack_messaging::message::{Self, Message};

// === Constants ===
const MAX_NONCE_BYTES: u64 = 12;

// === Errors ===
const ENotCreator: u64 = 0;
const ENotMember: u64 = 1;
const ETooManyMembers: u64 = 2;
const ENoEncryptionKey: u64 = 3;
const ETextTooLarge: u64 = 4;
const ETooManyAttachments: u64 = 5;
const ENonceTooLarge: u64 = 6;

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

// === Witnesses ===

// The default, minimum Permission that is granted to initial members
public struct SimpleMessenger() has drop;

// === Potatos ===

// === Keys ===

// === Events ===

// === Method Aliases ===

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
public fun new(
    config: Option<Config>,
    clock: &Clock,
    ctx: &mut TxContext,
): (Channel, CreatorCap, MemberCap) {
    let channel_uid = object::new(ctx);
    let creator_cap = creator_cap::mint(channel_uid.to_inner(), ctx);
    let creator_member_cap = member_cap::mint(channel_uid.to_inner(), ctx);
    let creator_member_cap_id = object::id(&creator_member_cap);

    // create the initial Auth struct
    // when calling new(), we automatically add the creator on the permissions map, granting them
    // the EditPermissions() permission.
    // So at this point, the creator has the ability to grant permissions
    let mut auth = auth::new(object::id(&creator_member_cap), config, ctx);
    // Grant the default SimpleMessenger permission to the creator
    auth.grant_permission<SimpleMessenger>(creator_member_cap_id, creator_member_cap_id);
    // Grant the EditEncryptionKey permission to the creator
    auth.grant_permission<EditEncryptionKey>(creator_member_cap_id, creator_member_cap_id);
    // Grant the EditConfig permission to the creator
    auth.grant_permission<EditConfig>(creator_member_cap_id, creator_member_cap_id);

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

/// Share the Channel object
/// Note: at this point the client needs to attach an encrypted DEK
/// Otherwise, it is considered in an invalid state, and cannot be interacted with.
public fun share(self: Channel, creator_cap: &CreatorCap) {
    assert!(self.is_creator(creator_cap), ENotCreator);
    transfer::share_object(self);
}

/// Add the encrypted Channel Key (a key encrypted with Seal) to the Channel.
public fun add_encrypted_key(
    self: &mut Channel,
    member_cap: &MemberCap,
    new_encryption_key_bytes: vector<u8>,
) {
    assert!(self.is_member(member_cap), ENotMember);
    self
        .encryption_key_history
        .rotate_key(&self.auth, object::id(member_cap), new_encryption_key_bytes);
}

/// Add new members to the Channel with the default SimpleMessenger permission
public fun add_members(
    self: &mut Channel,
    member_cap: &MemberCap,
    n: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): vector<MemberCap> {
    assert!(self.is_member(member_cap), ENotMember);
    assert!(n < self.auth.config().max_channel_members(), ETooManyMembers);

    let member_cap_id = object::id(member_cap);
    let mut new_member_caps = vector::empty<MemberCap>();
    let mut i = 0;
    while (i < n) {
        let new_member_cap = member_cap::mint(object::id(self), ctx);
        let new_member_cap_id = object::id(&new_member_cap);
        self.auth.grant_permission<SimpleMessenger>(member_cap_id, new_member_cap_id);
        new_member_caps.push_back(new_member_cap);
        i = i +1;
    };

    self.updated_at_ms = clock.timestamp_ms();
    new_member_caps
}

/// Remove members from the Channel
/// TODO: should we enforce a key rotation here,
/// by asking for a new_encryption_key arg?
public fun remove_members(
    self: &mut Channel,
    member_cap: &MemberCap,
    members_to_remove: vector<ID>,
    clock: &Clock,
) {
    assert!(self.is_member(member_cap), ENotMember);
    assert!(self.encryption_key_history.has_encryption_key(), ENoEncryptionKey);
    let remover_member_cap_id = object::id(member_cap);
    members_to_remove.do!(|member_cap_id| {
        self.auth.remove_member_entry(remover_member_cap_id, member_cap_id);
    });

    self.updated_at_ms = clock.timestamp_ms();
}

/// Send a new message to the Channel
public fun send_message(
    self: &mut Channel,
    member_cap: &MemberCap,
    ciphertext: vector<u8>,
    nonce: vector<u8>,
    attachments: vector<Attachment>,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(self.is_member(member_cap), ENotMember);
    assert!(self.encryption_key_history.has_encryption_key(), ENoEncryptionKey);
    assert!(ciphertext.length() <= self.auth.config().max_message_text_chars(), ETextTooLarge);
    assert!(nonce.length() <= MAX_NONCE_BYTES, ENonceTooLarge);
    assert!(
        attachments.length() <= self.auth.config().max_message_attachments(),
        ETooManyAttachments,
    );
    let key_version = self.encryption_key_history.latest_key_version();
    let message = message::new(
        ctx.sender(),
        ciphertext,
        nonce,
        key_version,
        attachments,
        clock,
    );

    self.messages_count = self.messages_count + 1;

    if (self.auth.config().config_emit_events()) {
        message.emit_event(self.id.to_inner(), self.messages_count - 1);
    };

    self.messages.push_back(message);

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

public(package) fun latest_encryption_key_version(self: &Channel): u32 {
    self.encryption_key_history.latest_key_version()
}

public(package) fun latest_encryption_key(self: &Channel): vector<u8> {
    self.encryption_key_history.latest_key()
}

public(package) fun messages_count(self: &Channel): u64 {
    self.messages_count
}

/// Check if a `MemberCap` id is a member of this Channel.
public(package) fun is_member(self: &Channel, member_cap: &MemberCap): bool {
    object::id(self) == member_cap.channel_id() &&
    self.auth.has_permission<SimpleMessenger>(object::id(member_cap))
}

/// Check if a `CreatorCap` is the creator of this Channel.
public(package) fun is_creator(self: &Channel, creator_cap: &CreatorCap): bool {
    self.id.to_inner() == creator_cap.channel_id()
}

// === Private Functions ===
