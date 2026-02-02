/**
 * Toggle object/field permissions: select targets (profiles & permission sets), select CRUD or Read/Edit, apply to metadata files and deploy.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { checkIfWorkspaceIsValidSfdxProject, executeShellCommand } from '../shared/utilities';
import {
    getCachedProfiles,
    getCachedPermissionSets,
    getDefaultOrgContext,
    getProfilePermissionSetIds,
    refreshPermissionMetadata
} from './refresh';
import { parseObjectFieldFromPath, isObjectOrFieldPermissionFile } from './path';
import { queryObjectPermissions, queryFieldPermissions } from './soql';
import { objectPermissionsRecordToFlags, fieldPermissionsRecordToFlags } from './soqlMappers';
import { applyObjectPermissionsToFile, applyFieldPermissionsToFile } from './xmlEdit';
import { resolveMetadataFile, listPermissionSetsInWorkspace } from './resolve';
import { normalizeObjectPermissionFlags, normalizeFieldPermissionFlags } from './permissionFlags';
import type { ObjectPermissionFlags, FieldPermissionFlags } from '../shared/types';

const OBJECT_PERMISSION_LABELS: { value: keyof ObjectPermissionFlags; label: string }[] = [
    { value: 'allowRead', label: 'Read' },
    { value: 'allowCreate', label: 'Create' },
    { value: 'allowEdit', label: 'Edit' },
    { value: 'allowDelete', label: 'Delete' },
    { value: 'viewAllRecords', label: 'View All Records' },
    { value: 'modifyAllRecords', label: 'Modify All Records' }
];

const FIELD_PERMISSION_LABELS: { value: keyof FieldPermissionFlags; label: string }[] = [
    { value: 'readable', label: 'Read' },
    { value: 'editable', label: 'Edit' }
];

interface TargetItem extends vscode.QuickPickItem {
    targetKind: 'profile' | 'permissionSet';
    id: string;
    name: string;
    permissionSetId: string;
}

export async function runToggleObjectFieldPermissions(context: vscode.ExtensionContext): Promise<void> {
    if (!checkIfWorkspaceIsValidSfdxProject()) {
        vscode.window.showErrorMessage(
            'This command can only be run in a Salesforce DX project. Please open a valid Salesforce DX project.'
        );
        return;
    }

    const editor = vscode.window.activeTextEditor;
    const filePath = editor?.document.uri.fsPath;
    if (!filePath || !isObjectOrFieldPermissionFile(filePath)) {
        vscode.window.showErrorMessage(
            'Please focus an object or field metadata file (.object-meta.xml or .field-meta.xml) and run the command again.'
        );
        return;
    }

    const focused = parseObjectFieldFromPath(filePath);
    if (!focused) {
        vscode.window.showErrorMessage('Could not parse object/field from the current file path.');
        return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const workspacePermissionSets = listPermissionSetsInWorkspace(workspaceRoot);
    let profiles = getCachedProfiles(context);
    let permissionSets = getCachedPermissionSets(context);
    const profilePermissionSetIds = getProfilePermissionSetIds(context);

    const hasProfileTargets = profiles.some((p) => profilePermissionSetIds[p.id]);
    const hasPermissionSetTargets = permissionSets.length > 0 || workspacePermissionSets.length > 0;
    if (!hasProfileTargets && !hasPermissionSetTargets) {
        const refreshFirst = await vscode.window.showQuickPick(
            [{ label: 'Refresh permission metadata first', value: 'refresh' }],
            { placeHolder: 'No profiles or permission sets. Run refresh or add a permission set to the repo?' }
        );
        if (refreshFirst?.value === 'refresh') {
            await refreshPermissionMetadata(context, true);
            profiles = getCachedProfiles(context);
            permissionSets = getCachedPermissionSets(context);
        }
        const hasTargetsAfterRefresh =
            profiles.some((p) => profilePermissionSetIds[p.id]) ||
            permissionSets.length > 0 ||
            workspacePermissionSets.length > 0;
        if (!hasTargetsAfterRefresh) {
            vscode.window.showErrorMessage(
                'No profiles or permission sets available. Run "Refresh permission metadata" or add a permission set file to the workspace.'
            );
            return;
        }
    }

    const cachedPermSetNames = new Set(permissionSets.map((ps) => ps.name));
    const targetItems: TargetItem[] = [];
    for (const p of profiles) {
        const permSetId = profilePermissionSetIds[p.id];
        if (!permSetId) {continue;}
        targetItems.push({
            label: `Profile: ${p.name}`,
            targetKind: 'profile',
            id: p.id,
            name: p.name,
            permissionSetId: permSetId
        });
    }
    for (const ps of permissionSets) {
        targetItems.push({
            label: `Permission Set: ${ps.label ?? ps.name}`,
            targetKind: 'permissionSet',
            id: ps.id,
            name: ps.name,
            permissionSetId: ps.id
        });
    }
    for (const { name } of workspacePermissionSets) {
        if (cachedPermSetNames.has(name)) { continue; }
        targetItems.push({
            label: `Permission Set: ${name} (workspace)`,
            targetKind: 'permissionSet',
            id: `workspace:${name}`,
            name,
            permissionSetId: ''
        });
    }

    const selectedTargets = await vscode.window.showQuickPick<TargetItem>(targetItems, {
        placeHolder: 'Select one or more profiles or permission sets',
        canPickMany: true,
        matchOnDescription: true
    });
    if (!selectedTargets?.length) {return;}

    const parentIds = selectedTargets
        .map((t) => t.permissionSetId)
        .filter((id): id is string => Boolean(id && /^[a-zA-Z0-9]{15,18}$/.test(id)));

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Toggle object/field permissions',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Resolving default org...' });
            let sfContext: { cwd: string; targetOrg: string };
            try {
                sfContext = await getDefaultOrgContext(workspaceRoot);
            } catch (err) {
                vscode.window.showErrorMessage(
                    `Could not resolve default org: ${(err as Error).message}`
                );
                return;
            }

            if (focused.kind === 'object') {
                progress.report({ message: 'Querying object permissions...' });
                const existingRecords = await queryObjectPermissions(parentIds, focused.objectApiName, sfContext);
                const defaultFlags: ObjectPermissionFlags = {
                    allowCreate: false,
                    allowDelete: false,
                    allowEdit: false,
                    allowRead: false,
                    viewAllRecords: false,
                    modifyAllRecords: false
                };
                const merged = existingRecords.length > 0
                    ? objectPermissionsRecordToFlags(existingRecords[0])
                    : defaultFlags;

                const permItems = OBJECT_PERMISSION_LABELS.map(({ value, label }) => ({
                    label,
                    value,
                    picked: merged[value]
                }));
                const selectedPerms = await vscode.window.showQuickPick(permItems, {
                    placeHolder: 'Select CRUD permissions to grant for this object',
                    canPickMany: true
                });
                if (selectedPerms === undefined) {return;}

                const rawFlags: ObjectPermissionFlags = {
                    allowCreate: selectedPerms.some((p) => p.value === 'allowCreate'),
                    allowDelete: selectedPerms.some((p) => p.value === 'allowDelete'),
                    allowEdit: selectedPerms.some((p) => p.value === 'allowEdit'),
                    allowRead: selectedPerms.some((p) => p.value === 'allowRead'),
                    viewAllRecords: selectedPerms.some((p) => p.value === 'viewAllRecords'),
                    modifyAllRecords: selectedPerms.some((p) => p.value === 'modifyAllRecords')
                };
                const flags = normalizeObjectPermissionFlags(rawFlags);

                progress.report({ message: 'Applying permissions to metadata files...' });
                const filesToDeploy: string[] = [];
                for (const target of selectedTargets) {
                    const filePathResolved = await resolveMetadataFile(workspaceRoot, target.targetKind, target.name);
                    if (!filePathResolved) {
                        vscode.window.showErrorMessage(`Could not find or retrieve metadata for ${target.label}.`);
                        continue;
                    }
                    try {
                        applyObjectPermissionsToFile(filePathResolved, focused.objectApiName, flags);
                        filesToDeploy.push(filePathResolved);
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to update ${target.label}: ${(err as Error).message}`);
                    }
                }
                if (filesToDeploy.length > 0) {
                    progress.report({ message: 'Deploying...' });
                    const deployOk = await deployMetadataFiles(filesToDeploy);
                    if (deployOk) {
                        await maybeRetrieveAfterDeploy(sfContext.targetOrg, selectedTargets);
                    }
                }
                return;
            }

            if (focused.kind === 'field') {
                progress.report({ message: 'Querying object and field permissions...' });
                const existingObjectRecords = await queryObjectPermissions(parentIds, focused.objectApiName, sfContext);
                const existingFieldRecords = await queryFieldPermissions(
                    parentIds,
                    focused.objectApiName,
                    focused.fieldFullName,
                    sfContext
                );
                const objectFlags: ObjectPermissionFlags = existingObjectRecords.length > 0
                    ? objectPermissionsRecordToFlags(existingObjectRecords[0])
                    : { allowCreate: false, allowDelete: false, allowEdit: false, allowRead: true, viewAllRecords: false, modifyAllRecords: false };
                const fieldFlagsFromRecord = existingFieldRecords.length > 0
                    ? fieldPermissionsRecordToFlags(existingFieldRecords[0])
                    : { readable: false, editable: false };
                const needsObjectAccess = existingObjectRecords.length === 0;
                if (needsObjectAccess) {
                    objectFlags.allowRead = true;
                }

                const permItems = FIELD_PERMISSION_LABELS.map(({ value, label }) => ({
                    label,
                    value,
                    picked: fieldFlagsFromRecord[value]
                }));
                const selectedPerms = await vscode.window.showQuickPick(permItems, {
                    placeHolder: needsObjectAccess
                        ? 'Select field permissions. Object access will be added if missing.'
                        : 'Select field permissions (Read / Edit)',
                    canPickMany: true
                });
                if (selectedPerms === undefined) {return;}

                const rawFieldFlags: FieldPermissionFlags = {
                    readable: selectedPerms.some((p) => p.value === 'readable'),
                    editable: selectedPerms.some((p) => p.value === 'editable')
                };
                const fieldFlags = normalizeFieldPermissionFlags(rawFieldFlags);

                progress.report({ message: 'Applying permissions to metadata files...' });
                const filesToDeploy: string[] = [];
                for (const target of selectedTargets) {
                    const filePathResolved = await resolveMetadataFile(workspaceRoot, target.targetKind, target.name);
                    if (!filePathResolved) {
                        vscode.window.showErrorMessage(`Could not find or retrieve metadata for ${target.label}.`);
                        continue;
                    }
                    try {
                        applyFieldPermissionsToFile(
                            filePathResolved,
                            focused.objectApiName,
                            focused.fieldFullName,
                            objectFlags,
                            fieldFlags
                        );
                        filesToDeploy.push(filePathResolved);
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to update ${target.label}: ${(err as Error).message}`);
                    }
                }
                if (filesToDeploy.length > 0) {
                    progress.report({ message: 'Deploying...' });
                    const deployOk = await deployMetadataFiles(filesToDeploy);
                    if (deployOk) {
                        await maybeRetrieveAfterDeploy(sfContext.targetOrg, selectedTargets);
                    }
                }
            }
        }
    );
}

const CONFIG_SECTION = 'sf-ext-plus';
const CONFIG_KEY_RETRIEVE_AFTER_EDIT = 'permissionEditor.retrieveAfterEdit';

async function maybeRetrieveAfterDeploy(targetOrg: string, selectedTargets: TargetItem[]): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const retrieveSettingInspect = config.inspect<boolean>(CONFIG_KEY_RETRIEVE_AFTER_EDIT);
    const userSetRetrieve =
        retrieveSettingInspect?.globalValue !== undefined || retrieveSettingInspect?.workspaceValue !== undefined;

    let doRetrieve: boolean;
    if (userSetRetrieve) {
        doRetrieve = config.get<boolean>(CONFIG_KEY_RETRIEVE_AFTER_EDIT, true);
    } else {
        const retrievePick = await vscode.window.showQuickPick(
            [{ label: 'Yes', value: true }, { label: 'No', value: false }],
            {
                placeHolder: 'Retrieve metadata to sync permission set/profile files?',
                title: 'Retrieve metadata',
                ignoreFocusOut: true
            }
        );
        if (retrievePick === undefined) {
            return;
        }
        doRetrieve = retrievePick.value;
    }

    if (!doRetrieve) {
        return;
    }

    const metaArgs = selectedTargets
        .map((t) => (t.targetKind === 'profile' ? `Profile:${t.name}` : `PermissionSet:${t.name}`))
        .map((m) => `-m ${JSON.stringify(m)}`)
        .join(' ');
    const cmd = `sf project retrieve start ${metaArgs} --target-org ${JSON.stringify(targetOrg)} --json`;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Retrieving permission set/profile metadata...',
            cancellable: false
        },
        async () => {
            try {
                const out = await executeShellCommand(cmd, (s) => s);
                const json = JSON.parse(out) as { status?: number; message?: string };
                if (json.status !== 0) {
                    vscode.window.showErrorMessage(`Retrieve failed: ${json.message ?? 'Unknown error'}`);
                    return;
                }
                vscode.window.showInformationMessage(`Retrieved metadata for ${selectedTargets.length} file(s).`);
            } catch (err) {
                vscode.window.showErrorMessage(`Retrieve failed: ${(err as Error).message}`);
            }
        }
    );
}

async function deployMetadataFiles(filePaths: string[]): Promise<boolean> {
    if (filePaths.length === 0) {return false;}
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {return false;}
    const sourceDirs = [...new Set(filePaths.map((p) => path.dirname(p)))];
    let anyFailed = false;
    for (const dir of sourceDirs) {
        const cmd = `sf project deploy start --source-dir "${dir}" --json`;
        try {
            const out = await executeShellCommand(cmd, (s) => s);
            const json = JSON.parse(out) as { status?: number; message?: string };
            if (json.status !== 0) {
                vscode.window.showErrorMessage(`Deploy failed: ${json.message ?? 'Unknown error'}`);
                anyFailed = true;
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Deploy failed: ${(err as Error).message}`);
            anyFailed = true;
        }
    }
    if (!anyFailed && filePaths.length > 0) {
        vscode.window.showInformationMessage(`Deployed ${filePaths.length} metadata file(s).`);
    }
    return !anyFailed;
}
