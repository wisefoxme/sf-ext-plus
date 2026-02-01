/**
 * Permission editor: refresh permission metadata (profiles & permission sets) and toggle object/field permissions.
 */
import * as vscode from 'vscode';
import labels from '../../labels';
import { checkIfWorkspaceIsValidSfdxProject } from '../shared/utilities';
import { refreshPermissionMetadata } from './refresh';
import { runToggleObjectFieldPermissions } from './toggle';

const REFRESH_COMMAND_NAME = 'refreshPermissionMetadata';
const TOGGLE_COMMAND_NAME = 'toggleObjectFieldPermissions';

const CONFIG_SECTION = 'sf-ext-plus';
const CONFIG_KEY_REFRESH_INTERVAL = 'permissionMetadata.refreshIntervalMinutes';
const DEFAULT_REFRESH_INTERVAL_MINUTES = 15;
const FIRST_REFRESH_DELAY_MS = 8_000;
const MS_PER_MINUTE = 60_000;

let backgroundTimer: ReturnType<typeof setInterval> | undefined;

function getRefreshIntervalMinutes(): number {
    const value = vscode.workspace.getConfiguration(CONFIG_SECTION).get<number>(CONFIG_KEY_REFRESH_INTERVAL, DEFAULT_REFRESH_INTERVAL_MINUTES);
    return typeof value === 'number' && value >= 0 ? value : 0;
}

function scheduleBackgroundRefresh(context: vscode.ExtensionContext): void {
    if (backgroundTimer) {
        clearInterval(backgroundTimer);
        backgroundTimer = undefined;
    }
    const intervalMinutes = getRefreshIntervalMinutes();
    if (intervalMinutes <= 0) {
        return;
    }
    const intervalMs = intervalMinutes * MS_PER_MINUTE;
    const runRefresh = () => {
        if (!checkIfWorkspaceIsValidSfdxProject()) {
            return;
        }
        refreshPermissionMetadata(context, false).catch(() => {
            // Fail silently for background refresh
        });
    };
    setTimeout(runRefresh, FIRST_REFRESH_DELAY_MS);
    backgroundTimer = setInterval(runRefresh, intervalMs);
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const ext = labels.misc.EXTENSION_NAME;

    context.subscriptions.push(
        vscode.commands.registerCommand(`${ext}.${REFRESH_COMMAND_NAME}`, () => refreshPermissionMetadata(context, true))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(`${ext}.${TOGGLE_COMMAND_NAME}`, () => runToggleObjectFieldPermissions(context))
    );

    scheduleBackgroundRefresh(context);
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY_REFRESH_INTERVAL}`)) {
                scheduleBackgroundRefresh(context);
            }
        })
    );
    context.subscriptions.push({
        dispose: () => {
            if (backgroundTimer) {
                clearInterval(backgroundTimer);
                backgroundTimer = undefined;
            }
        }
    });
}
