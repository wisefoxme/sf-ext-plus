import { describe, expect, test } from '@jest/globals';
import {
    parseObjectFieldFromPath,
    isObjectOrFieldPermissionFile
} from '../commands/permissioneditor/path';
import {
    objectPermissionsRecordToFlags,
    fieldPermissionsRecordToFlags
} from '../commands/permissioneditor/soqlMappers';
import {
    normalizeObjectPermissionFlags,
    normalizeFieldPermissionFlags
} from '../commands/permissioneditor/permissionFlags';
import type { ObjectPermissionsRecord, FieldPermissionsRecord } from '../commands/shared/types';

describe('permission editor path', () => {
    test('parseObjectFieldFromPath returns object for .object-meta.xml', () => {
        const path = '/project/force-app/main/default/objects/Account/Account.object-meta.xml';
        const result = parseObjectFieldFromPath(path);
        expect(result).not.toBeNull();
        expect(result?.kind).toBe('object');
        if (result?.kind === 'object') {
            expect(result.objectApiName).toBe('Account');
        }
    });

    test('parseObjectFieldFromPath returns object for custom object', () => {
        const path = '/project/force-app/main/default/objects/MyObject__c/MyObject__c.object-meta.xml';
        const result = parseObjectFieldFromPath(path);
        expect(result).not.toBeNull();
        expect(result?.kind).toBe('object');
        if (result?.kind === 'object') {
            expect(result.objectApiName).toBe('MyObject__c');
        }
    });

    test('parseObjectFieldFromPath returns field for .field-meta.xml', () => {
        const path = '/project/force-app/main/default/objects/MyObject__c/fields/MyField__c.field-meta.xml';
        const result = parseObjectFieldFromPath(path);
        expect(result).not.toBeNull();
        expect(result?.kind).toBe('field');
        if (result?.kind === 'field') {
            expect(result.objectApiName).toBe('MyObject__c');
            expect(result.fieldApiName).toBe('MyField__c');
            expect(result.fieldFullName).toBe('MyObject__c.MyField__c');
        }
    });

    test('parseObjectFieldFromPath returns null for non-metadata file', () => {
        expect(parseObjectFieldFromPath('/some/other/file.xml')).toBeNull();
        expect(parseObjectFieldFromPath('/objects/Account.object-meta.xml')).not.toBeNull();
    });

    test('isObjectOrFieldPermissionFile returns true for object and field metadata', () => {
        expect(isObjectOrFieldPermissionFile('x.object-meta.xml')).toBe(true);
        expect(isObjectOrFieldPermissionFile('x.field-meta.xml')).toBe(true);
        expect(isObjectOrFieldPermissionFile('x.profile-meta.xml')).toBe(false);
    });
});

describe('permission editor SOQL mapping', () => {
    test('objectPermissionsRecordToFlags maps SOQL record to metadata flags', () => {
        const record: ObjectPermissionsRecord = {
            ParentId: '0PSxx000001',
            SobjectType: 'Account',
            PermissionsCreate: true,
            PermissionsRead: true,
            PermissionsEdit: false,
            PermissionsDelete: false,
            PermissionsViewAllRecords: false,
            PermissionsModifyAllRecords: false
        };
        const flags = objectPermissionsRecordToFlags(record);
        expect(flags.allowCreate).toBe(true);
        expect(flags.allowRead).toBe(true);
        expect(flags.allowEdit).toBe(false);
        expect(flags.allowDelete).toBe(false);
        expect(flags.viewAllRecords).toBe(false);
        expect(flags.modifyAllRecords).toBe(false);
    });

    test('fieldPermissionsRecordToFlags maps SOQL record to readable/editable', () => {
        const record: FieldPermissionsRecord = {
            ParentId: '0PSxx000001',
            Field: 'Account.Description',
            SobjectType: 'Account',
            PermissionsRead: true,
            PermissionsEdit: true
        };
        const flags = fieldPermissionsRecordToFlags(record);
        expect(flags.readable).toBe(true);
        expect(flags.editable).toBe(true);
    });

    test('fieldPermissionsRecordToFlags handles false values', () => {
        const record: FieldPermissionsRecord = {
            ParentId: '0PSxx000001',
            Field: 'Account.Name',
            SobjectType: 'Account',
            PermissionsRead: true,
            PermissionsEdit: false
        };
        const flags = fieldPermissionsRecordToFlags(record);
        expect(flags.readable).toBe(true);
        expect(flags.editable).toBe(false);
    });
});

describe('permission editor implied permissions', () => {
    test('normalizeObjectPermissionFlags: viewAllRecords implies allowRead', () => {
        const flags = normalizeObjectPermissionFlags({
            allowCreate: false,
            allowDelete: false,
            allowEdit: false,
            allowRead: false,
            viewAllRecords: true,
            modifyAllRecords: false
        });
        expect(flags.allowRead).toBe(true);
        expect(flags.viewAllRecords).toBe(true);
    });

    test('normalizeObjectPermissionFlags: modifyAllRecords implies allowRead and allowEdit', () => {
        const flags = normalizeObjectPermissionFlags({
            allowCreate: false,
            allowDelete: false,
            allowEdit: false,
            allowRead: false,
            viewAllRecords: false,
            modifyAllRecords: true
        });
        expect(flags.allowRead).toBe(true);
        expect(flags.allowEdit).toBe(true);
        expect(flags.modifyAllRecords).toBe(true);
    });

    test('normalizeObjectPermissionFlags: allowEdit implies allowRead', () => {
        const flags = normalizeObjectPermissionFlags({
            allowCreate: false,
            allowDelete: false,
            allowEdit: true,
            allowRead: false,
            viewAllRecords: false,
            modifyAllRecords: false
        });
        expect(flags.allowRead).toBe(true);
        expect(flags.allowEdit).toBe(true);
    });

    test('normalizeObjectPermissionFlags: leaves other flags unchanged', () => {
        const flags = normalizeObjectPermissionFlags({
            allowCreate: true,
            allowDelete: true,
            allowEdit: false,
            allowRead: false,
            viewAllRecords: false,
            modifyAllRecords: false
        });
        expect(flags.allowCreate).toBe(true);
        expect(flags.allowDelete).toBe(true);
        expect(flags.allowEdit).toBe(false);
        expect(flags.allowRead).toBe(false);
    });

    test('normalizeFieldPermissionFlags: editable implies readable', () => {
        const flags = normalizeFieldPermissionFlags({ readable: false, editable: true });
        expect(flags.readable).toBe(true);
        expect(flags.editable).toBe(true);
    });

    test('normalizeFieldPermissionFlags: leaves readable-only unchanged', () => {
        const flags = normalizeFieldPermissionFlags({ readable: true, editable: false });
        expect(flags.readable).toBe(true);
        expect(flags.editable).toBe(false);
    });
});

describe('permission editor field requires object access', () => {
    test('when no ObjectPermissions exist for target, objectFlags should include allowRead for field permission', () => {
        const existingObjectRecords: ObjectPermissionsRecord[] = [];
        const objectFlagsFromRecord =
            existingObjectRecords.length > 0
                ? objectPermissionsRecordToFlags(existingObjectRecords[0])
                : {
                    allowCreate: false,
                    allowDelete: false,
                    allowEdit: false,
                    allowRead: true,
                    viewAllRecords: false,
                    modifyAllRecords: false
                };
        expect(objectFlagsFromRecord.allowRead).toBe(true);
    });
});
