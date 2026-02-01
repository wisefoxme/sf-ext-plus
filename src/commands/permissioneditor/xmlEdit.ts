/**
 * Edit PermissionSet or Profile metadata XML: add/update objectPermissions and fieldPermissions.
 */
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { ObjectPermissionFlags, FieldPermissionFlags } from '../shared/types';
import { normalizeObjectPermissionFlags, normalizeFieldPermissionFlags } from './permissionFlags';

const PARSER_OPTIONS = {
    ignoreAttributes: false,
    parseTagValue: true,
    trimValues: true,
    isArray: (tagName: string, _jPath: string, _isLeafNode: boolean, _isAttribute: boolean) =>
        tagName === 'objectPermissions' || tagName === 'fieldPermissions'
};

const BUILDER_OPTIONS = {
    ignoreAttributes: false,
    format: true,
    indentBy: '    ',
    suppressBooleanAttributes: false
};

type ObjectPermEntry = { allowCreate?: boolean; allowDelete?: boolean; allowEdit?: boolean; allowRead?: boolean; viewAllRecords?: boolean; modifyAllRecords?: boolean; object?: string };
type FieldPermEntry = { editable?: boolean; readable?: boolean; field?: string };

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
    if (value === null || value === undefined) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function ensureObjectPermissionsInRoot(root: Record<string, unknown>, objectApiName: string, flags: ObjectPermissionFlags): void {
    let list = normalizeToArray(root.objectPermissions as ObjectPermEntry | ObjectPermEntry[] | undefined);
    let entry = list.find((e) => e.object === objectApiName);
    if (!entry) {
        entry = { object: objectApiName };
        list.push(entry);
    }
    entry.allowCreate = flags.allowCreate;
    entry.allowDelete = flags.allowDelete;
    entry.allowEdit = flags.allowEdit;
    entry.allowRead = flags.allowRead;
    entry.viewAllRecords = flags.viewAllRecords;
    entry.modifyAllRecords = flags.modifyAllRecords;
    root.objectPermissions = list;
}

function ensureFieldPermissionsInRoot(root: Record<string, unknown>, fieldFullName: string, flags: FieldPermissionFlags): void {
    let list = normalizeToArray(root.fieldPermissions as FieldPermEntry | FieldPermEntry[] | undefined);
    let entry = list.find((e) => e.field === fieldFullName);
    if (!entry) {
        entry = { field: fieldFullName };
        list.push(entry);
    }
    entry.editable = flags.editable;
    entry.readable = flags.readable;
    root.fieldPermissions = list;
}

/**
 * Get the root object (PermissionSet or Profile) from parsed metadata.
 */
function getRoot(parsed: Record<string, unknown>): Record<string, unknown> | null {
    if (parsed.PermissionSet && typeof parsed.PermissionSet === 'object') {
        return parsed.PermissionSet as Record<string, unknown>;
    }
    if (parsed.Profile && typeof parsed.Profile === 'object') {
        return parsed.Profile as Record<string, unknown>;
    }
    return null;
}

/**
 * Apply object permission flags to a PermissionSet or Profile metadata file.
 * Creates or updates the objectPermissions entry for the given object.
 */
export function applyObjectPermissionsToFile(filePath: string, objectApiName: string, flags: ObjectPermissionFlags): void {
    const normalized = normalizeObjectPermissionFlags(flags);
    const xml = fs.readFileSync(filePath, 'utf8');
    const parser = new XMLParser(PARSER_OPTIONS);
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const root = getRoot(parsed);
    if (!root) {
        throw new Error(`Unsupported metadata root in ${filePath}`);
    }
    ensureObjectPermissionsInRoot(root, objectApiName, normalized);
    const builder = new XMLBuilder(BUILDER_OPTIONS);
    const out = builder.build(parsed);
    fs.writeFileSync(filePath, out, 'utf8');
}

/**
 * Apply field permission flags and ensure object permission exists (at least allowRead) for the object.
 * FieldPermissions are only valid when the parent has object-level access.
 */
export function applyFieldPermissionsToFile(
    filePath: string,
    objectApiName: string,
    fieldFullName: string,
    objectFlags: ObjectPermissionFlags,
    fieldFlags: FieldPermissionFlags
): void {
    const normalizedObject = normalizeObjectPermissionFlags(objectFlags);
    const normalizedField = normalizeFieldPermissionFlags(fieldFlags);
    const xml = fs.readFileSync(filePath, 'utf8');
    const parser = new XMLParser(PARSER_OPTIONS);
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const root = getRoot(parsed);
    if (!root) {
        throw new Error(`Unsupported metadata root in ${filePath}`);
    }
    ensureObjectPermissionsInRoot(root, objectApiName, normalizedObject);
    ensureFieldPermissionsInRoot(root, fieldFullName, normalizedField);
    const builder = new XMLBuilder(BUILDER_OPTIONS);
    const out = builder.build(parsed);
    fs.writeFileSync(filePath, out, 'utf8');
}
