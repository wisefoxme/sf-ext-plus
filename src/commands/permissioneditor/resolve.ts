/**
 * Resolve local path for PermissionSet or Profile metadata file; retrieve from org if not in workspace.
 */
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import { executeShellCommand } from '../shared/utilities';

export type TargetKind = 'profile' | 'permissionSet';

export interface ResolvedTarget {
    kind: TargetKind;
    name: string;
    filePath: string;
}

const PERMISSION_SET_SUFFIX = /\.(permissionSet|permissionset)-meta\.xml$/i;

/**
 * List permission set API names and their file paths by scanning the workspace.
 * Matches both .permissionSet-meta.xml and .permissionset-meta.xml (Salesforce uses lowercase on disk).
 */
export function listPermissionSetsInWorkspace(workspaceRoot: string): { name: string; filePath: string }[] {
    const camel = glob.sync('**/*.permissionSet-meta.xml', { cwd: workspaceRoot, absolute: true });
    const lower = glob.sync('**/*.permissionset-meta.xml', { cwd: workspaceRoot, absolute: true });
    const seen = new Set<string>();
    const result: { name: string; filePath: string }[] = [];
    for (const filePath of [...camel, ...lower]) {
        const base = path.basename(filePath);
        const name = base.replace(PERMISSION_SET_SUFFIX, '');
        const key = name.toLowerCase();
        if (seen.has(key)) { continue; }
        seen.add(key);
        result.push({ name, filePath });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find metadata file in workspace: permissionSets/<Name>.permissionSet-meta.xml or profiles/<Name>.profile-meta.xml.
 * For permission sets, matches both .permissionSet-meta.xml and .permissionset-meta.xml (Salesforce uses lowercase on disk).
 */
function findInWorkspace(workspaceRoot: string, kind: TargetKind, name: string): string | null {
    if (kind === 'profile') {
        const files = glob.sync(`**/profiles/${name}.profile-meta.xml`, { cwd: workspaceRoot, absolute: true });
        return files.length > 0 ? files[0] : null;
    }
    const camel = glob.sync(`**/permissionSets/${name}.permissionSet-meta.xml`, { cwd: workspaceRoot, absolute: true });
    if (camel.length > 0) { return camel[0]; }
    const lower = glob.sync(`**/permissionSets/${name}.permissionset-meta.xml`, { cwd: workspaceRoot, absolute: true });
    if (lower.length > 0) { return lower[0]; }
    const lowerDir = glob.sync(`**/permissionsets/${name}.permissionset-meta.xml`, { cwd: workspaceRoot, absolute: true });
    return lowerDir.length > 0 ? lowerDir[0] : null;
}

/**
 * Retrieve metadata from org and return the path to the retrieved file.
 * Uses sf project retrieve start --metadata PermissionSet:Name or Profile:Name.
 */
async function retrieveFromOrg(workspaceRoot: string, kind: TargetKind, name: string): Promise<string | null> {
    const metadata = kind === 'profile' ? `Profile:${name}` : `PermissionSet:${name}`;
    const cmd = `sf project retrieve start --metadata "${metadata}" --json`;
    try {
        const out = await executeShellCommand(cmd, (s) => s);
        const json = JSON.parse(out) as {
            status?: number;
            result?: { inboundFiles?: { filePath: string }[]; retrievedSource?: { filePath: string }[] };
            message?: string;
        };
        if (json.status !== 0) {return null;}
        const files = json.result?.inboundFiles ?? json.result?.retrievedSource ?? [];
        const suffix = kind === 'profile' ? '.profile-meta.xml' : '.permissionSet-meta.xml';
        const fullPath = files.find((f: { filePath: string }) => f.filePath.endsWith(suffix));
        if (fullPath) {
            return path.join(workspaceRoot, fullPath.filePath);
        }
        return findInWorkspace(workspaceRoot, kind, name);
    } catch {
        return null;
    }
}

/**
 * Resolve the local file path for a target (Profile or Permission Set).
 * If not found in workspace, retrieves from the org.
 */
export async function resolveMetadataFile(
    workspaceRoot: string,
    kind: TargetKind,
    name: string
): Promise<string | null> {
    const found = findInWorkspace(workspaceRoot, kind, name);
    if (found && fs.existsSync(found)) {return found;}
    return retrieveFromOrg(workspaceRoot, kind, name);
}
