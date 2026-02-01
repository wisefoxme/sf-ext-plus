// loads the command and loads the permission sets at the target org
import * as vscode from 'vscode';
import * as cp from 'child_process';
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
        const loadLabelsCommand = vscode.commands.registerCommand(assignCmd, loadPermissionSets);
        context.subscriptions.push(loadLabelsCommand);
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

async function loadPermissionSets() {
    // load permission sets from the org using the force cli
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');

        return;
    }

    // load user id if necessary
    if (!salesforceUserId) {
        await getSalesforceUserId();
    }

    // load the permission sets after getting the user ID
    assignPermissionSets(await getPermissionSetsAvailableForAssignment());
}

class PermissionSetQuickPickImpl implements vscode.QuickPickItem {
    label: string;
    description: string;
    value: string;

    constructor(label: string, description: string, value: string) {
        this.label = label;
        this.description = description;
        this.value = value;
    }
}

/**
 * Get the list of available permission sets in the org
 */
async function getPermissionSetsAvailableForAssignment() {
    if (!salesforceUserId) {
        vscode.window.showErrorMessage('User ID not found. Please load the permission sets again.');

        return [];
    }

    setStatusBarText(`Loading permission sets...`);

    const command = `sf data query --query "SELECT Id, Label, Name, NamespacePrefix FROM PermissionSet WHERE Id NOT IN (SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '${salesforceUserId}') AND IsOwnedByProfile = FALSE" --json`;
    const queryResult = JSON.parse(await executeShellCommand(command));

    if (queryResult.status !== 0) {
        vscode.window.showErrorMessage(`Failed to get permission sets: ${queryResult.message}`);

        return [];
    }

    const permSetsNotAssignedMessage = `Read ${queryResult.result.records.length} permission sets from the org that are NOT assigned to you.`;

    setStatusBarText(permSetsNotAssignedMessage);

    // show options on the command palette so the user can select one or more permissions to assign to themselves
    const permissionSetOptions = queryResult.result.records.map((record: { Label: string, NamespacePrefix: string, Name: string }) => {
        const label = record.Label;
        const description = record.NamespacePrefix ? `${record.NamespacePrefix}.${record.Name}` : record.Name;
        const value = record.Name;

        return new PermissionSetQuickPickImpl(label, description, value);
    });

    const selectedItems = await vscode.window.showQuickPick<PermissionSetQuickPickImpl>(permissionSetOptions, {
        placeHolder: 'Select permission sets to assign to your user',
        canPickMany: true
    });

    if (!selectedItems) {
        vscode.window.showInformationMessage('No permission sets selected.');
        clearAndHideStatusBarText();

        return [];
    }

    return selectedItems.map(psItem => psItem.value);
}

async function assignPermissionSets(permissionSetNames: string[]) {
    const assignCommand = `sf org assign permset ${permissionSetNames.map(psName => { return `--name ${psName}`; }).join(' ')} --json`;

    setStatusBarText(`Assigning permission sets...`);

    const assignCommandResult = JSON.parse(await executeShellCommand(assignCommand));

    if (assignCommandResult.status === 1) {
        vscode.window.showErrorMessage(`Failed to assign permission sets: ${assignCommandResult.message}`);
        clearAndHideStatusBarText();

        return;
    }

    // clean up status bar
    clearAndHideStatusBarText();

    // if status code is 0 all permission sets were assigned, otherwise some were not

    if (assignCommandResult.status === 0) {
        vscode.window.showInformationMessage(`Assigned ${permissionSetNames.length} permission sets to ${salesforceUserId}.`);
    } else {
        const failureMessages = assignCommandResult.result.failures.map((failure: { message: string }) => failure.message).join(', ');

        vscode.window.showWarningMessage(`Some permission sets were not assigned: ${failureMessages}`);
    }

    if (assignCommandResult.warnings && assignCommandResult.warnings.length > 0) {
        const warningMessages = assignCommandResult.warnings.map((warning: { message: string }) => warning.message).join(', ');

        vscode.window.showWarningMessage(`The CLI has some warnings: ${warningMessages}`);
    }
}

async function getSalesforceUserId() {
    const command = `sf org display user --json`;

    setStatusBarText(`Getting user ID...`);

    const result = JSON.parse(await executeShellCommand(command));

    if (result.status !== 0) {
        vscode.window.showErrorMessage(`Failed to get user info: ${result.message}`);
        clearAndHideStatusBarText();

        return;
    }

    salesforceUserId = result.result.id;

    if (!salesforceUserId) {
        vscode.window.showErrorMessage(`Failed to get user ID. Please load the permission sets again.`);
        clearAndHideStatusBarText();

        return;
    }

    setStatusBarText(`Identified user ${salesforceUserId}`);

    return salesforceUserId;
}
