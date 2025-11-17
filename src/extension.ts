import * as vscode from 'vscode';
import { activate as activateLabelsAutoComplete } from './commands/labels/load';
import { activateLabelCreateOnPalette } from './commands/labels/create';
import { activate as activatePermissionSetCommands } from './commands/permsets/main';
import { activate as activeProjectFileWatcher } from './commands/appversion/main';
import { activate as activatePackageCommands } from './commands/packaging/main';
import { activate as activateFieldsCommands } from './commands/fields/main';
import { activate as activateSoqlPreviewCommands } from './commands/soql/preview/main';
import { activate as activateUserManagementCommands } from './commands/userenablement/main';
import { activate as sObjectPreviewCommands } from './commands/objects/main';

export function activate(context: vscode.ExtensionContext) {
    activateLabelFeatures(context);
    activatePermissionSetFeatures(context);
    activateWatcherFeatures();
    activatePackageFeatures(context);
    activateFieldFeatures(context);
    activateSoqlPreviewFeatures(context);
    activateUserManagementFeatures(context);
    activateSObjectPreviewFeatures(context);
}

// Label-related features
function activateLabelFeatures(context: vscode.ExtensionContext) {
    activateLabelsAutoComplete(context);
    activateLabelCreateOnPalette(context);
}

// Permission set-related features
function activatePermissionSetFeatures(context: vscode.ExtensionContext) {
    activatePermissionSetCommands(context);
}

// Watcher-related features
function activateWatcherFeatures() {
    activeProjectFileWatcher();
}

// Packaging-related features
function activatePackageFeatures(context: vscode.ExtensionContext) {
    activatePackageCommands(context);
}

// Field-related features
function activateFieldFeatures(context: vscode.ExtensionContext) {
    activateFieldsCommands(context);
}

// SOQL preview-related features
function activateSoqlPreviewFeatures(context: vscode.ExtensionContext) {
    activateSoqlPreviewCommands(context);
}

// User management-related features
function activateUserManagementFeatures(context: vscode.ExtensionContext) {
    activateUserManagementCommands(context);
}

// SObject preview-related features
function activateSObjectPreviewFeatures(context: vscode.ExtensionContext) {
    sObjectPreviewCommands(context);
}
