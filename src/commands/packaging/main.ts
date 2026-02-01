// loads the command and loads the permission sets at the target org
import * as vscode from 'vscode';
import labels from '../../labels';
import { checkIfWorkspaceIsValidSfdxProject, executeShellCommand } from '../shared/utilities';

const COMMAND_NAME = 'packaging';

export async function activate(context: vscode.ExtensionContext) {
    const commands = await vscode.commands.getCommands(true);

    if (!checkIfWorkspaceIsValidSfdxProject()) {
        vscode.window.showErrorMessage('This command can only be run in a Salesforce DX project. Please open a valid Salesforce DX project.');
        return;
    }

    if (commands.includes(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`)) {
        return;
    }

    vscode.commands.registerCommand(`${labels.misc.EXTENSION_NAME}.${COMMAND_NAME}`, () => loadPackageCommand(context));
}

async function loadPackageCommand(_context: vscode.ExtensionContext) {
    // load package commands from the org using the force cli
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder found. Please open a workspace folder.');
        return;
    }

    // show options for package commands
    const packageCommandOptions = [
        { label: 'Create Package', value: 'create' },
        { label: 'Create Package Version', value: 'create-version' },
        { label: 'Promote Package Version', value: 'promote' },
        { label: 'Delete Package', value: 'delete' },
        { label: 'Delete Package Version', value: 'delete-version' },
        { label: 'Install Package', value: 'install' },
        { label: 'List Packages', value: 'list' },
        { label: 'Uninstall Package', value: 'uninstall' },
    ];

    const selectedPackageCommand = await vscode.window.showQuickPick(packageCommandOptions, {
        placeHolder: 'Select a package command to execute',
        ignoreFocusOut: true
    });

    if (!selectedPackageCommand) {
        return;
    }

    switch (selectedPackageCommand.value) {
        case 'create':
            createPackage();
            break;
        case 'create-version':
            createPackageVersion();
            break;
        case 'promote':
            promotePackageVersion();
            break;
        case 'delete':
            deletePackage();
            break;
        case 'delete-version':
            deletePackageVersion();
            break;
        case 'install':
            installPackage();
            break;
        case 'list':
            listPackages();
            break;
        case 'uninstall':
            uninstallPackage();
            break;
        default:
            vscode.window.showErrorMessage('Invalid package command selected.');
            break;
    }
}

async function installPackage() {
    // prompt for the package id
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID to install',
        placeHolder: 'Package ID (04t...)',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }

    let compileAllOption = await vscode.window.showQuickPick([
        { label: 'Package only', value: 'package' },
        { label: 'Everything', value: 'all' }
    ], {
        placeHolder: 'Compile everything in the org, or just the package content?',
        ignoreFocusOut: true
    });

    if (!compileAllOption) {
        return;
    }

    let securityTypeOption = await vscode.window.showQuickPick([
        { label: 'Admin Only', value: 'AdminsOnly' },
        { label: 'All Users', value: 'AllUsers' }
    ], {
        placeHolder: 'Select the security type for the package',
        ignoreFocusOut: true
    });

    if (!securityTypeOption) {
        return;
    }

    // DeprecateOnly|Mixed|Delete
    let upgradeType = await vscode.window.showQuickPick([
        { label: 'Mixed', value: 'Mixed' },
        { label: 'Deprecate Only', value: 'DeprecateOnly' },
        { label: 'Delete', value: 'Delete' }
    ], {
        placeHolder: 'Select the upgrade type for the package',
        ignoreFocusOut: true
    });

    if (!upgradeType) {
        return;
    }

    // execute the install command
    const installCommand = `sf package install --package ${packageId} --apex-compile="${compileAllOption.value}" --security-type="${securityTypeOption.value}" --upgrade-type="${upgradeType.value}" --wait 5 --no-prompt --json`;

    const showInstallingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing package ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });
        let intervalId;

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds (5 minutes)
            const totalWaitTimeMs = 5 * 60 * 1000;

            intervalId = setInterval(() => {
                // Calculate the current progress percentage (0-95) based on the 5-minute wait time
                const elapsedTime = Date.now() - startTime;
                const currentProgress = Math.min(Math.floor((elapsedTime / totalWaitTimeMs) * 95), 95);

                // Calculate the increment since last update
                const incrementDelta = currentProgress - previousIncrement;

                if (incrementDelta > 0) {
                    previousIncrement = currentProgress;
                    progress.report({ increment: incrementDelta });
                }
            }, 1000);

            const installResult = await executeShellCommand(installCommand);
            const installResultJson = JSON.parse(installResult);

            let message = `Package ${packageId} installed successfully.`;

            if (installResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package ${packageId} installed successfully.`);
            } else {
                message = `Failed to install package ${packageId}: ${installResultJson.message}`;
                vscode.window.showErrorMessage(`Failed to install package ${packageId}: ${installResultJson.message}`);
            }

            setTimeout(() => {
                progress.report({ increment: 100 });
            }, 250);
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        } finally {
            intervalId && clearInterval(intervalId);
        }
    });
}

interface PackageQuickPickItem extends vscode.QuickPickItem {
    label: string;
    description: string;
    detail: string;
}

async function listPackages() {
    // execute the list command
    const listCommand = `sf package installed list --json`;
    const MINUTES = 1;
    let intervalId: NodeJS.Timeout | undefined;
    let packageList: PackageQuickPickItem[] = [];

    const showListingPackagesProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Listing packages in org...',
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds (1 minute)
            const totalWaitTimeMs = MINUTES * 60 * 1000;

            intervalId = setInterval(() => {
                // Calculate the current progress percentage (0-95) based on the 5-minute wait time
                const elapsedTime = Date.now() - startTime;
                const currentProgress = Math.min(Math.floor((elapsedTime / totalWaitTimeMs) * 95), 95);

                // Calculate the increment since last update
                const incrementDelta = currentProgress - previousIncrement;

                if (incrementDelta > 0) {
                    previousIncrement = currentProgress;
                    progress.report({ increment: incrementDelta });
                }
            }, 1000);

            const listResult = await executeShellCommand(listCommand);
            const listResultJson = JSON.parse(listResult);

            if (listResultJson.status === 0) {
                progress.report({ increment: 100, message: 'Done' });
                intervalId && clearInterval(intervalId);

                vscode.window.showInformationMessage('Packages listed successfully.');

                // show listed packages as quick pick
                packageList = listResultJson.result.map((pkg: any) => ({
                    label: pkg.SubscriberPackageName,
                    description: pkg.SubscriberPackageVersionId,
                    detail: `Version: ${pkg.SubscriberPackageVersionNumber} ${pkg.SubscriberPackageNamespace !== null ? `(${pkg.SubscriberPackageNamespace})` : ''}`
                }));

                const selectedPackage = await vscode.window.showQuickPick(packageList, {
                    placeHolder: 'Select a package to copy its ID',
                    ignoreFocusOut: true
                });

                if (selectedPackage) {
                    // Copy the package ID to the clipboard
                    await vscode.env.clipboard.writeText(selectedPackage.description);

                    // Show a message indicating the package ID has been copied
                    vscode.window.showInformationMessage(`Copied to clipboard the package's Id: ${selectedPackage.label} (${selectedPackage.description})`);
                }
            } else {
                vscode.window.showErrorMessage(`Failed to list packages: ${listResultJson.message}`);
            }
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        }
    });

    showListingPackagesProgressNotification.then(() => {
        intervalId && clearInterval(intervalId);
    });
}

async function uninstallPackage() {
    // prompt for the package id
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID to uninstall',
        placeHolder: 'Package ID (04t...)',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }
    let intervalId: NodeJS.Timeout;

    // execute the uninstall command
    const uninstallCommand = `sf package uninstall --package ${packageId} --wait 5 --json`;

    const showUninstallingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Uninstalling package ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds (5 minutes)
            const totalWaitTimeMs = 5 * 60 * 1000;

            intervalId = setInterval(() => {
                // Calculate the current progress percentage (0-95) based on the 5-minute wait time
                const elapsedTime = Date.now() - startTime;
                const currentProgress = Math.min(Math.floor((elapsedTime / totalWaitTimeMs) * 95), 95);

                // Calculate the increment since last update
                const incrementDelta = currentProgress - previousIncrement;

                if (incrementDelta > 0) {
                    previousIncrement = currentProgress;
                    progress.report({ increment: incrementDelta });
                }
            }, 1000);

            const uninstallResult = await executeShellCommand(uninstallCommand);
            const uninstallResultJson = JSON.parse(uninstallResult);

            let message = `Package ${packageId} uninstalled successfully.`;

            if (uninstallResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package ${packageId} uninstalled successfully.`);
            } else {
                message = `Failed to uninstall package ${packageId}: ${uninstallResultJson.message}`;
                vscode.window.showErrorMessage(`Failed to uninstall package ${packageId}: ${uninstallResultJson.message}`);
            }

            setTimeout(() => {
                progress.report({ increment: 100 });
            }, 250);
        } catch (error) {
            console.error(error);
            progress.report({ increment: 100, message: 'Done' });
        }
    });

    showUninstallingPackageProgressNotification.then(() => {
        intervalId && clearInterval(intervalId);
    });
}

async function getDevHubUsername(): Promise<string | undefined> {
    const devHubUsername = await vscode.window.showInputBox({
        prompt: 'Enter the Dev Hub username or alias',
        placeHolder: 'e.g. myDevHub@example.com or myDevHubAlias',
        ignoreFocusOut: true
    });

    return devHubUsername;
}

async function createPackage() {
    // Prompt for package name
    const packageName = await vscode.window.showInputBox({
        prompt: 'Enter the package name',
        placeHolder: 'e.g. MyPackage',
        ignoreFocusOut: true
    });

    if (!packageName) {
        return;
    }

    // Prompt for package description (optional)
    const packageDescription = await vscode.window.showInputBox({
        prompt: 'Enter the package description (optional)',
        placeHolder: 'e.g. My package description',
        ignoreFocusOut: true
    });

    // Prompt for package type
    const packageTypeOption = await vscode.window.showQuickPick([
        { label: 'Unlocked', value: 'Unlocked' },
        { label: 'Managed', value: 'Managed' }
    ], {
        placeHolder: 'Select the package type',
        ignoreFocusOut: true
    });

    if (!packageTypeOption) {
        return;
    }

    // Prompt for source path
    const sourcePath = await vscode.window.showInputBox({
        prompt: 'Enter the source path',
        placeHolder: 'e.g. force-app',
        value: 'force-app',
        ignoreFocusOut: true
    });

    if (!sourcePath) {
        return;
    }

    // Prompt for dev hub
    const devHubUsername = await getDevHubUsername();
    if (!devHubUsername) {
        return;
    }

    // Build command
    let createCommand = `sf package create --name "${packageName}" --package-type ${packageTypeOption.value} --path "${sourcePath}" --target-dev-hub "${devHubUsername}" --json`;

    if (packageDescription) {
        createCommand = `sf package create --name "${packageName}" --description "${packageDescription}" --package-type ${packageTypeOption.value} --path "${sourcePath}" --target-dev-hub "${devHubUsername}" --json`;
    }

    const showCreatingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creating package ${packageName}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const createResult = await executeShellCommand(createCommand);
            const createResultJson = JSON.parse(createResult);

            if (createResultJson.status === 0) {
                const packageId = createResultJson.result?.Id || 'N/A';
                vscode.window.showInformationMessage(`Package ${packageName} created successfully. Package ID: ${packageId}`);

                // Copy package ID to clipboard
                if (packageId !== 'N/A') {
                    await vscode.env.clipboard.writeText(packageId);
                }
            } else {
                vscode.window.showErrorMessage(`Failed to create package: ${createResultJson.message || 'Unknown error'}`);
            }

            progress.report({ increment: 100, message: 'Done' });
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create package: ${errorMessage}`);
            progress.report({ increment: 100, message: 'Done' });
        }
    });
}

async function createPackageVersion() {
    // Prompt for package ID or alias
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID or alias',
        placeHolder: 'e.g. 0Ho... or packageAlias',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }

    // Prompt for source path
    const sourcePath = await vscode.window.showInputBox({
        prompt: 'Enter the source path',
        placeHolder: 'e.g. force-app',
        value: 'force-app',
        ignoreFocusOut: true
    });

    if (!sourcePath) {
        return;
    }

    // Prompt for installation key bypass
    const installationKeyBypassOption = await vscode.window.showQuickPick([
        { label: 'Yes', value: 'yes' },
        { label: 'No', value: 'no' }
    ], {
        placeHolder: 'Bypass installation key?',
        ignoreFocusOut: true
    });

    if (!installationKeyBypassOption) {
        return;
    }

    // Prompt for wait time
    const waitTimeInput = await vscode.window.showInputBox({
        prompt: 'Enter wait time in minutes',
        placeHolder: 'e.g. 10',
        value: '10',
        ignoreFocusOut: true
    });

    if (!waitTimeInput) {
        return;
    }

    const waitTime = parseInt(waitTimeInput, 10);
    if (isNaN(waitTime) || waitTime < 1) {
        vscode.window.showErrorMessage('Invalid wait time. Please enter a number greater than 0.');
        return;
    }

    // Prompt for dev hub
    const devHubUsername = await getDevHubUsername();
    if (!devHubUsername) {
        return;
    }

    // Build command
    let createVersionCommand = `sf package version create --package "${packageId}" --path "${sourcePath}" --wait ${waitTime} --target-dev-hub "${devHubUsername}" --json`;

    if (installationKeyBypassOption.value === 'yes') {
        createVersionCommand = `sf package version create --package "${packageId}" --path "${sourcePath}" --installation-key-bypass --wait ${waitTime} --target-dev-hub "${devHubUsername}" --json`;
    }

    const showCreatingPackageVersionProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creating package version for ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });
        let intervalId: NodeJS.Timeout | undefined;

        try {
            const startTime = Date.now();
            let previousIncrement = 0;

            // Calculate total wait time in milliseconds
            const totalWaitTimeMs = waitTime * 60 * 1000;

            intervalId = setInterval(() => {
                const elapsedTime = Date.now() - startTime;
                const currentProgress = Math.min(Math.floor((elapsedTime / totalWaitTimeMs) * 95), 95);

                const incrementDelta = currentProgress - previousIncrement;

                if (incrementDelta > 0) {
                    previousIncrement = currentProgress;
                    progress.report({ increment: incrementDelta });
                }
            }, 1000);

            const createVersionResult = await executeShellCommand(createVersionCommand);
            const createVersionResultJson = JSON.parse(createVersionResult);

            if (createVersionResultJson.status === 0) {
                const packageVersionId = createVersionResultJson.result?.SubscriberPackageVersionId || 'N/A';
                vscode.window.showInformationMessage(`Package version created successfully. Package Version ID: ${packageVersionId}`);

                // Copy package version ID to clipboard
                if (packageVersionId !== 'N/A') {
                    await vscode.env.clipboard.writeText(packageVersionId);
                }
            } else {
                vscode.window.showErrorMessage(`Failed to create package version: ${createVersionResultJson.message || 'Unknown error'}`);
            }

            setTimeout(() => {
                progress.report({ increment: 100 });
            }, 250);
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create package version: ${errorMessage}`);
            progress.report({ increment: 100, message: 'Done' });
        } finally {
            intervalId && clearInterval(intervalId);
        }
    });
}

async function promotePackageVersion() {
    // Prompt for package version ID
    const packageVersionId = await vscode.window.showInputBox({
        prompt: 'Enter the package version ID to promote',
        placeHolder: 'e.g. 04t...',
        ignoreFocusOut: true
    });

    if (!packageVersionId) {
        return;
    }

    // Prompt for dev hub
    const devHubUsername = await getDevHubUsername();
    if (!devHubUsername) {
        return;
    }

    // Build command
    const promoteCommand = `sf package version promote --package "${packageVersionId}" --target-dev-hub "${devHubUsername}" --json`;

    const showPromotingPackageVersionProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Promoting package version ${packageVersionId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const promoteResult = await executeShellCommand(promoteCommand);
            const promoteResultJson = JSON.parse(promoteResult);

            if (promoteResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package version ${packageVersionId} promoted successfully.`);
            } else {
                vscode.window.showErrorMessage(`Failed to promote package version: ${promoteResultJson.message || 'Unknown error'}`);
            }

            progress.report({ increment: 100, message: 'Done' });
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to promote package version: ${errorMessage}`);
            progress.report({ increment: 100, message: 'Done' });
        }
    });
}

async function deletePackage() {
    // Prompt for package ID
    const packageId = await vscode.window.showInputBox({
        prompt: 'Enter the package ID to delete',
        placeHolder: 'e.g. 0Ho...',
        ignoreFocusOut: true
    });

    if (!packageId) {
        return;
    }

    // Show warning and confirmation
    const confirmation = await vscode.window.showQuickPick([
        { label: 'Yes, delete the package', value: 'yes' },
        { label: 'No, cancel', value: 'no' }
    ], {
        placeHolder: `WARNING: This will delete the package ${packageId}. Make sure all package versions are deleted first. Continue?`,
        ignoreFocusOut: true
    });

    if (!confirmation || confirmation.value === 'no') {
        return;
    }

    // Prompt for dev hub
    const devHubUsername = await getDevHubUsername();
    if (!devHubUsername) {
        return;
    }

    // Build command
    const deleteCommand = `sf package delete --package "${packageId}" --target-dev-hub "${devHubUsername}" --json`;

    const showDeletingPackageProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Deleting package ${packageId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const deleteResult = await executeShellCommand(deleteCommand);
            const deleteResultJson = JSON.parse(deleteResult);

            if (deleteResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package ${packageId} deleted successfully.`);
            } else {
                vscode.window.showErrorMessage(`Failed to delete package: ${deleteResultJson.message || 'Unknown error'}`);
            }

            progress.report({ increment: 100, message: 'Done' });
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to delete package: ${errorMessage}`);
            progress.report({ increment: 100, message: 'Done' });
        }
    });
}

async function deletePackageVersion() {
    // Prompt for package version ID
    const packageVersionId = await vscode.window.showInputBox({
        prompt: 'Enter the package version ID to delete',
        placeHolder: 'e.g. 04t...',
        ignoreFocusOut: true
    });

    if (!packageVersionId) {
        return;
    }

    // Show warning and confirmation
    const confirmation = await vscode.window.showQuickPick([
        { label: 'Yes, delete the package version', value: 'yes' },
        { label: 'No, cancel', value: 'no' }
    ], {
        placeHolder: `WARNING: This action is irreversible. Package version ${packageVersionId} will be permanently deleted. Continue?`,
        ignoreFocusOut: true
    });

    if (!confirmation || confirmation.value === 'no') {
        return;
    }

    // Prompt for dev hub
    const devHubUsername = await getDevHubUsername();
    if (!devHubUsername) {
        return;
    }

    // Build command
    const deleteVersionCommand = `sf package version delete --package "${packageVersionId}" --target-dev-hub "${devHubUsername}" --json`;

    const showDeletingPackageVersionProgressNotification = vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Deleting package version ${packageVersionId}...`,
        cancellable: false
    }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
        progress.report({ increment: 0 });

        try {
            const deleteVersionResult = await executeShellCommand(deleteVersionCommand);
            const deleteVersionResultJson = JSON.parse(deleteVersionResult);

            if (deleteVersionResultJson.status === 0) {
                vscode.window.showInformationMessage(`Package version ${packageVersionId} deleted successfully.`);
            } else {
                vscode.window.showErrorMessage(`Failed to delete package version: ${deleteVersionResultJson.message || 'Unknown error'}`);
            }

            progress.report({ increment: 100, message: 'Done' });
        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to delete package version: ${errorMessage}`);
            progress.report({ increment: 100, message: 'Done' });
        }
    });
}
