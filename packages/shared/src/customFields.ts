export const CUSTOM_FIELD_TYPES = ['dropdown', 'text', 'date'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const MAX_CUSTOM_FIELDS = 8;
export const MAX_CUSTOM_FIELD_OPTIONS = 12;
export const MAX_CUSTOM_FIELD_NAME = 40;
export const MAX_CUSTOM_FIELD_TEXT = 200;

export const FOUND_ON_FIELD = {
  name: 'Found on',
  type: 'dropdown' as const satisfies CustomFieldType,
  options: ['Live', 'Test'],
  appliesTo: ['bug'],
};

export function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

export function fieldAppliesToType(appliesTo: string[], type: string): boolean {
  return appliesTo.length === 0 || appliesTo.includes(type);
}
