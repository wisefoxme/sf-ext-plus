/**
 * Query ObjectPermissions and FieldPermissions via Salesforce CLI (sf data query).
 */
import { executeShellCommand } from '../shared/utilities';
import type { ObjectPermissionsRecord, FieldPermissionsRecord } from '../shared/types';

export { objectPermissionsRecordToFlags, fieldPermissionsRecordToFlags } from './soqlMappers';

interface SfDataQueryResult<T> {
    status?: number;
    result?: { records?: T[] };
    message?: string;
}

export async function queryObjectPermissions(parentIds: string[], objectApiName: string): Promise<ObjectPermissionsRecord[]> {
    if (parentIds.length === 0) {return [];}
    const ids = parentIds.map((id) => `'${id}'`).join(',');
    const soql = `SELECT ParentId, SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId IN (${ids}) AND SobjectType = '${objectApiName.replace(/'/g, "\\'")}'`;
    const cmd = `sf data query --query "${soql}" --json`;
    const out = await executeShellCommand(cmd, (s) => s);
    const json = JSON.parse(out) as SfDataQueryResult<ObjectPermissionsRecord>;
    if (json.status !== 0) {return [];}
    return json.result?.records ?? [];
}

export async function queryFieldPermissions(
    parentIds: string[],
    objectApiName: string,
    fieldFullName: string
): Promise<FieldPermissionsRecord[]> {
    if (parentIds.length === 0) {return [];}
    const ids = parentIds.map((id) => `'${id}'`).join(',');
    const soql = `SELECT ParentId, Field, SobjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (${ids}) AND SobjectType = '${objectApiName.replace(/'/g, "\\'")}' AND Field = '${fieldFullName.replace(/'/g, "\\'")}'`;
    const cmd = `sf data query --query "${soql}" --json`;
    const out = await executeShellCommand(cmd, (s) => s);
    const json = JSON.parse(out) as SfDataQueryResult<FieldPermissionsRecord>;
    if (json.status !== 0) {return [];}
    return json.result?.records ?? [];
}
