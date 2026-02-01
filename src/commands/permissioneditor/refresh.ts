/**
 * Refresh permission metadata: fetches Profiles and Permission Sets from the org via Salesforce CLI
 * and stores in extension globalState.
 */
import * as cp from 'child_process';
import * as vscode from 'vscode';
import type { CachedProfile, CachedPermissionSet } from '../shared/types';

const GLOBAL_STATE_KEY_PROFILES = 'permissionEditor.profiles';
const GLOBAL_STATE_KEY_PERMISSION_SETS = 'permissionEditor.permissionSets';
const GLOBAL_STATE_KEY_PROFILE_PERM_SET_IDS = 'permissionEditor.profilePermissionSetIds';

export interface RefreshResult {
    profiles: CachedProfile[];
    permissionSets: CachedPermissionSet[];
    profilePermissionSetIds: Record<string, string>;
}

export function getCachedProfiles(context: vscode.ExtensionContext): CachedProfile[] {
    return context.globalState.get<CachedProfile[]>(GLOBAL_STATE_KEY_PROFILES) ?? [];
}

export function getCachedPermissionSets(context: vscode.ExtensionContext): CachedPermissionSet[] {
    return context.globalState.get<CachedPermissionSet[]>(GLOBAL_STATE_KEY_PERMISSION_SETS) ?? [];
}

export function getProfilePermissionSetIds(context: vscode.ExtensionContext): Record<string, string> {
    return context.globalState.get<Record<string, string>>(GLOBAL_STATE_KEY_PROFILE_PERM_SET_IDS) ?? {};
}

interface SfQueryPayload<T> {
    status?: number;
    result?: { records?: T[] };
    message?: string;
    name?: string;
}

interface OrgListEntry {
    username?: string;
    alias?: string;
    isDefaultUsername?: boolean;
}

interface SfOrgListPayload {
    status?: number;
    result?: {
        nonScratchOrgs?: OrgListEntry[];
        sandboxes?: OrgListEntry[];
        scratchOrgs?: OrgListEntry[];
        other?: OrgListEntry[];
    };
    message?: string;
    name?: string;
}

/**
 * Run a shell command with optional cwd and return stdout. On failure, parses JSON from stdout for the CLI message.
 */
function runSfCommand(
    args: string[],
    options: { cwd: string }
): Promise<string> {
    return new Promise((resolve, reject) => {
        const cmd = `sf ${args.join(' ')}`;
        cp.exec(cmd, { cwd: options.cwd }, (err, stdout, stderr) => {
            if (err) {
                let msg = err.message;
                try {
                    const parsed = JSON.parse(stdout || '{}') as { message?: string; name?: string };
                    msg = parsed.message ?? parsed.name ?? stderr?.trim() ?? msg;
                } catch {
                    msg = stderr?.trim() ?? msg;
                }
                return reject(new Error(msg));
            }
            resolve(stdout ?? '');
        });
    });
}

/**
 * Get the default org username by running sf org list --json in the workspace.
 * Returns the username of the org with isDefaultUsername === true.
 */
export async function getDefaultOrgUsername(workspaceRoot: string): Promise<string> {
    const out = await runSfCommand(['org', 'list', '--json'], { cwd: workspaceRoot });
    const parsed = JSON.parse(out) as SfOrgListPayload;
    if (parsed.status !== 0 && parsed.status !== undefined) {
        throw new Error(parsed.message ?? 'Failed to list orgs');
    }
    const result = parsed.result ?? {};
    const allOrgs: OrgListEntry[] = [
        ...(result.nonScratchOrgs ?? []),
        ...(result.sandboxes ?? []),
        ...(result.scratchOrgs ?? []),
        ...(result.other ?? [])
    ];
    const defaultOrg = allOrgs.find((org) => org.isDefaultUsername === true);
    if (!defaultOrg?.username) {
        throw new Error(
            'No default org set. Set a default org in the project or run "sf config set target-org <alias>" in the workspace.'
        );
    }
    return defaultOrg.username;
}

/**
 * Get workspace root and default org for running sf commands in the same context as the terminal.
 */
export async function getDefaultOrgContext(workspaceRoot: string): Promise<{ cwd: string; targetOrg: string }> {
    const targetOrg = await getDefaultOrgUsername(workspaceRoot);
    return { cwd: workspaceRoot, targetOrg };
}

/**
 * Run sf data query with cwd and target-org so the extension uses the same context as the terminal.
 */
function runSfDataQuery<T>(
    soql: string,
    options: { cwd: string; targetOrg: string }
): Promise<SfQueryPayload<T>> {
    return new Promise((resolve, reject) => {
        const targetOrgArg = `--target-org ${JSON.stringify(options.targetOrg)}`;
        const cmd = `sf data query --query ${JSON.stringify(soql)} ${targetOrgArg} --json`;
        cp.exec(cmd, { cwd: options.cwd }, (err, stdout, stderr) => {
            let parsed: SfQueryPayload<T>;
            try {
                parsed = JSON.parse(stdout || '{}') as SfQueryPayload<T>;
            } catch {
                parsed = {};
            }
            if (err) {
                const msg = parsed.message ?? parsed.name ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Query failed'));
            }
            resolve(parsed);
        });
    });
}

/**
 * Runs sf org list to resolve the default org, then the three sf data query calls in parallel,
 * with cwd set to the workspace so the CLI uses the same context as the terminal.
 * @param context - Extension context for globalState
 * @param showMessage - If true, show progress toast and info/error messages. If false, fail silently (e.g. background refresh).
 */
export async function refreshPermissionMetadata(
    context: vscode.ExtensionContext,
    showMessage: boolean
): Promise<RefreshResult | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        if (showMessage) {
            vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');
        }
        return undefined;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const doRefresh = async (
        progress?: vscode.Progress<{ message?: string }>
    ): Promise<RefreshResult | undefined> => {
        try {
            if (progress?.report) {
                progress.report({ message: 'Listing environments...' });
            }
            const targetOrg = await getDefaultOrgUsername(workspaceRoot);

            if (progress?.report) {
                progress.report({ message: 'Loading profiles and permission sets...' });
            }
            const queryOpts = { cwd: workspaceRoot, targetOrg };

            const [profilesPayload, permSetsPayload, profilePermSetPayload] = await Promise.all([
                runSfDataQuery<{ Id: string; Name: string }>('SELECT Id, Name FROM Profile', queryOpts),
                runSfDataQuery<{ Id: string; Name: string; Label?: string; NamespacePrefix?: string; IsOwnedByProfile?: boolean }>(
                    'SELECT Id, Name, Label, NamespacePrefix, IsOwnedByProfile FROM PermissionSet WHERE IsOwnedByProfile = false',
                    queryOpts
                ),
                runSfDataQuery<{ Id: string; ProfileId: string; Name: string }>(
                    'SELECT Id, ProfileId, Name FROM PermissionSet WHERE IsOwnedByProfile = true',
                    queryOpts
                )
            ]);

            const profileRecords = profilesPayload.result?.records ?? [];
            const profiles: CachedProfile[] = profileRecords.map((r) => ({ id: r.Id, name: r.Name }));

            const permSetRecords = permSetsPayload.result?.records ?? [];
            const permissionSets: CachedPermissionSet[] = permSetRecords.map((r) => ({
                id: r.Id,
                name: r.Name,
                label: r.Label,
                namespacePrefix: r.NamespacePrefix,
                isOwnedByProfile: r.IsOwnedByProfile
            }));

            const profilePermissionSetIds: Record<string, string> = {};
            const profilePermSetRecords = profilePermSetPayload.result?.records ?? [];
            for (const r of profilePermSetRecords) {
                profilePermissionSetIds[r.ProfileId] = r.Id;
            }

            await context.globalState.update(GLOBAL_STATE_KEY_PROFILES, profiles);
            await context.globalState.update(GLOBAL_STATE_KEY_PERMISSION_SETS, permissionSets);
            await context.globalState.update(GLOBAL_STATE_KEY_PROFILE_PERM_SET_IDS, profilePermissionSetIds);

            if (showMessage) {
                vscode.window.showInformationMessage(
                    `Loaded ${profiles.length} profiles and ${permissionSets.length} permission sets.`
                );
            }

            return { profiles, permissionSets, profilePermissionSetIds };
        } catch (err) {
            if (showMessage) {
                vscode.window.showErrorMessage(`Refresh permission metadata failed: ${(err as Error).message}`);
            }
            return undefined;
        }
    };

    if (showMessage) {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Permission metadata',
                cancellable: false
            },
            (progress) => doRefresh(progress)
        );
    }

    return doRefresh();
}
