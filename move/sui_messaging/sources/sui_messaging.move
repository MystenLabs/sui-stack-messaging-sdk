module sui_messaging::sui_messaging;

// === Imports ===
use std::string::{Self, String};
use sui::table::Table;
use sui::table_vec::TableVec;
use sui::vec_set::VecSet;

// === Errors ===
const ENotPackageAdmin: u64 = 0;
const ENotChannelAdmin: u64 = 1;
const ENotChannelMember: u64 = 2;

// === Constants ===
const MAX_CHANNEL_MEMBERS: u16 = 500;
const MAX_CHANNEL_ADMINS: u16 = 25;
const MAX_MESSAGE_TEXT_SIZE_IN_CHARS: u16 = 512;
const MAX_MESSAGE_TEXT_SIZE_IN_BYTES: u16 = 1024;

// === Enums ===


// === Capabilities ===

/// Cap for package-level administration
public struct AdminCap has key {
    id: UID
}

public struct ChannelCreatorCap has key {
    id: UID,
    channel_id: ID
}

public struct ChannelAdminCap has key {
    id: UID,
    channel_id: ID,
    permissions: AdminPermissions
}

/// Soulbound Cap, use for fetching conversations
public struct ChannelMemberCap<phantom TChannel> has key {
    id: UID,
    channel_id: ID
}

// Potential for extensibility here --> make it some sort of generic or add this kind of config via df
public struct AdminPermissions has store {
    can_add: bool,
    can_remove: bool,
    can_promote: bool,
    can_demote: bool,
    can_update_metadata: bool,
    can_update_policies: bool
}

// === Core Objects ===

// Do we want a ChannelRegistry? IMO no 

/// Shared Channel object, tracking a chat group.
public struct Channel has key {
    id: UID,
    name: String, // what about SuiNS ? // should we encrypt this as well? Should this be part of the metadata/Display?
    // metadata: Table<String, String>, // ??? maybe use a generic instead? --> better just do the Display, add is as dynamic object field, so that others can modify in the future
    creator_cap_id: ID, // Should this be Soulbound? 
    members: VecSet<address>, // Should this be a VecSet<ChannelMemberCap's ID> ? | enforce a max on the package-level, but allow the configuration of lower number
    admins: VecSet<address>, // Maybe create and keep ChannelAdminCap IDs, instead of plain addresses | again, enforce max number
    messages: TableVec<Message>,
    msg_count: u64,
    encrypted_envelop_key: vector<u8>, // Rotate when needed: e.g. user blocked, etc etc, Emit event when channel key is rotated, so users can decrypt previous messages // TBD save old keys?
    // custom_seal_policies_package: 
    created_at_ms: u64,
    updated_at_ms: u64 // updated metadata, members, admins, envelop_key
}
// Table key ids are deterministic, there is a way to get a specific range

// IDEA: when changing members or admins, call a "migrate" function where we create a new Channel, transfer the message_history Table and delete the old Channel
// what about the older messages, and the previous vs rotated key? Are Events enough?
// TBD: Envelop Vs the above, for e.g. removing a member


// pad text content as well
// ??? Maybe have this as owned object by sender, for easier delete/edit etc ??
public struct Message has drop, store {
    sender: address, 
    encrypted_text: vector<u8>, // encrypted text payload
    attachments: vector<AttachmentPointer>,
    encrypted_labels: vector<vector<u8>>, 
    // seal_identity: vector<u8> ???
    created_at_ms: u64,
    last_edited_at_ms: Option<u64>
}

public struct AttachmentPointer has drop, store {
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_size_in_bytes: vector<u8>, // will need to pad the payload, because seal encryption doesnt hide that info
    // blob_CID: String, // or maybe encrypt this as well, 
    // storage_type: String // Walrus
    // seal_identity / nonce ???
}

// === Events ===

// === Method Aliases ===

// === Init ===

// === Public Functions ===

// === View Functions ===

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===

/*

Spam handling? —> Block user? what about 1-1? Should there be a request when someone wants to add you? and I guess the request could also contain an initial message?

Channel administration —> AdminPermissions? 

Extensibility

provide seal primitives with all common cases?:

the basic case is the "is channel member" --> WhiteList
We should add the ability to customize the seal identity, to enable other cases, instead of just Being a channel member


token gated --> FT or NFT 
time_gated --> 

Configurability

*/

/*
Nikos-T:

public struct Message has key, store {
    id: UID,
    sender: address, // should we also create some sort of UserProfile object?
    encrypted_text: Option<vector<u8>>, // encrypted text payload
    attachments: vector<AttachmentPointer>,
    // seal_identity: vector<u8> ???
    created_at_ms: u64,
    last_edited_at_ms: Option<u64>
}
df: LInk to data
key -> value
WalrusBlobId() -> ID
HttpLink() -> String

public struct AttachmentPointer has store {
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_size_in_bytes: vector<u8>, // will need to pad the payload, because seal encryption doesnt hide that info
    get_url: String,
    //blob_CID: u256, // or maybe encrypt this as well,
    // seal_identity / nonce ???
    attachment_key: TypeName()
}

()
Attachment<C> {
    encrypted_filename: vector<u8>,
    encrypted_mimetype: vector<u8>,
    encrypted_size_in_bytes: vector<u8>, // will need to pad the payload, because seal encryption doesnt hide that info
    get_url: String,
}

add_attachment<C>(self: &mut Message, config: C) {

    df::add<AttachmentKey, Attachment<C>>(self, AttachmentKey(), config)

}

/ChannelID/MessageID/attachmentId

Config {
    channel_id,
    message_id,
    attachment_id
}


*/
