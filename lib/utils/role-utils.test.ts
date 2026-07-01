import { formatRoleLabel } from './role-utils';

describe('formatRoleLabel', () => {
  it('renders the documented provider labels', () => {
    expect(formatRoleLabel('speech')).toBe('Speech');
    expect(formatRoleLabel('ot')).toBe('OT');
    expect(formatRoleLabel('counseling')).toBe('Counseling');
    expect(formatRoleLabel('resource')).toBe('Resource');
    expect(formatRoleLabel('psychologist')).toBe('Psych');
    expect(formatRoleLabel('specialist')).toBe('Specialist');
    expect(formatRoleLabel('sea')).toBe('SEA');
    expect(formatRoleLabel('site_admin')).toBe('Site Admin');
    expect(formatRoleLabel('district_admin')).toBe('District Admin');
  });

  it('is case-insensitive for known roles', () => {
    expect(formatRoleLabel('Speech')).toBe('Speech');
    expect(formatRoleLabel('OT')).toBe('OT');
    expect(formatRoleLabel('Site_Admin')).toBe('Site Admin');
  });

  it('returns "Unknown" for null / empty / whitespace', () => {
    expect(formatRoleLabel(null)).toBe('Unknown');
    expect(formatRoleLabel('')).toBe('Unknown');
    expect(formatRoleLabel('   ')).toBe('Unknown');
  });

  it('title-cases unknown roles, splitting snake/kebab/space', () => {
    expect(formatRoleLabel('teacher')).toBe('Teacher');
    expect(formatRoleLabel('intervention')).toBe('Intervention');
    expect(formatRoleLabel('some_new_role')).toBe('Some New Role');
    expect(formatRoleLabel('kebab-case-role')).toBe('Kebab Case Role');
    expect(formatRoleLabel('multi   space')).toBe('Multi Space');
  });
});
