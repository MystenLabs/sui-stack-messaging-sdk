/// RBAC system that allows for creation of custom roles
/// with granular permissions at runtime(no need for package upgrade).
///
/// When a user attampts a channel action, the relevant function will perform the following checks:
/// 1. Look up the sender's `MemberInfo` in the `Channel.members` table.
/// 2. Get the sender's role name from the `MemberInfo`.
/// 3. Look up the `Role` struct for that role name in the `roles` table.
/// 4. Check if the `Role.permissions` contains the required `Permission` for that action.
module sui_messaging::permissions;

use std::string::String;
use sui::vec_set::{Self, VecSet};

// === Errors ===

// === Constants ===

// === Enums ===

/// An enum representing all possible granular permissions within
/// the scope of a Channel.
/// 2^10 = 1024 possible roles
public enum Permission has copy, drop, store {
    // == Member management ==
    AddMember,
    RemoveMember,
    // == Role management ==
    AddRole,
    PromoteMember,
    DemoteMember,
    // == Security management ==
    RotateKey,
    // == Channel management ==
    UpdateMetadata,
    UpdateConfig,
    // == Message management ==
    DeleteMessage,
    PinMessage,
}

// === Structs ===

/// A struct representing a custom role with a Set of permissions.
/// What if we made this a generic, so that users can use their own Permission enum?
/// e.g. Role<TPermission>
public struct Role has drop, store {
    permissions: VecSet<Permission>,
}

// === Events ===

// === Method Aliases ===

// === Public Functions ===

public fun new_role(permissions: VecSet<Permission>): Role {
    Role { permissions }
}

public fun empty(): VecSet<Permission> {
    vec_set::empty<Permission>()
}

public fun all(): VecSet<Permission> {
    let mut permissions = vec_set::empty<Permission>();
    permissions.insert(Permission::AddMember);
    permissions.insert(Permission::RemoveMember);
    permissions.insert(Permission::AddRole);
    permissions.insert(Permission::PromoteMember);
    permissions.insert(Permission::DemoteMember);
    permissions.insert(Permission::RotateKey);
    permissions.insert(Permission::UpdateConfig);
    permissions.insert(Permission::UpdateMetadata);
    permissions.insert(Permission::DeleteMessage);
    permissions.insert(Permission::PinMessage);
    permissions
}

public fun permission_add_member(): Permission {
    Permission::AddMember
}

public fun permission_remove_member(): Permission {
    Permission::RemoveMember
}

public fun permission_add_role(): Permission {
    Permission::AddRole
}

public fun permission_promote_member(): Permission {
    Permission::PromoteMember
}

public fun permission_demote_member(): Permission {
    Permission::DemoteMember
}

public fun permission_rotate_key(): Permission {
    Permission::RotateKey
}

public fun permission_update_metadata(): Permission {
    Permission::UpdateMetadata
}

public fun permission_update_config(): Permission {
    Permission::UpdateConfig
}

public fun permission_delete_message(): Permission {
    Permission::DeleteMessage
}

public fun permission_pin_message(): Permission {
    Permission::PinMessage
}

// === View Functions ===

public fun permissions(self: &Role): VecSet<Permission> {
    self.permissions
}

public fun has_permission(self: &Role, permission: Permission): bool {
    self.permissions.contains(&permission)
}

// === Admin Functions ===

// === Package Functions ===

// === Private Functions ===

// === Test Functions ===
