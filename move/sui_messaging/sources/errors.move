module sui_messaging::errors;

// === Errors ===

// Package Errors
const EPackageNotAuthorized: u64 = 0;
const EPackageWrongVersion: u64 = 1;

// Config Errors
const EConfigTooManyMembers: u64 = 100;
const EConfigTooManyRoles: u64 = 101;
const EConfigTooManyMessageTextChars: u64 = 102;
const EConfigTooManyMessageAttachments: u64 = 103;

// Channel Errors
const EChannelNotCreator: u64 = 200;
const EChannelNotMember: u64 = 201;
const EChannelRoleDoesNotExist: u64 = 202;
const EChannelInvalidPromise: u64 = 203;
const EChannelNoPermission: u64 = 204;
const EChannelTooManyMembers: u64 = 205;
const EChannelTooManyRoles: u64 = 206;

// Message Errors
const EMessageTooManyChars: u64 = 300;
const EMessageTooManyAttachments: u64 = 301;

// Attachement Errors

// Permissions Errors

// Seal Policies Errors
const ESealPoliciesNoAccess: u64 = 400;

// === Package Functions ===

public(package) fun e_package_not_authorized(): u64 { EPackageNotAuthorized }

public(package) fun e_package_wrong_version(): u64 { EPackageWrongVersion }

public(package) fun e_config_too_many_members(): u64 { EConfigTooManyMembers }

public(package) fun e_config_too_many_roles(): u64 { EConfigTooManyRoles }

public(package) fun e_config_too_many_message_text_chars(): u64 { EConfigTooManyMessageTextChars }

public(package) fun e_config_too_many_message_attachments(): u64 {
    EConfigTooManyMessageAttachments
}

public(package) fun e_channel_not_creator(): u64 { EChannelNotCreator }

public(package) fun e_channel_not_member(): u64 { EChannelNotMember }

public(package) fun e_channel_role_does_not_exist(): u64 { EChannelRoleDoesNotExist }

public(package) fun e_channel_invalid_promise(): u64 { EChannelInvalidPromise }

public(package) fun e_channel_no_permission(): u64 { EChannelNoPermission }

public(package) fun e_channel_too_many_members(): u64 { EChannelTooManyMembers }

public(package) fun e_channel_too_many_roles(): u64 { EChannelTooManyRoles }

public(package) fun e_message_too_many_chars(): u64 { EMessageTooManyChars }

public(package) fun e_message_too_many_attachments(): u64 { EMessageTooManyAttachments }

public(package) fun e_seal_policies_no_access(): u64 { ESealPoliciesNoAccess }
