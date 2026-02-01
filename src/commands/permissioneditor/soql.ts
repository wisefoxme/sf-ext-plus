/**
 * Query ObjectPermissions and FieldPermissions via Salesforce CLI (sf data query).
 */
import * as cp from 'child_process';
import type { ObjectPermissionsRecord, FieldPermissionsRecord } from '../shared/types';

export { objectPermissionsRecordToFlags, fieldPermissionsRecordToFlags } from './soqlMappers';

export interface SfOrgContext {
    cwd: string;
    targetOrg: string;
}

interface SfDataQueryResult<T> {
    status?: number;
    result?: { records?: T[] };
    message?: string;
}

function runSfDataQueryWithContext<T>(soql: string, context: SfOrgContext): Promise<SfDataQueryResult<T>> {
    return new Promise((resolve, reject) => {
        const targetOrgArg = `--target-org ${JSON.stringify(context.targetOrg)}`;
        const cmd = `sf data query --query ${JSON.stringify(soql)} ${targetOrgArg} --json`;
        cp.exec(cmd, { cwd: context.cwd }, (err, stdout, stderr) => {
            let parsed: SfDataQueryResult<T>;
            try {
                parsed = JSON.parse(stdout || '{}') as SfDataQueryResult<T>;
            } catch {
                parsed = {};
            }
            if (err) {
                const msg = parsed.message ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Query failed'));
            }
            resolve(parsed);
        });
    });
}

export async function queryObjectPermissions(
    parentIds: string[],
    objectApiName: string,
    context: SfOrgContext
): Promise<ObjectPermissionsRecord[]> {
    if (parentIds.length === 0) {
        return [];
    }
    const ids = parentIds.map((id) => `'${id}'`).join(',');
    const soql = `SELECT ParentId, SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords FROM ObjectPermissions WHERE ParentId IN (${ids}) AND SobjectType = '${objectApiName.replace(/'/g, "\\'")}'`;
    try {
        const json = await runSfDataQueryWithContext<ObjectPermissionsRecord>(soql, context);
        return json.result?.records ?? [];
    } catch {
        return [];
    }
}

export async function queryFieldPermissions(
    parentIds: string[],
    objectApiName: string,
    fieldFullName: string,
    context: SfOrgContext
): Promise<FieldPermissionsRecord[]> {
    if (parentIds.length === 0) {
        return [];
    }
    const ids = parentIds.map((id) => `'${id}'`).join(',');
    const soql = `SELECT ParentId, Field, SobjectType, PermissionsRead, PermissionsEdit FROM FieldPermissions WHERE ParentId IN (${ids}) AND SobjectType = '${objectApiName.replace(/'/g, "\\'")}' AND Field = '${fieldFullName.replace(/'/g, "\\'")}'`;
    try {
        const json = await runSfDataQueryWithContext<FieldPermissionsRecord>(soql, context);
        return json.result?.records ?? [];
    } catch {
        return [];
    }
}
