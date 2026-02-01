/**
 * Generate a Developer Name (API Name) from a permission set Label.
 * - Keeps only ASCII letters (a-z, A-Z) and digits (0-9); replaces all other characters with underscore.
 * - Collapses two or more consecutive underscores to a single underscore.
 * - If the result starts with a digit, prepends "x".
 */
export function labelToDeveloperName(label: string): string {
    if (label === undefined || label === null || typeof label !== 'string') {
        return '';
    }
    let name = label
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_');
    if (/^\d/.test(name)) {
        name = 'x' + name;
    }
    return name;
}
