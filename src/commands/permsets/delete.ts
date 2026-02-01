import * as cp from 'child_process';
import * as vscode from 'vscode';
import { getDefaultOrgUsername } from '../permissioneditor/refresh';
import { getPermissionSetMetadataFileUrisToDelete } from './deleteMetadataFilter';

interface SfQueryPayload<T> {
    status?: number;
    result?: { records?: T[] };
    message?: string;
}

interface SfDeletePayload {
    status?: number;
    message?: string;
}

function runSfDataQuery<T>(
    soql: string,
    options: { cwd: string; targetOrg: string }
): Promise<{ records: T[] }> {
    return new Promise((resolve, reject) => {
        const targetOrgArg = `--target-org ${JSON.stringify(options.targetOrg)}`;
        const cmd = `sf data query --query ${JSON.stringify(soql)} ${targetOrgArg} --json`;
        cp.exec(cmd, { cwd: options.cwd }, (err, stdout, stderr) => {
            let parsed: SfQueryPayload<T> = {};
            try {
                parsed = JSON.parse(stdout || '{}') as SfQueryPayload<T>;
            } catch {
                // ignore
            }
            if (err) {
                const msg = parsed.message ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Query failed'));
            }
            resolve({ records: parsed.result?.records ?? [] });
        });
    });
}

function runSfDeleteRecord(
    sobject: string,
    recordId: string,
    targetOrg: string,
    cwd: string
): Promise<void> {
    return new Promise((resolve, reject) => {
        const cmd = `sf data delete record --target-org ${JSON.stringify(targetOrg)} --sobject ${JSON.stringify(sobject)} --record-id ${JSON.stringify(recordId)} --json`;
        cp.exec(cmd, { cwd }, (err, stdout, stderr) => {
            let parsed: SfDeletePayload = {};
            try {
                parsed = JSON.parse(stdout || '{}') as SfDeletePayload;
            } catch {
                // ignore
            }
            if (err) {
                const msg = parsed.message ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Delete failed'));
            }
            resolve();
        });
    });
}

interface PermissionSetRecord {
    Id: string;
    Name: string;
    Label: string;
}

interface PermissionSetAssignmentRecord {
    Id: string;
}

export async function deletePermissionSet(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    let targetOrg: string;
    try {
        targetOrg = await getDefaultOrgUsername(workspaceRoot);
    } catch (err) {
        vscode.window.showErrorMessage((err as Error).message);
        return;
    }

    let records: PermissionSetRecord[];
    try {
        const payload = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading permission sets...',
                cancellable: false
            },
            async () =>
                runSfDataQuery<PermissionSetRecord>(
                    'SELECT Id, Name, Label FROM PermissionSet WHERE IsOwnedByProfile = false',
                    { cwd: workspaceRoot, targetOrg }
                )
        );
        records = payload.records;
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to list permission sets: ${(err as Error).message}`);
        return;
    }

    if (records.length === 0) {
        vscode.window.showInformationMessage('No custom permission sets found in the org.');
        return;
    }

    const selected = await vscode.window.showQuickPick(
        records.map((r) => ({
            label: r.Label,
            description: r.Name,
            id: r.Id,
            name: r.Name
        })),
        {
            placeHolder: 'Select a permission set to delete',
            title: 'Delete Permission Set'
        }
    );
    if (!selected) {
        return;
    }

    const permSetId = selected.id;
    const permSetName = selected.name;

    const config = vscode.workspace.getConfiguration('sf-ext-plus');
    const deleteMetadataFileInspect = config.inspect<boolean>('deletePermissionSet.deleteMetadataFile');
    let deleteMetadataFile: boolean;
    if (
        deleteMetadataFileInspect?.globalValue !== undefined ||
        deleteMetadataFileInspect?.workspaceValue !== undefined
    ) {
        deleteMetadataFile = config.get('deletePermissionSet.deleteMetadataFile', false);
    } else {
        const choice = await vscode.window.showQuickPick(
            [
                { label: 'No', value: false },
                { label: 'Yes', value: true }
            ],
            {
                placeHolder: 'Delete permission set metadata file from project?',
                title: 'Delete Permission Set Metadata'
            }
        );
        if (choice === undefined) {
            return;
        }
        deleteMetadataFile = choice.value;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Deleting permission set...',
            cancellable: false
        },
        async (progress) => {
            progress.report({ message: 'Unassigning permission set...' });

            let assignmentRecords: PermissionSetAssignmentRecord[];
            try {
                const assignPayload = await runSfDataQuery<PermissionSetAssignmentRecord>(
                    `SELECT Id FROM PermissionSetAssignment WHERE PermissionSetId = '${permSetId}'`,
                    { cwd: workspaceRoot, targetOrg }
                );
                assignmentRecords = assignPayload.records;
            } catch (err) {
                vscode.window.showErrorMessage(
                    `Failed to query permission set assignments: ${(err as Error).message}`
                );
                return;
            }

            for (const assignment of assignmentRecords) {
                try {
                    await runSfDeleteRecord(
                        'PermissionSetAssignment',
                        assignment.Id,
                        targetOrg,
                        workspaceRoot
                    );
                } catch (err) {
                    vscode.window.showErrorMessage(
                        `Failed to unassign permission set: ${(err as Error).message}`
                    );
                    return;
                }
            }

            progress.report({ message: 'Deleting permission set...' });

            try {
                await runSfDeleteRecord('PermissionSet', permSetId, targetOrg, workspaceRoot);
            } catch (err) {
                vscode.window.showErrorMessage(
                    `Failed to delete permission set: ${(err as Error).message}`
                );
                return;
            }

            if (deleteMetadataFile) {
                progress.report({ message: 'Deleting metadata file...' });
                const [camelCase, lowercase] = await Promise.all([
                    vscode.workspace.findFiles('**/*.permissionSet-meta.xml'),
                    vscode.workspace.findFiles('**/*.permissionset-meta.xml')
                ]);
                const uris = [...camelCase];
                for (const u of lowercase) {
                    if (!uris.some((e) => e.toString() === u.toString())) {
                        uris.push(u);
                    }
                }
                const toDelete = getPermissionSetMetadataFileUrisToDelete(uris, permSetName);
                for (const uri of toDelete) {
                    try {
                        await vscode.workspace.fs.delete(uri, { recursive: false });
                    } catch (err) {
                        vscode.window.showErrorMessage(
                            `Permission set deleted in org, but failed to delete metadata file: ${(err as Error).message}`
                        );
                    }
                }
            }

            vscode.window.showInformationMessage(
                `Permission set "${selected.label}" (${permSetName}) was deleted.`
            );
        }
    );
}
