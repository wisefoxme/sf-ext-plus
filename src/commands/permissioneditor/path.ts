import * as path from 'path';

export type FocusedMetadata = { kind: 'object'; objectApiName: string } | { kind: 'field'; objectApiName: string; fieldApiName: string; fieldFullName: string };

/**
 * Parses the active editor path to determine if it's an object or field metadata file and extract API names.
 * Object: .../objects/MyObject__c/MyObject__c.object-meta.xml -> objectApiName = MyObject__c
 * Field:  .../objects/MyObject__c/fields/MyField__c.field-meta.xml -> objectApiName = MyObject__c, fieldApiName = MyField__c, fieldFullName = MyObject__c.MyField__c
 */
export function parseObjectFieldFromPath(filePath: string): FocusedMetadata | null {
    const normalized = path.normalize(filePath);
    if (normalized.endsWith('.object-meta.xml')) {
        const base = path.basename(normalized, '.object-meta.xml');
        return { kind: 'object', objectApiName: base };
    }
    if (normalized.endsWith('.field-meta.xml')) {
        const pathParts = normalized.split(path.sep);
        const objectsIndex = pathParts.findIndex((p) => p === 'objects');
        const fieldsIndex = pathParts.findIndex((p) => p === 'fields');
        if (objectsIndex !== -1 && objectsIndex + 1 < pathParts.length && fieldsIndex !== -1 && fieldsIndex + 1 < pathParts.length) {
            const objectApiName = pathParts[objectsIndex + 1];
            const fieldApiName = path.basename(normalized, '.field-meta.xml');
            const fieldFullName = `${objectApiName}.${fieldApiName}`;
            return { kind: 'field', objectApiName, fieldApiName, fieldFullName };
        }
    }
    return null;
}

export function isObjectOrFieldPermissionFile(filePath: string): boolean {
    return filePath.endsWith('.object-meta.xml') || filePath.endsWith('.field-meta.xml');
}
