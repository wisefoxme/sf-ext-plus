import * as cp from 'child_process';
import * as vscode from 'vscode';
import { getDefaultOrgUsername } from '../permissioneditor/refresh';
import { labelToDeveloperName } from './developerName';

const REST_API_VERSION = 'v59.0';
const CONFIG_SECTION = 'sf-ext-plus';
const CONFIG_KEY_RETRIEVE_AFTER_CREATE = 'createPermissionSet.retrieveAfterCreate';

export { labelToDeveloperName } from './developerName';

interface OrgDisplayResult {
    result?: { accessToken?: string; instanceUrl?: string };
    status?: number;
    message?: string;
}

function runSfOrgDisplay(targetOrg: string, cwd: string): Promise<OrgDisplayResult> {
    return new Promise((resolve, reject) => {
        const cmd = `sf org display --target-org ${JSON.stringify(targetOrg)} --json`;
        cp.exec(cmd, { cwd }, (err, stdout, stderr) => {
            let parsed: OrgDisplayResult = {};
            try {
                parsed = JSON.parse(stdout || '{}') as OrgDisplayResult;
            } catch {
                // ignore
            }
            if (err) {
                const msg = parsed.message ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Failed to get org details'));
            }
            resolve(parsed);
        });
    });
}

interface SfRetrievePayload {
    status?: number;
    message?: string;
}

function runSfProjectRetrieve(metadataType: string, apiName: string, targetOrg: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const metadata = `${metadataType}:${apiName}`;
        const cmd = `sf project retrieve start -m ${JSON.stringify(metadata)} --target-org ${JSON.stringify(targetOrg)} --json`;
        cp.exec(cmd, { cwd }, (err, stdout, stderr) => {
            let parsed: SfRetrievePayload = {};
            try {
                parsed = JSON.parse(stdout || '{}') as SfRetrievePayload;
            } catch {
                // ignore
            }
            if (err) {
                const msg = parsed.message ?? stderr?.trim() ?? err.message;
                return reject(new Error(msg));
            }
            if (parsed.status !== 0 && parsed.status !== undefined) {
                return reject(new Error(parsed.message ?? 'Retrieve failed'));
            }
            resolve();
        });
    });
}

export async function createPermissionSet(): Promise<void> {
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

    const label = await vscode.window.showInputBox({
        prompt: 'Label for the permission set',
        placeHolder: 'e.g. My Permission Set'
    });
    if (label === undefined || label.trim() === '') {
        return;
    }

    const suggestedName = labelToDeveloperName(label.trim());
    const name = await vscode.window.showInputBox({
        prompt: 'Developer Name (API Name)',
        placeHolder: 'e.g. My_Permission_Set',
        value: suggestedName
    });
    if (name === undefined || name.trim() === '') {
        return;
    }

    const description = await vscode.window.showInputBox({
        prompt: 'Description (optional)',
        placeHolder: 'e.g. Permission set for...',
        value: ''
    });
    if (description === undefined) {
        return;
    }

    const sessionRequiredPick = await vscode.window.showQuickPick(
        [{ label: 'No', value: false }, { label: 'Yes', value: true }],
        {
            placeHolder: 'Session Activation Required',
            title: 'Session Activation Required'
        }
    );
    if (sessionRequiredPick === undefined) {
        return;
    }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const retrieveSettingInspect = config.inspect<boolean>(CONFIG_KEY_RETRIEVE_AFTER_CREATE);
    const userSetRetrieve =
        retrieveSettingInspect?.globalValue !== undefined || retrieveSettingInspect?.workspaceValue !== undefined;

    let retrieveAfterCreate: boolean;
    if (userSetRetrieve) {
        retrieveAfterCreate = config.get<boolean>(CONFIG_KEY_RETRIEVE_AFTER_CREATE, true);
    } else {
        const retrievePick = await vscode.window.showQuickPick(
            [{ label: 'Yes', value: true }, { label: 'No', value: false }],
            {
                placeHolder: 'Retrieve permission set metadata after creating?',
                title: 'Retrieve metadata',
                ignoreFocusOut: true
            }
        );
        if (retrievePick === undefined) {
            return;
        }
        retrieveAfterCreate = retrievePick.value;
    }

    let orgDisplay: OrgDisplayResult;
    try {
        orgDisplay = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Getting org credentials...',
                cancellable: false
            },
            async () => runSfOrgDisplay(targetOrg, workspaceRoot)
        );
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to get org credentials: ${(err as Error).message}`);
        return;
    }

    const accessToken = orgDisplay.result?.accessToken;
    const instanceUrl = orgDisplay.result?.instanceUrl;
    if (!accessToken || !instanceUrl) {
        vscode.window.showErrorMessage('Could not get access token or instance URL from org.');
        return;
    }

    const url = `${instanceUrl.replace(/\/$/, '')}/services/data/${REST_API_VERSION}/sobjects/PermissionSet`;
    const body = {
        Label: label.trim(),
        Name: name.trim(),
        Description: description.trim(),
        HasActivationRequired: sessionRequiredPick.value
    };

    const trimmedName = name.trim();
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Creating permission set...',
            cancellable: false
        },
        async (progress) => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let message = response.statusText;
                try {
                    const errBody = (await response.json()) as
                        | { message?: string; errorCode?: string }[]
                        | { message?: string; error?: string; errorCode?: string };
                    if (Array.isArray(errBody) && errBody.length > 0) {
                        message = errBody.map((e) => e.message ?? e.errorCode ?? '').filter(Boolean).join('; ') || response.statusText;
                    } else if (errBody && typeof errBody === 'object' && !Array.isArray(errBody)) {
                        const obj = errBody as { message?: string; error?: string };
                        message = obj.message ?? obj.error ?? message;
                    }
                } catch {
                    // use statusText
                }
                vscode.window.showErrorMessage(`Failed to create permission set: ${message}`);
                return;
            }

            vscode.window.showInformationMessage(`Permission set "${label.trim()}" (${trimmedName}) was created.`);

            if (retrieveAfterCreate) {
                progress.report({ message: 'Retrieving permission set metadata...' });
                try {
                    await runSfProjectRetrieve('PermissionSet', trimmedName, targetOrg, workspaceRoot);
                    vscode.window.showInformationMessage(`Retrieved permission set metadata for ${trimmedName}.`);
                } catch (err) {
                    vscode.window.showErrorMessage(`Permission set created but retrieve failed: ${(err as Error).message}`);
                }
            }
        }
    );
}
