import * as vscode from 'vscode';
import labels from '../../labels';
import { clearAndHideStatusBarText, executeShellCommand, setStatusBarText, setUpStatusBarWidget } from '../shared/utilities';
import { createPermissionSet } from './create';
import { deletePermissionSet } from './delete';

const COMMAND_NAME = 'assignPermissionSets';
const CREATE_PERMISSION_SET_COMMAND = 'createPermissionSet';
const DELETE_PERMISSION_SET_COMMAND = 'deletePermissionSet';

let salesforceUserId: string | undefined = undefined;

export async function activate(context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);
    const assignCmd = `${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`;
    const createCmd = `${labels.misc.EXTENSION_NAME}.${CREATE_PERMISSION_SET_COMMAND}`;
    const deleteCmd = `${labels.misc.EXTENSION_NAME}.${DELETE_PERMISSION_SET_COMMAND}`;

    if (!commands.includes(assignCmd)) {
        const assignPermissionSetsCommand = vscode.commands.registerCommand(assignCmd, managePermissionSets);
        context.subscriptions.push(assignPermissionSetsCommand);
    }
    if (!commands.includes(createCmd)) {
        const createPermissionSetCommand = vscode.commands.registerCommand(createCmd, createPermissionSet);
        context.subscriptions.push(createPermissionSetCommand);
    }
    if (!commands.includes(deleteCmd)) {
        const deletePermissionSetCommand = vscode.commands.registerCommand(deleteCmd, deletePermissionSet);
        context.subscriptions.push(deletePermissionSetCommand);
    }

    setUpStatusBarWidget();
}

interface UserIdentity {
    id: string;
    username: string;
}

async function managePermissionSets() {
    // 1) make sure we're in a workspace
    if (!vscode.workspace.workspaceFolders) {
        vscode.window.showErrorMessage(
            'No workspace folder found. Please open a workspace folder.',
        );
        return;
    }

    // 2) pick target user
    const userScope = await vscode.window.showQuickPick(
        ['Current User', 'Other User'],
        { placeHolder: 'Operate on your current user or another active user?' },
    );
    if (!userScope) {
        return;
    }

    let targetUser: UserIdentity | undefined;
    if (userScope === 'Current User') {
        targetUser = await getCurrentUserIdentity();
    } else {
        targetUser = await pickAnotherActiveUserIdentity();
    }
    if (!targetUser) {
        return;
    }

    // 3) pick add vs remove
    const action = await vscode.window.showQuickPick(
        ['Add Permission Sets', 'Remove Permission Sets'],
        { placeHolder: 'Do you want to add or remove permission sets?' },
    );
    if (!action) {
        return;
    }

    // 4) fetch appropriate list of perm-sets
    let choices: string[] = [];
    if (action === 'Add Permission Sets') {
        choices = await getAvailablePermissionSets(targetUser.id);
    } else {
        choices = await getAssignedPermissionSets(targetUser.id);
    }
    if (choices.length === 0) {
        vscode.window.showInformationMessage(
            action === 'Add Permission Sets'
                ? 'No new permission sets to add.'
                : 'No permission sets to remove.',
        );
        return;
    }

    // 5) let user pick one or more
    const items = choices.map(
        (name) => new QuickPickItem(name, `PermissionSet/${name}`, name),
    );
    const picked = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder:
            action === 'Add Permission Sets'
                ? 'Select permission sets to assign'
                : 'Select permission sets to unassign',
    });
    if (!picked || picked.length === 0) {
        vscode.window.showInformationMessage('No permission sets selected.');
        return;
    }
    const names = picked.map((p) => p.value);

    console.log(`Names: ${names.join(', ')}`);

    // 6) run the right CLI call
    if (action === 'Add Permission Sets') {
        await assignPermissionSets(names, targetUser.username);
    } else {
        await unassignPermissionSets(names, targetUser.username);
    }

    // ───────────────────────────────────────────────────────────────────────────────
    // helpers & sub-routines
    // ───────────────────────────────────────────────────────────────────────────────

    class QuickPickItem implements vscode.QuickPickItem {
        constructor(
            public readonly label: string, // Name for display
            public readonly description: string, // Username or type for display
            public readonly value: string, // ID or unique value
        ) { }
    }

    interface UserInfoCliResult {
        status: number;
        result: {
            id: string;
            username: string;
            orgId: string;
            alias: string;
        };
        warnings?: { message: string }[];
    }

    async function getCurrentUserIdentity(): Promise<UserIdentity | undefined> {
        vscode.window.showInformationMessage('Getting current user info...');
        const raw = await executeShellCommand(`sf org display user --json`);
        const cmdResult: UserInfoCliResult = JSON.parse(raw) as UserInfoCliResult;
        if (cmdResult.status !== 0) {
            vscode.window.showErrorMessage(`Failed to get user.`);
            return;
        }
        console.log("Result: ", cmdResult);
        console.log(`Current user: ${cmdResult.result.username} (${cmdResult.result.id})`);
        return { id: cmdResult.result.id, username: cmdResult.result.username };
    }

    async function pickAnotherActiveUserIdentity(): Promise<UserIdentity | undefined> {
        vscode.window.showInformationMessage('Loading active users...');
        const raw = await executeShellCommand(
            `sf data query --query "SELECT Id, Name, Username FROM User WHERE IsActive = TRUE ORDER BY Name" --json`,
        );
        const res = JSON.parse(raw);
        if (res.status !== 0) {
            vscode.window.showErrorMessage(`Failed to list users: ${res.message}`);
            return;
        }

        const items = res.result.records.map(
            (u: { Id: string; Name: string; Username: string }) =>
                new QuickPickItem(u.Name, u.Username, u.Id), // label=Name, description=Username, value=Id
        );
        const picked = await vscode.window.showQuickPick<QuickPickItem>(items, {
            placeHolder: 'Select an active user',
        });
        // picked.value is the Id, picked.description is the Username
        return picked ? { id: picked.value, username: picked.description } : undefined;
    }

    async function getAvailablePermissionSets(
        userId: string,
    ): Promise<string[]> {
        console.log(`Querying unassigned permission sets for user ${userId}...`);
        vscode.window.showInformationMessage('Querying unassigned permission sets...');
        const soql =
            `SELECT Name, Label, NamespacePrefix FROM PermissionSet ` +
            `WHERE IsOwnedByProfile = FALSE AND Id NOT IN (` +
            ` SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${userId}'` +
            `)`;
        const raw = await executeShellCommand(
            `sf data query --query "${soql}" --json`,
        );
        const res = JSON.parse(raw);

        if (res.status !== 0) {
            vscode.window.showErrorMessage(`Query failed: ${res.message}`);
            return [];
        }
        return res.result.records.map((r: any) => r.Name as string);
    }

    async function getAssignedPermissionSets(userId: string): Promise<string[]> {
        vscode.window.showInformationMessage('Querying already-assigned permission sets...');
        const soql =
            `SELECT PermissionSet.Name FROM PermissionSetAssignment ` +
            `WHERE AssigneeId='${userId}'`;
        const raw = await executeShellCommand(
            `sf data query --query "${soql}" --json`,
        );
        const res = JSON.parse(raw);

        if (res.status !== 0) {
            vscode.window.showErrorMessage(`Query failed: ${res.message}`);
            return [];
        }
        return res.result.records.map(
            (r: { PermissionSet: { Name: string } }) => r.PermissionSet.Name,
        );
    }

    async function assignPermissionSets(
        names: string[],
        targetUsername: string,
    ): Promise<void> {
        console.log(`Assigning permission sets to user ${targetUsername}: ${names.join(', ')}`);
        vscode.window.showInformationMessage('Assigning permission sets...');
        const cmd =
            `sf org assign permset ` +
            names.map((n) => `--name "${n}"`).join(' ') + // Enclose names in quotes
            ` --on-behalf-of "${targetUsername}" --json`; // Use username
        console.log("Command: ", cmd);
        const raw = await executeShellCommand(cmd);
        const res = JSON.parse(raw);

        if (res.status !== 0) {
            vscode.window.showErrorMessage(`Assign failed: ${res.message || JSON.stringify(res)}`);
            return;
        }
        vscode.window.showInformationMessage(
            `Assigned ${names.length} permission sets to ${targetUsername}.`,
        );
        if (res.warnings?.length) {
            vscode.window.showWarningMessage(
                res.warnings.map((w: any) => w.message).join(', '),
            );
        }
    }

    async function unassignPermissionSets(
        names: string[], // Permission Set API names
        targetUsername: string,
    ): Promise<void> {
        vscode.window.showInformationMessage(
            `Attempting to remove ${names.length} permission set(s) from ${targetUsername}...`,
        );
        console.log(
            `Attempting to remove permission sets from user ${targetUsername}: ${names.join(', ')}`,
        );

        // 1. Query for PermissionSetAssignment IDs
        // Ensure names are properly quoted for the IN clause
        const nameList = names.map((n) => `'${n}'`).join(',');
        const querySoql =
            `SELECT Id FROM PermissionSetAssignment ` +
            `WHERE Assignee.Username = '${targetUsername}' AND PermissionSet.Name IN (${nameList})`;

        console.log(`Querying PermissionSetAssignments with SOQL: ${querySoql}`);
        vscode.window.showInformationMessage('Querying assignments to remove...');
        const queryRaw = await executeShellCommand(
            `sf data query --query "${querySoql}" --json`,
        );
        const queryRes = JSON.parse(queryRaw);

        if (queryRes.status !== 0 || !queryRes.result) {
            vscode.window.showErrorMessage(
                `Failed to query permission set assignments: ${queryRes.message || JSON.stringify(queryRes.warnings || queryRes.stack || queryRes.name || queryRes)}`,
            );
            return;
        }

        if (!queryRes.result.records || queryRes.result.records.length === 0) {
            vscode.window.showInformationMessage(
                `No matching permission set assignments found for ${targetUsername} with names: ${names.join(', ')}. No action taken.`,
            );
            return;
        }

        const assignmentIds: string[] = queryRes.result.records.map(
            (r: { Id: string }) => r.Id,
        );

        console.log(
            `Found ${assignmentIds.length} PermissionSetAssignment records to delete: ${assignmentIds.join(', ')}`,
        );

        // 2. Delete the PermissionSetAssignment records
        vscode.window.showInformationMessage(
            `Removing ${assignmentIds.length} permission set assignment(s)...`,
        );

        const idInClause = assignmentIds.map((id) => `'${id}'`).join(',');
        // The sf data record delete command only supports deleting one record at a time,
        // so we need to run one command per assignment ID.
        const deletePromises = assignmentIds.map(id => {
            const deleteCmd = `sf data record delete --sobject PermissionSetAssignment --where "Id=${id}" --json`;
            return executeShellCommand(deleteCmd)
                .then(raw => ({ id, raw }))
                .catch(error => ({ id, error }));
        });

        // Run all deletions in parallel
        const deleteResults = await Promise.all(deletePromises);

        // Aggregate results into a single response-like object for downstream logic
        const deleteResultsSummary = {
            status: 0,
            result: deleteResults.map(res => {
                if ('error' in res) {
                    return {
                        id: res.id,
                        success: false,
                        errors: [{ message: res.error instanceof Error ? res.error.message : String(res.error) }]
                    };
                }
                try {
                    const parsed = JSON.parse(res.raw);
                    return {
                        id: res.id,
                        success: parsed.status === 0,
                        errors: parsed.status === 0 ? [] : [{ message: parsed.message || JSON.stringify(parsed) }]
                    };
                } catch (e) {
                    return {
                        id: res.id,
                        success: false,
                        errors: [{ message: "Failed to parse delete response" }]
                    };
                }
            }),
            warnings: []
        };

        // The following block is now redundant and can be removed, since deletion is handled above.
        // console.log("Delete Command: ", deleteCmd);
        // let deleteRaw;
        // try {
        //     deleteRaw = await executeShellCommand(deleteCmd);
        // } catch (error) {
        //     // Handle any errors that occur during the delete command execution
        //     vscode.window.showErrorMessage(
        //         `Failed to execute delete command: ${error instanceof Error ? error.message : String(error)}`,
        //     );
        //     console.error("Delete command error: ", error);
        //     return;
        // }
        // const deleteRes = JSON.parse(deleteRaw);

        if (deleteResultsSummary.status !== 0) {
            // This usually indicates a command-level failure
            vscode.window.showErrorMessage(
                `Unassign command failed: ${JSON.stringify(deleteResultsSummary)}`,
            );
            return;
        }

        let successCount = 0;
        const errorDetails: string[] = [];

        if (deleteResultsSummary.result && Array.isArray(deleteResultsSummary.result)) {
            deleteResultsSummary.result.forEach(
                (item: {
                    id: string;
                    success: boolean;
                    errors: { statusCode?: string; message: string; fields?: string[] }[];
                }) => {
                    if (item.success) {
                        successCount++;
                    } else {
                        const errors = item.errors.map((e) => e.message).join(', ');
                        errorDetails.push(
                            `Failed for assignment ID ${item.id}: ${errors}`,
                        );
                        console.error(
                            `Failed to delete PermissionSetAssignment ID ${item.id}: ${errors}`,
                        );
                    }
                },
            );
        } else {
            // Fallback if result format is unexpected despite status 0
            vscode.window.showErrorMessage(
                `Unassign operation reported success, but response format was unexpected. Please verify in Salesforce.`,
            );
            console.error("Unexpected delete response format: ", deleteResultsSummary);
            return;
        }

        if (successCount === assignmentIds.length) {
            vscode.window.showInformationMessage(
                `Successfully removed ${successCount} permission set(s) from ${targetUsername}.`,
            );
        } else if (successCount > 0) {
            vscode.window.showWarningMessage(
                `Partially removed permission sets from ${targetUsername}. ` +
                `${successCount} succeeded, ${assignmentIds.length - successCount} failed.\n` +
                `Errors:\n${errorDetails.join('\n')}`,
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to remove any permission sets from ${targetUsername}.\n` +
                `Errors:\n${errorDetails.join('\n')}`,
            );
        }

        if (deleteResultsSummary.warnings && deleteResultsSummary.warnings.length > 0) {
            vscode.window.showWarningMessage(
                `Warnings during unassign: ${deleteResultsSummary.warnings.map((w: any) => w.message).join(', ')}`,
            );
        }
    }
}

