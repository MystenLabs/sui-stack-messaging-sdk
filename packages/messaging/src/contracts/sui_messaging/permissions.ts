/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * RBAC system that allows for creation of custom roles with granular permissions
 * at runtime(no need for package upgrade).
 * 
 * When a user attampts a channel action, the relevant function will perform the
 * following checks:
 * 
 * 1.  Look up the sender's `MemberInfo` in the `Channel.members` table.
 * 2.  Get the sender's role name from the `MemberInfo`.
 * 3.  Look up the `Role` struct for that role name in the `roles` table.
 * 4.  Check if the `Role.permissions` contains the required `Permission` for that
 *     action.
 */

import { MoveEnum, MoveStruct, normalizeMoveArguments, type RawTransactionArgument } from '../utils/index.js';
import { type Transaction } from '@mysten/sui/transactions';
import * as vec_set from './deps/sui/vec_set.js';
const $moduleName = '@local-pkg/sui-messaging::permissions';
/**
 * An enum representing all possible granular permissions within the scope of a
 * Channel. 2^10 = 1024 possible roles
 */
export const Permission = new MoveEnum({ name: `${$moduleName}::Permission`, fields: {
        AddMember: null,
        RemoveMember: null,
        AddRole: null,
        PromoteMember: null,
        DemoteMember: null,
        RotateKey: null,
        UpdateMetadata: null,
        UpdateConfig: null,
        DeleteMessage: null,
        PinMessage: null
    } });
export const Role = new MoveStruct({ name: `${$moduleName}::Role`, fields: {
        permissions: vec_set.VecSet(Permission)
    } });
export interface NewRoleArguments {
    permissions: RawTransactionArgument<string>;
}
export interface NewRoleOptions {
    package?: string;
    arguments: NewRoleArguments | [
        permissions: RawTransactionArgument<string>
    ];
}
export function newRole(options: NewRoleOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `0x0000000000000000000000000000000000000000000000000000000000000002::vec_set::VecSet<${packageAddress}::permissions::Permission>`
    ] satisfies string[];
    const parameterNames = ["permissions"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'new_role',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface DefaultRolesOptions {
    package?: string;
    arguments?: [
    ];
}
export function defaultRoles(options: DefaultRolesOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'default_roles',
    });
}
export interface EmptyOptions {
    package?: string;
    arguments?: [
    ];
}
export function empty(options: EmptyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'empty',
    });
}
export interface AllOptions {
    package?: string;
    arguments?: [
    ];
}
export function all(options: AllOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'all',
    });
}
export interface PermissionAddMemberOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionAddMember(options: PermissionAddMemberOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_add_member',
    });
}
export interface PermissionRemoveMemberOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionRemoveMember(options: PermissionRemoveMemberOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_remove_member',
    });
}
export interface PermissionAddRoleOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionAddRole(options: PermissionAddRoleOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_add_role',
    });
}
export interface PermissionPromoteMemberOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionPromoteMember(options: PermissionPromoteMemberOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_promote_member',
    });
}
export interface PermissionDemoteMemberOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionDemoteMember(options: PermissionDemoteMemberOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_demote_member',
    });
}
export interface PermissionRotateKeyOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionRotateKey(options: PermissionRotateKeyOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_rotate_key',
    });
}
export interface PermissionUpdateMetadataOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionUpdateMetadata(options: PermissionUpdateMetadataOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_update_metadata',
    });
}
export interface PermissionUpdateConfigOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionUpdateConfig(options: PermissionUpdateConfigOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_update_config',
    });
}
export interface PermissionDeleteMessageOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionDeleteMessage(options: PermissionDeleteMessageOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_delete_message',
    });
}
export interface PermissionPinMessageOptions {
    package?: string;
    arguments?: [
    ];
}
export function permissionPinMessage(options: PermissionPinMessageOptions = {}) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permission_pin_message',
    });
}
export interface PermissionsArguments {
    self: RawTransactionArgument<string>;
}
export interface PermissionsOptions {
    package?: string;
    arguments: PermissionsArguments | [
        self: RawTransactionArgument<string>
    ];
}
export function permissions(options: PermissionsOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::permissions::Role`
    ] satisfies string[];
    const parameterNames = ["self"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'permissions',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}
export interface HasPermissionArguments {
    self: RawTransactionArgument<string>;
    permission: RawTransactionArgument<string>;
}
export interface HasPermissionOptions {
    package?: string;
    arguments: HasPermissionArguments | [
        self: RawTransactionArgument<string>,
        permission: RawTransactionArgument<string>
    ];
}
export function hasPermission(options: HasPermissionOptions) {
    const packageAddress = options.package ?? '@local-pkg/sui-messaging';
    const argumentsTypes = [
        `${packageAddress}::permissions::Role`,
        `${packageAddress}::permissions::Permission`
    ] satisfies string[];
    const parameterNames = ["self", "permission"];
    return (tx: Transaction) => tx.moveCall({
        package: packageAddress,
        module: 'permissions',
        function: 'has_permission',
        arguments: normalizeMoveArguments(options.arguments, argumentsTypes, parameterNames),
    });
}