module sui_stack_messaging::config;

// === Errors ===
const ETooManyMembers: u64 = 0;
const ETooManyRoles: u64 = 1;
const ETooManyMessageTextChars: u64 = 2;
const ETooManyMessageAttachments: u64 = 3;

// === Constants ===
const MAX_CHANNEL_MEMBERS: u64 = 10;
const MAX_CHANNEL_ROLES: u64 = 3;
const MAX_MESSAGE_TEXT_SIZE_IN_CHARS: u64 = 512;
const MAX_MESSAGE_ATTACHMENTS: u64 = 10;
const REQUIRE_INVITATION: bool = false; // ChannelAdmins cannot freely add a member, the candidate needs to accept
const REQUIRE_REQUEST: bool = false; // A user cannot freely join a channel, needs to send a request, to be added by a Channel Admin
const EMIT_EVENTS: bool = true;

// === Witnesses ===
public struct EditConfig() has drop;

// === Structs ===
public struct Config has drop, store {
    max_channel_members: u64,
    max_channel_roles: u64,
    max_message_text_chars: u64,
    max_message_attachments: u64,
    require_invitation: bool,
    require_request: bool,
    emit_events: bool,
}

// === Method Aliases ===
public use fun config_max_channel_members as Config.max_channel_members;
public use fun config_max_channel_roles as Config.max_channel_roles;
public use fun config_max_message_text_chars as Config.max_message_text_chars;
public use fun config_max_message_attachments as Config.max_message_attachments;
public use fun config_require_invitation as Config.require_invitation;
public use fun config_require_request as Config.require_request;

// === Public Functions ===
public fun default(): Config {
    Config {
        max_channel_members: MAX_CHANNEL_MEMBERS,
        max_channel_roles: MAX_CHANNEL_ROLES,
        max_message_text_chars: MAX_MESSAGE_TEXT_SIZE_IN_CHARS,
        max_message_attachments: MAX_MESSAGE_ATTACHMENTS,
        require_invitation: REQUIRE_INVITATION,
        require_request: REQUIRE_REQUEST,
        emit_events: EMIT_EVENTS,
    }
}

public fun new(
    max_channel_members: u64,
    max_channel_roles: u64,
    max_message_text_chars: u64,
    max_message_attachments: u64,
    require_invitation: bool,
    require_request: bool,
    emit_events: bool,
): Config {
    Config {
        max_channel_members,
        max_channel_roles,
        max_message_text_chars,
        max_message_attachments,
        require_invitation,
        require_request,
        emit_events,
    }
}

public fun none(): Option<Config> {
    option::none<Config>()
}

public fun is_valid_config(config: &Config): bool {
    config.max_channel_members() <= MAX_CHANNEL_MEMBERS 
        && config.max_channel_roles() <= MAX_CHANNEL_ROLES
        && config.max_message_text_chars() <= MAX_MESSAGE_TEXT_SIZE_IN_CHARS
        && config.max_message_attachments() <= MAX_MESSAGE_ATTACHMENTS
}

// === View Functions ===
public fun config_max_channel_members(self: &Config): u64 { self.max_channel_members }

public fun config_max_channel_roles(self: &Config): u64 { self.max_channel_roles }

public fun config_max_message_text_chars(self: &Config): u64 { self.max_message_text_chars }

public fun config_max_message_attachments(self: &Config): u64 { self.max_message_attachments }

public fun config_require_invitation(self: &Config): bool { self.require_invitation }

public fun config_require_request(self: &Config): bool { self.require_request }

public fun config_emit_events(self: &Config): bool { self.emit_events }

// === Package Functions ===

public(package) fun max_channel_members(): u64 { MAX_CHANNEL_MEMBERS }

public(package) fun max_channel_roles(): u64 { MAX_CHANNEL_ROLES }

public(package) fun max_message_text_chars(): u64 { MAX_MESSAGE_TEXT_SIZE_IN_CHARS }

public(package) fun max_message_text_atachments(): u64 { MAX_MESSAGE_ATTACHMENTS }

public(package) fun require_invitation(): bool { REQUIRE_INVITATION }

public(package) fun require_request(): bool { REQUIRE_REQUEST }

public(package) fun assert_is_valid_config(self: &Config) {
    assert!(self.max_channel_members <= MAX_CHANNEL_MEMBERS, ETooManyMembers);
    assert!(self.max_channel_roles <= MAX_CHANNEL_ROLES, ETooManyRoles);
    assert!(
        self.max_message_text_chars <= MAX_MESSAGE_TEXT_SIZE_IN_CHARS,
        ETooManyMessageTextChars,
    );
    assert!(self.max_message_attachments <= MAX_MESSAGE_ATTACHMENTS, ETooManyMessageAttachments);
}

// === Private Functions ===

// === Test Functions ===
