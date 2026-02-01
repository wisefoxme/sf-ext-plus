/**
 * Pure mappers from SOQL ObjectPermissions/FieldPermissions records to metadata flags.
 * No CLI or vscode dependencies so they can be tested without mocks.
 */
import type { ObjectPermissionsRecord, FieldPermissionsRecord } from '../shared/types';

/** Map SOQL ObjectPermissions record to metadata flags (allowCreate, etc.). */
export function objectPermissionsRecordToFlags(record: ObjectPermissionsRecord): {
    allowCreate: boolean;
    allowDelete: boolean;
    allowEdit: boolean;
    allowRead: boolean;
    viewAllRecords: boolean;
    modifyAllRecords: boolean;
} {
    return {
        allowCreate: record.PermissionsCreate === true,
        allowDelete: record.PermissionsDelete === true,
        allowEdit: record.PermissionsEdit === true,
        allowRead: record.PermissionsRead === true,
        viewAllRecords: record.PermissionsViewAllRecords === true,
        modifyAllRecords: record.PermissionsModifyAllRecords === true
    };
}

/** Map SOQL FieldPermissions record to metadata flags (readable, editable). */
export function fieldPermissionsRecordToFlags(record: FieldPermissionsRecord): { readable: boolean; editable: boolean } {
    return {
        readable: record.PermissionsRead === true,
        editable: record.PermissionsEdit === true
    };
}
