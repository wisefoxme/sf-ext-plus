![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/wisefox.sf-ext-plus?link=https://marketplace.visualstudio.com/items?itemName=wisefox.sf-ext-plus&cacheSeconds=3600) ![Visual Studio Marketplace Release Date](https://img.shields.io/visual-studio-marketplace/release-date/wisefox.sf-ext-plus?link=https://marketplace.visualstudio.com/items?itemName=wisefox.sf-ext-plus&cacheSeconds=28800) ![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/stars/wisefox.sf-ext-plus?link=https://marketplace.visualstudio.com/items?itemName=wisefox.sf-ext-plus&cacheSeconds=28800) ![GitHub License](https://img.shields.io/github/license/renatoliveira/sf-ext-plus?cacheSeconds=28800)

# Salesforce Extension Plus

The extension provides some tools to enhance the Salesforce development experience in Visual Studio Code. It is a collection of useful features that can help developers work more efficiently with Salesforce projects and that are not included in the official Salesforce Extension pack.

As of 2025-04-16 the extension is in not in beta, but is still limited in functionality. Some features should be added in the future, but for now it centers on providing some assistance for working with custom labels in an Salesforce project workspace.

## Features

### Custom Labels

#### Use labels from your custom label files

Autocomplete is enabled for labels in Apex (`.cls`) files. Whenever you type `Label.` you'll see a list of labels available according to the custom label metadata files in your project's directory.

This feature is useful for developers who want to quickly access and use custom labels in their Apex code without having to manually type out the label names.

#### View custom label information on hover

When you hover over a custom label in your Apex code, you'll see a tooltip that provides information about the label, including its name and value. This feature is useful for developers who want to quickly reference the details of a custom label without having to navigate to the custom label metadata file.

#### Create custom labels from the command palette

You can create custom labels directly from the command palette. This feature allows you to quickly add new custom labels to your project without having to manually edit the metadata file or use the UI in Salesforce.

The command to create a custom label is `Salesforce Ext. Plus: Create Custom Label`. When you run this command, you'll be prompted to enter the label name and value. The extension will then create a new custom label metadata file with the specified name and value.

#### Quickly create custom labels from the Code Action menu

Whenever you have a string selected in Apex, once you get code suggestions with `Ctrl + .` (or `Cmd + .` on Mac), you'll see a new option called "Create Custom Label". This feature allows you to quickly create a custom label from a selected string in your Apex code. When you select this option, the extension will prompt you to enter the label name and value, and it will create a new custom label entry on the metadata file with the specified name and value.

### Permission Sets

#### Quickly assign permission sets to your running user without having to use the Salesforce CLI

Sometimes, when working with scratch orgs specifically, you might not want to assign all permission sets your team is dealing with at once. This is especially true when you are working with a scratch org and you want to test a specific feature or functionality. The extension provides a command that allows you to quickly assign permission sets to your running user without having to use the Salesforce CLI. The command uses the CLI to gather your current user ID and then queries the permission sets on the org that are not assigned to your user yet. It then prompts you to select the permission sets you want to assign to your user. Once you make your selection, the extension will use the CLI to assign the selected permission sets to your user.

![Assign Permission Sets](images/features/permsetsQuickpick.png)

The extension shows the permission sets' labels, API names and namespaces, so you can easily identify the permission sets you want to assign.

#### JSON Settings

##### Namespace and label's default language

The extension reads the `package.json` file at the root of your SFDX project. There you may add some settings to customize the behavior of the extension. For example:

```json
// package.json
{
  "salesforce": {
    "namespace": "ns",
    "labels": {
      "defaultLanguage": "en_US"
    }
  }
}
```

- **Namespace**: Use this setting to specify a prefix for the labels you create with the command palette. This is useful for avoiding naming conflicts with existing labels in your project. By default, the extension won't add a prefix to the label name you enter in the command palette. If you want to use a prefix, you can specify it in the `namespace` setting

- **Default Language**: Use this setting to specify the default language for the custom labels you create with the command palette. By default, the extension will use `en_US` as the default language. If you want to use a different language, you can specify it in the `defaultLanguage` setting. The extension will create the custom label with the specified language and add it to the appropriate metadata file.

##### Customize the behavior when editing sfdx-project.json

- **copyProjectNameToPackageJson**: When set to `true`, the extension will automatically copy the project name from your Salesforce metadata to your `package.json` file. This ensures consistency between your Salesforce project and npm package naming. By default, this setting is `false`.

- **copyProjectDescriptionToPackageJson**: When set to `true`, the extension will automatically copy the project description from your Salesforce metadata to your `package.json` file. This helps maintain consistent documentation across your project files. By default, this setting is `false`.

- **copyVersionToPackageJson**: When set to `true`, the extension will automatically sync the version number from your Salesforce project to your `package.json` file. This ensures your npm package versioning stays aligned with your Salesforce project versioning. By default, this setting is `false`.

- **openCopiedField**: When set to `true`, the extension will automatically open the copied field in the editor after copying to the target object. This allows you to quickly verify and edit the copied information if needed. By default, this setting is `false`.

Example configuration:

```json
// package.json
{
  "salesforce": {
    "copyProjectNameToPackageJson": true,
    "copyProjectDescriptionToPackageJson": true,
    "copyVersionToPackageJson": true
  }
}
```

## Planned features

- Support for custom labels in Lightning Web Components (LWC) and Visualforce.
- Support for common custom field operations, such as creating, updating, and deleting custom fields.
  - Support for creating custom fields with specific attributes, such as required, unique, and external ID without having to open the Salesforce org's UI.
  - Automatically include the custom field in one or more permission sets (profiles will not supported because Salesforce is planing to somewhat "retire" them).
  - Support for modifying custom field types without having to delete and recreate the field.
- Flow support
  - Find and replace in Flow variables.
  - Find where a certain type, sobject or record type is used within a flow

## Authentication

![PGP](https://img.shields.io/badge/E7E772797687BC9A-%3F?style=flat&label=PGP&labelColor=orange&color=black&cacheSeconds=28800)

You'll find at the "signatures" folder signed files for the releases and for the license file, so you can verify that the author is indeed the one who signed the files. The key used to sign commits is available at [the author's keybase profile](https://keybase.io/thelavasailor).

### Verifying the signature

Files are signed using [Keybase](https://keybase.io/). With the keybase CLI installed locally you can verify the signatures using:

```
keybase verify --detached signatures/LICENSE.sig -i LICENSE
keybase verify --detached signatures/vscode-sf-ext-plus-[semver code].vsix.sig -i vscode-sf-ext-plus-[semver code].vsix
```
