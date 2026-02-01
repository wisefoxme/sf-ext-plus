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

/**
 * Find metadata file in workspace: permissionSets/<Name>.permissionSet-meta.xml or profiles/<Name>.profile-meta.xml.
 */
function findInWorkspace(workspaceRoot: string, kind: TargetKind, name: string): string | null {
    const pattern = kind === 'profile'
        ? `**/profiles/${name}.profile-meta.xml`
        : `**/permissionSets/${name}.permissionSet-meta.xml`;
    const files = glob.sync(pattern, { cwd: workspaceRoot, absolute: true });
    return files.length > 0 ? files[0] : null;
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
