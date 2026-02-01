---
name: Create Permission Set Command
overview: Add a new command that creates a PermissionSet in the current Salesforce org via the Salesforce REST Data API, prompting the user for Label, Developer Name (with auto-generation from label), Description, and Session Activation Required.
todos: []
isProject: false
---

# Create Permission Set command (REST Data API)

## Scope

- New command: **Salesforce Ext.+: Create Permission Set** (e.g. `sf-ext-plus.createPermissionSet`).
- Uses the **standard REST Data API** to create the `PermissionSet` in the default org (POST to `sobjects/PermissionSet`). The [PermissionSet object reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm) documents that the Data API supports `create()` for this object; [examples](https://www.toriihq.com/articles/how-to-create-permission-sets-salesforce) use the same endpoint.
- Prompt order: **Label** → **Developer Name (API Name)** → **Description** → **Session Activation Required**.

## Key implementation details

### 1. Developer Name generation from Label

Implement a pure function used to pre-fill the Developer Name from the Label:

- Replace **non-ASCII** characters and **spaces** with a single underscore each.
- Replace **two or more consecutive underscores** with a **single** underscore.
- If the result **starts with a digit**, prepend `**x**` (e.g. `123` → `x123`).
- Trim leading/trailing underscores if desired for consistency.

This function should be **unit-tested** (e.g. in `src/test/`).

### 2. Prompt flow (exact order)

| Step | UI                                              | Required             | Default / rules                                                         |
| ---- | ----------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| 1    | `showInputBox` – “Label for the permission set” | Yes                  | —                                                                       |
| 2    | `showInputBox` – “Developer Name (API Name)”    | Yes                  | `value` = result of developer-name generator from step 1; user can edit |
| 3    | `showInputBox` – “Description”                  | No                   | `value: ""`                                                             |
| 4    | `showQuickPick` – “Session Activation Required” | Yes (user must pick) | Default: **No** (unchecked) – e.g. options “No” / “Yes”                 |

Cancel at any step (user dismisses or empty required field) → exit without calling the API.

### 3. REST Data API: PermissionSet fields and endpoint

**Use the standard REST Data API (not Tooling API)** to create the PermissionSet. The [PermissionSet object reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm) states that the object supports `create()` via the Data APIs; [Toriihq](https://www.toriihq.com/articles/how-to-create-permission-sets-salesforce) shows a minimal example.

**Endpoint:** `POST {instanceUrl}/services/data/v{apiVersion}/sobjects/PermissionSet`
(Standard REST sobjects endpoint; same OAuth/access token as other REST calls.)

**POST body (minimal for this command):**

- **Label** (string) – required; display label from step 1.
- **Name** (string) – required; Developer Name / API Name from step 2.
- **Description** (string) – optional; from step 3 (default `""`).
- **SessionPermsRequired** (boolean) – “Session Activation Required”; map QuickPick “Yes”/“No” to `true`/`false`.

Example (conceptual): `{"Label": "API Demo Permission Set", "Name": "API_Demo_PermSet", "Description": "", "SessionPermsRequired": false}`.
Verify field names (e.g. `SessionPermsRequired`) against the [Object Reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm) if needed. Do not send extra permission flags unless we add prompts for them.

### 4. Org context and REST API call

- **Default org**: Reuse the same pattern as in [src/commands/permissioneditor/refresh.ts](src/commands/permissioneditor/refresh.ts): resolve default org via existing logic (e.g. `getDefaultOrgUsername(workspaceRoot)` from refresh, or equivalent using `sf org list --json`).
- **Credentials**: To call the REST API you need an **access token** and **instance URL**. Use the CLI: run `sf org display --target-org <defaultOrg> --json` and parse the output for `accessToken` and `instanceUrl` (confirm property names from [SF CLI docs](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference) or a quick test).
- **REST API**:
  - **Endpoint**: `POST {instanceUrl}/services/data/v{apiVersion}/sobjects/PermissionSet`
  - **Headers**: `Authorization: Bearer {accessToken}`, `Content-Type: application/json`
  - **Body**: JSON with `Label`, `Name`, `Description` (optional), `SessionPermsRequired` as above.

Use a fixed API version (e.g. `v59.0` or `v60.0`) unless the project already reads it from somewhere. Node’s built-in `fetch` (Node 18+) or `https` is sufficient; no new dependencies required.

- **Error handling**: On non-2xx or API error body, show a clear `showErrorMessage` and do not create the permission set.

### 5. Where to add the command

- **Registration**: In [src/commands/permsets/main.ts](src/commands/permsets/main.ts) (alongside `assignPermissionSets`), register the new command and wire it to a handler that implements the flow above. Alternatively, add a small dedicated module under `src/commands/permsets/` (e.g. `create.ts`) and call it from `main.ts` to keep `main.ts` readable.
- **Contribution**: In [package.json](package.json), add a new item under `contributes.commands` with a title like “Salesforce Ext.+: Create Permission Set”.
- **Activation**: The command is already in the “permission sets” region; ensure it is registered in the same `activate` that registers `assignPermissionSets` (no change to [extension.ts](src/extension.ts) if the new command is registered inside the existing permsets activator).

### 6. Tests

- **Unit tests** (e.g. in `src/test/`):
  - **Developer name generator**: Multiple cases: ASCII only; spaces; non-ASCII; multiple underscores; leading digit; empty/whitespace edge cases.
- **Optional**: Light integration test that mocks `child_process.exec` (or the wrapper that runs `sf org display`) and the `fetch`/`https` call to the REST API to assert the correct payload and success/error handling. If time-constrained, at least unit tests for the generator are required; integration can be a follow-up.

### 7. UX and edge cases

- **Workspace**: If there is no workspace folder or no default org, show an error message (same style as refresh/permsets) and exit.
- **Validation**: If the user clears the required Developer Name, treat as cancel. Optionally validate Developer Name format (e.g. only valid API name characters) before POST and show a friendly error.
- **Success**: On 2xx, show `showInformationMessage` that the permission set was created (include Label or Name).

## Files to add or touch

| File                                                           | Change                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [package.json](package.json)                                   | Add command in `contributes.commands`                                      |
| [src/commands/permsets/main.ts](src/commands/permsets/main.ts) | Register handler and (optional) delegate to `create.ts`                    |
| New: `src/commands/permsets/create.ts` (optional)              | Implement prompt flow, developer-name helper, and REST Data API POST       |
| New or existing test file in `src/test/`                       | Unit tests for developer-name-from-label; optional mocked integration test |

## Notes

- **REST Data API (sobjects)**: The implementation uses the **standard REST Data API** (`POST .../sobjects/PermissionSet`), not the Tooling API. The [PermissionSet object reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm) and [examples](https://www.toriihq.com/articles/how-to-create-permission-sets-salesforce) confirm that create is supported on this endpoint. Same auth (OAuth/access token from `sf org display`).
- **Field names**: “Session Activation Required” in the UI is typically `SessionPermsRequired` (boolean). Confirm on the Object Reference if needed. Only send fields we collect (Label, Name, Description, SessionPermsRequired); optional permission flags (e.g. `PermissionsReadMetadata`) can be added later if we extend the UX.
