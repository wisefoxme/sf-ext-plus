import { describe, expect, test } from '@jest/globals';
import { getPermissionSetMetadataFileUrisToDelete } from '../commands/permsets/deleteMetadataFilter';

function uriWithFsPath(fsPath: string): { fsPath: string } {
    return { fsPath };
}

describe('getPermissionSetMetadataFileUrisToDelete', () => {
    test('returns empty when no URIs are passed', () => {
        const result = getPermissionSetMetadataFileUrisToDelete([], 'MyPermSet');
        expect(result).toHaveLength(0);
    });

    test('returns empty when no filename matches the permission set name', () => {
        const uris = [
            uriWithFsPath('/project/force-app/OtherSet.permissionSet-meta.xml'),
            uriWithFsPath('/project/force-app/Another.permissionSet-meta.xml')
        ];
        const result = getPermissionSetMetadataFileUrisToDelete(uris, 'MyPermSet');
        expect(result).toHaveLength(0);
    });

    test('returns the URI when one file matches the permission set name', () => {
        const match = uriWithFsPath('/project/force-app/main/default/permissions/MyPermSet.permissionSet-meta.xml');
        const uris = [
            uriWithFsPath('/project/force-app/OtherSet.permissionSet-meta.xml'),
            match
        ];
        const result = getPermissionSetMetadataFileUrisToDelete(uris, 'MyPermSet');
        expect(result).toHaveLength(1);
        expect(result[0].fsPath).toBe(match.fsPath);
    });

    test('returns all matching URIs when multiple files match (same name in different folders)', () => {
        const match1 = uriWithFsPath('/project/force-app/main/default/permissions/MyPermSet.permissionSet-meta.xml');
        const match2 = uriWithFsPath('/project/force-app/other/default/permissions/MyPermSet.permissionSet-meta.xml');
        const uris = [match1, uriWithFsPath('/project/OtherSet.permissionSet-meta.xml'), match2];
        const result = getPermissionSetMetadataFileUrisToDelete(uris, 'MyPermSet');
        expect(result).toHaveLength(2);
        expect(result.map((u) => u.fsPath)).toContain(match1.fsPath);
        expect(result.map((u) => u.fsPath)).toContain(match2.fsPath);
    });

    test('uses exact filename match (permSetName.permissionSet-meta.xml)', () => {
        const uris = [
            uriWithFsPath('/project/MyPermSetExtra.permissionSet-meta.xml'),
            uriWithFsPath('/project/MyPermSet.permissionSet-meta.xml'),
            uriWithFsPath('/project/MyPermSet_suffix.permissionSet-meta.xml')
        ];
        const result = getPermissionSetMetadataFileUrisToDelete(uris, 'MyPermSet');
        expect(result).toHaveLength(1);
        expect(result[0].fsPath).toContain('MyPermSet.permissionSet-meta.xml');
    });

    test('matches permission set with namespace prefix in name', () => {
        const match = uriWithFsPath('/project/force-app/MyNamespace__MyPermSet.permissionSet-meta.xml');
        const result = getPermissionSetMetadataFileUrisToDelete([match], 'MyNamespace__MyPermSet');
        expect(result).toHaveLength(1);
        expect(result[0].fsPath).toBe(match.fsPath);
    });

    test('matches .permissionset-meta.xml (lowercase) used by Salesforce on disk', () => {
        const match = uriWithFsPath('/project/force-app/main/default/permissionsets/TestingPS.permissionset-meta.xml');
        const result = getPermissionSetMetadataFileUrisToDelete([match], 'TestingPS');
        expect(result).toHaveLength(1);
        expect(result[0].fsPath).toBe(match.fsPath);
    });
});
