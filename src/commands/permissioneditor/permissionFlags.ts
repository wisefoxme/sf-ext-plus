/**
 * Normalize object/field permission flags so that higher access levels imply lower ones
 * before inserting or updating metadata (Salesforce requires implied permissions to be set).
 *
 * Object: View All Records implies Read; Modify All Records implies Read and Edit; Edit implies Read.
 * Field: Edit implies Read.
 */
import type { ObjectPermissionFlags, FieldPermissionFlags } from '../shared/types';

/**
 * Returns object permission flags with implied permissions set.
 * - viewAllRecords → allowRead
 * - modifyAllRecords → allowRead, allowEdit
 * - allowEdit → allowRead
 */
export function normalizeObjectPermissionFlags(flags: ObjectPermissionFlags): ObjectPermissionFlags {
    const out: ObjectPermissionFlags = { ...flags };
    if (out.modifyAllRecords) {
        out.allowRead = true;
        out.allowEdit = true;
    }
    if (out.viewAllRecords) {
        out.allowRead = true;
    }
    if (out.allowEdit) {
        out.allowRead = true;
    }
    return out;
}

/**
 * Returns field permission flags with implied permissions set.
 * - editable → readable
 */
export function normalizeFieldPermissionFlags(flags: FieldPermissionFlags): FieldPermissionFlags {
    const out: FieldPermissionFlags = { ...flags };
    if (out.editable) {
        out.readable = true;
    }
    return out;
}
