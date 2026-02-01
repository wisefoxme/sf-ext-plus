import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
import {
    applyObjectPermissionsToFile,
    applyFieldPermissionsToFile
} from '../commands/permissioneditor/xmlEdit';
import type { ObjectPermissionsRecord, FieldPermissionsRecord } from '../commands/shared/types';
import { XMLParser } from 'fast-xml-parser';

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

const PARSER_OPTIONS = {
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
    isArray: (tagName: string) => tagName === 'objectPermissions' || tagName === 'fieldPermissions'
};

function parsePermissionSetXml(xml: string): Record<string, unknown> {
    const parser = new XMLParser(PARSER_OPTIONS);
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const root = parsed.PermissionSet as Record<string, unknown>;
    return root ?? parsed;
}

describe('permission editor xml edit (update vs create)', () => {
    test('applyObjectPermissionsToFile updates existing object permission entry instead of creating duplicate', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-object-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Account</object>
    </objectPermissions>
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyObjectPermissionsToFile(filePath, 'Account', {
            allowCreate: false,
            allowDelete: false,
            allowEdit: true,
            allowRead: true,
            viewAllRecords: false,
            modifyAllRecords: false
        });

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const list = Array.isArray(root.objectPermissions) ? root.objectPermissions : [root.objectPermissions];
        expect(list).toHaveLength(1);
        const entry = list[0] as Record<string, unknown>;
        expect(entry.object).toBe('Account');
        expect(entry.allowRead).toBe(true);
        expect(entry.allowEdit).toBe(true);

        fs.rmSync(tmpDir, { recursive: true });
    });

    test('applyObjectPermissionsToFile creates new object permission when none exists for object', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-object-new-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyObjectPermissionsToFile(filePath, 'Contact', {
            allowCreate: false,
            allowDelete: false,
            allowEdit: false,
            allowRead: true,
            viewAllRecords: false,
            modifyAllRecords: false
        });

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const list = Array.isArray(root.objectPermissions) ? root.objectPermissions : [root.objectPermissions];
        expect(list).toHaveLength(1);
        const entry = list[0] as Record<string, unknown>;
        expect(entry.object).toBe('Contact');
        expect(entry.allowRead).toBe(true);

        fs.rmSync(tmpDir, { recursive: true });
    });

    test('applyObjectPermissionsToFile updates one object and leaves other object entries unchanged', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-object-multi-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Account</object>
    </objectPermissions>
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Contact</object>
    </objectPermissions>
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyObjectPermissionsToFile(filePath, 'Account', {
            allowCreate: false,
            allowDelete: false,
            allowEdit: true,
            allowRead: true,
            viewAllRecords: false,
            modifyAllRecords: false
        });

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const list = Array.isArray(root.objectPermissions) ? root.objectPermissions : [root.objectPermissions];
        expect(list).toHaveLength(2);
        const accountEntry = list.find((e: Record<string, unknown>) => e.object === 'Account') as Record<string, unknown>;
        const contactEntry = list.find((e: Record<string, unknown>) => e.object === 'Contact') as Record<string, unknown>;
        expect(accountEntry).toBeDefined();
        expect(accountEntry.allowRead).toBe(true);
        expect(accountEntry.allowEdit).toBe(true);
        expect(contactEntry).toBeDefined();
        expect(contactEntry.allowRead).toBe(true);
        expect(contactEntry.allowEdit).toBeFalsy();

        fs.rmSync(tmpDir, { recursive: true });
    });

    test('applyFieldPermissionsToFile updates existing field permission entry instead of creating duplicate', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-field-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Account</object>
    </objectPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.Name</field>
        <readable>true</readable>
    </fieldPermissions>
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyFieldPermissionsToFile(
            filePath,
            'Account',
            'Account.Name',
            {
                allowCreate: false,
                allowDelete: false,
                allowEdit: false,
                allowRead: true,
                viewAllRecords: false,
                modifyAllRecords: false
            },
            { readable: true, editable: true }
        );

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const fieldList = Array.isArray(root.fieldPermissions) ? root.fieldPermissions : [root.fieldPermissions];
        expect(fieldList).toHaveLength(1);
        const entry = fieldList[0] as Record<string, unknown>;
        expect(entry.field).toBe('Account.Name');
        expect(entry.readable).toBe(true);
        expect(entry.editable).toBe(true);

        fs.rmSync(tmpDir, { recursive: true });
    });

    test('applyFieldPermissionsToFile creates new field permission when none exists for field', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-field-new-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Account</object>
    </objectPermissions>
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyFieldPermissionsToFile(
            filePath,
            'Account',
            'Account.Description',
            {
                allowCreate: false,
                allowDelete: false,
                allowEdit: false,
                allowRead: true,
                viewAllRecords: false,
                modifyAllRecords: false
            },
            { readable: true, editable: false }
        );

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const fieldList = Array.isArray(root.fieldPermissions) ? root.fieldPermissions : [root.fieldPermissions];
        expect(fieldList).toHaveLength(1);
        const entry = fieldList[0] as Record<string, unknown>;
        expect(entry.field).toBe('Account.Description');
        expect(entry.readable).toBe(true);
        expect(entry.editable).toBe(false);

        fs.rmSync(tmpDir, { recursive: true });
    });

    test('applyFieldPermissionsToFile updates one field and leaves other field entries unchanged', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm-editor-field-multi-'));
        const filePath = path.join(tmpDir, 'Test.permissionSet-meta.xml');
        const existingXml = `<?xml version="1.0" encoding="UTF-8"?>
<PermissionSet xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <allowRead>true</allowRead>
        <object>Account</object>
    </objectPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.Name</field>
        <readable>true</readable>
    </fieldPermissions>
    <fieldPermissions>
        <editable>false</editable>
        <field>Account.Description</field>
        <readable>true</readable>
    </fieldPermissions>
</PermissionSet>`;
        fs.writeFileSync(filePath, existingXml, 'utf8');

        applyFieldPermissionsToFile(
            filePath,
            'Account',
            'Account.Name',
            {
                allowCreate: false,
                allowDelete: false,
                allowEdit: false,
                allowRead: true,
                viewAllRecords: false,
                modifyAllRecords: false
            },
            { readable: true, editable: true }
        );

        const outXml = fs.readFileSync(filePath, 'utf8');
        const root = parsePermissionSetXml(outXml);
        const fieldList = Array.isArray(root.fieldPermissions) ? root.fieldPermissions : [root.fieldPermissions];
        expect(fieldList).toHaveLength(2);
        const nameEntry = fieldList.find((e: Record<string, unknown>) => e.field === 'Account.Name') as Record<string, unknown>;
        const descEntry = fieldList.find((e: Record<string, unknown>) => e.field === 'Account.Description') as Record<string, unknown>;
        expect(nameEntry).toBeDefined();
        expect(nameEntry.readable).toBe(true);
        expect(nameEntry.editable).toBe(true);
        expect(descEntry).toBeDefined();
        expect(descEntry.readable).toBe(true);
        expect(descEntry.editable).toBe(false);

        fs.rmSync(tmpDir, { recursive: true });
    });
});
