import * as path from 'path';

/**
 * Returns URIs of permission set metadata files that match the given API name.
 * Used so we only delete files for the permission set being deleted.
 * Matches both .permissionSet-meta.xml and .permissionset-meta.xml (Salesforce uses lowercase on disk).
 */
export function getPermissionSetMetadataFileUrisToDelete<T extends { fsPath: string }>(
    uris: T[],
    permSetName: string
): T[] {
    const expectedLower = `${permSetName}.permissionset-meta.xml`.toLowerCase();
    return uris.filter((u) => path.basename(u.fsPath).toLowerCase() === expectedLower);
}
