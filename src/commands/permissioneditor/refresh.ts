/**
 * Refresh permission metadata: fetches Profiles and Permission Sets from the org via Salesforce CLI
 * and stores in extension globalState.
 */
import * as vscode from 'vscode';
import { executeShellCommand } from '../shared/utilities';
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

/**
 * Runs the two sf data query calls (Profile, PermissionSet) and stores results in globalState.
 * Also queries profile-backed PermissionSet Ids for ObjectPermissions/FieldPermissions lookups.
 * @param context - Extension context for globalState
 * @param showMessage - If true, show info/error messages to the user (e.g. when run from command). If false, fail silently (e.g. background refresh).
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

    const cwd = workspaceFolders[0].uri.fsPath;

    try {
        const profilesQuery = `sf data query --query "SELECT Id, Name FROM Profile" --json`;
        const profilesOutput = await executeShellCommand(profilesQuery, (out) => out);
        const profilesJson = JSON.parse(profilesOutput) as { status?: number; result?: { records?: { Id: string; Name: string }[] }; message?: string };
        if (profilesJson.status !== 0) {
            if (showMessage) {
                vscode.window.showErrorMessage(`Failed to get profiles: ${profilesJson.message ?? 'Unknown error'}`);
            }
            return undefined;
        }
        const profileRecords = profilesJson.result?.records ?? [];
        const profiles: CachedProfile[] = profileRecords.map((r: { Id: string; Name: string }) => ({ id: r.Id, name: r.Name }));

        const permSetsQuery = `sf data query --query "SELECT Id, Name, Label, NamespacePrefix, IsOwnedByProfile FROM PermissionSet WHERE IsOwnedByProfile = false" --json`;
        const permSetsOutput = await executeShellCommand(permSetsQuery, (out) => out);
        const permSetsJson = JSON.parse(permSetsOutput) as {
            status?: number;
            result?: { records?: { Id: string; Name: string; Label?: string; NamespacePrefix?: string; IsOwnedByProfile?: boolean }[] };
            message?: string;
        };
        if (permSetsJson.status !== 0) {
            if (showMessage) {
                vscode.window.showErrorMessage(`Failed to get permission sets: ${permSetsJson.message ?? 'Unknown error'}`);
            }
            return undefined;
        }
        const permSetRecords = permSetsJson.result?.records ?? [];
        const permissionSets: CachedPermissionSet[] = permSetRecords.map(
            (r: { Id: string; Name: string; Label?: string; NamespacePrefix?: string; IsOwnedByProfile?: boolean }) => ({
                id: r.Id,
                name: r.Name,
                label: r.Label,
                namespacePrefix: r.NamespacePrefix,
                isOwnedByProfile: r.IsOwnedByProfile
            })
        );

        const profilePermSetQuery = `sf data query --query "SELECT Id, ProfileId, Name FROM PermissionSet WHERE IsOwnedByProfile = true" --json`;
        const profilePermSetOutput = await executeShellCommand(profilePermSetQuery, (out) => out);
        const profilePermSetJson = JSON.parse(profilePermSetOutput) as {
            status?: number;
            result?: { records?: { Id: string; ProfileId: string; Name: string }[] };
            message?: string;
        };
        const profilePermissionSetIds: Record<string, string> = {};
        if (profilePermSetJson.status === 0 && profilePermSetJson.result?.records) {
            for (const r of profilePermSetJson.result.records) {
                profilePermissionSetIds[r.ProfileId] = r.Id;
            }
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
}
