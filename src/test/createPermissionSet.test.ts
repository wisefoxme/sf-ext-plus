import { describe, expect, test } from '@jest/globals';
import { labelToDeveloperName } from '../commands/permsets/developerName';

describe('labelToDeveloperName', () => {
    test('returns empty string for empty input', () => {
        expect(labelToDeveloperName('')).toBe('');
    });

    test('preserves ASCII-only label without spaces', () => {
        expect(labelToDeveloperName('MyPermissionSet')).toBe('MyPermissionSet');
    });

    test('replaces spaces with single underscore', () => {
        expect(labelToDeveloperName('My Permission Set')).toBe('My_Permission_Set');
    });

    test('collapses multiple consecutive underscores to one', () => {
        expect(labelToDeveloperName('My   Permission   Set')).toBe('My_Permission_Set');
        expect(labelToDeveloperName('a__b___c')).toBe('a_b_c');
    });

    test('replaces non-alphanumeric characters (e.g. spaces, non-ASCII) with underscore', () => {
        expect(labelToDeveloperName('caf\u00E9')).toBe('caf_'); // é not in [a-zA-Z0-9]
        expect(labelToDeveloperName('na\u00EFve')).toBe('na_ve'); // ï not in [a-zA-Z0-9]
    });

    test('prepends x when result starts with digit', () => {
        expect(labelToDeveloperName('123')).toBe('x123');
        expect(labelToDeveloperName('1st Set')).toBe('x1st_Set');
    });

    test('collapses and preserves boundary underscores (no trim)', () => {
        expect(labelToDeveloperName('  label  ')).toBe('_label_');
        expect(labelToDeveloperName('___')).toBe('_');
        expect(labelToDeveloperName(' _ foo _ ')).toBe('_foo_');
    });

    test('handles only spaces and underscores', () => {
        expect(labelToDeveloperName('   ')).toBe('_');
        expect(labelToDeveloperName(' __ ')).toBe('_');
    });

    test('handles null and undefined by returning empty string', () => {
        expect(labelToDeveloperName(undefined as unknown as string)).toBe('');
        expect(labelToDeveloperName(null as unknown as string)).toBe('');
    });
});
