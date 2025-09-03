module sui_messaging::auth;

use std::type_name::{Self, TypeName};
use sui::config::Config;
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

const ENotPermitted: u64 = 0;

public struct Auth has store {
    // TBD: member_stamp ID vs just address based on SuiNS usability
    // member_permissions: Table<ID, VecSet<TypeName>>,
    member_permissions: Table<address, VecSet<TypeName>>,
    // We want the config here, in order to check the number of members
    // confit: Config; // TODO: std::VERSIONED
}

public struct EditPermissions() has drop;

public(package) fun new(ctx: &mut TxContext): Auth {
    let permissions = vec_set::singleton(type_name::get<EditPermissions>());
    let member_permissions = table::new<address, VecSet<TypeName>>(ctx);
    member_permissions.add(ctx.sender(), permissions);
    Auth {
        member_permissions,
    }
}

public(package) fun has_permission<WPermission: drop>(self: &Auth, member: address): bool {
    self.member_permissions.borrow(member).contains(&type_name::get<WPermission>())
}

public(package) fun grant_permission<WPermission: drop>(
    self: &mut Auth,
    granter: address,
    member: address,
) {
    // assert granter can grant permissions
    assert!(self.has_permission<EditPermissions>(granter), ENotPermitted);

    self.member_permissions.borrow_mut(member).insert(type_name::get<WPermission>());
}

public(package) fun revoke_permission<WPermission: drop>(
    self: &mut Auth,
    revoker: address,
    member: address,
) {
    // assert revoker can revoke permissions
    assert!(self.has_permission<EditPermissions>(revoker), ENotPermitted);

    self.member_permissions.borrow_mut(member).remove(&type_name::get<WPermission>());
}
