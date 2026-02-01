/**
 * Represents a user in the org.
 */
export interface OrgUser {
    Username: string;
    Name: string;
    Id: string;
    IsFrozen: boolean;
    IsActive: boolean;
}

/**
 * Represents a query result from the CLI.
 */
export interface QueryResult<T> {
    result: {
        records: T[];
    }
    totalSize: number;
    done: boolean;
    status: number;
}

/**
 * Represents a user login in the org.
 */
export interface UserLogin {
    Id: string;
    UserId: string;
    IsFrozen: boolean;
}

// --- Permission editor (profiles & permission sets) ---

/**
 * Cached profile from org (sf data query SELECT Id, Name FROM Profile).
 */
export interface CachedProfile {
    id: string;
    name: string;
}

/**
 * Cached permission set from org (sf data query ... FROM PermissionSet WHERE IsOwnedByProfile = false).
 */
export interface CachedPermissionSet {
    id: string;
    name: string;
    label?: string;
    namespacePrefix?: string;
    isOwnedByProfile?: boolean;
}

/**
 * Permission set record used to resolve Profile Id -> PermissionSet Id for querying ObjectPermissions/FieldPermissions.
 * From: SELECT Id, ProfileId, Name FROM PermissionSet WHERE IsOwnedByProfile = true
 */
export interface ProfilePermissionSetMapping {
    Id: string;
    ProfileId: string;
    Name: string;
}

/**
 * ObjectPermissions row from SOQL (sf data query).
 * ParentId is the PermissionSet Id (or profile-backed PermissionSet Id).
 */
export interface ObjectPermissionsRecord {
    ParentId: string;
    SobjectType: string;
    PermissionsCreate: boolean;
    PermissionsRead: boolean;
    PermissionsEdit: boolean;
    PermissionsDelete: boolean;
    PermissionsViewAllRecords: boolean;
    PermissionsModifyAllRecords: boolean;
}

/**
 * FieldPermissions row from SOQL (sf data query).
 */
export interface FieldPermissionsRecord {
    ParentId: string;
    Field: string;
    SobjectType: string;
    PermissionsRead: boolean;
    PermissionsEdit: boolean;
}

/**
 * Object permission flags for metadata XML (PermissionSet/Profile objectPermissions).
 */
export interface ObjectPermissionFlags {
    allowCreate: boolean;
    allowDelete: boolean;
    allowEdit: boolean;
    allowRead: boolean;
    viewAllRecords: boolean;
    modifyAllRecords: boolean;
}

/**
 * Field permission flags for metadata XML (PermissionSet/Profile fieldPermissions).
 */
export interface FieldPermissionFlags {
    readable: boolean;
    editable: boolean;
}