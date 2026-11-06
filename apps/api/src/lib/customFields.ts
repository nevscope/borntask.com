import {
  fieldAppliesToType,
  FOUND_ON_FIELD,
  MAX_CUSTOM_FIELD_NAME,
  MAX_CUSTOM_FIELD_OPTIONS,
  MAX_CUSTOM_FIELD_TEXT,
  MAX_CUSTOM_FIELDS,
  parseStringList,
  type CustomFieldType,
} from '@borntask/shared';
import { validation } from '../errors.js';
import type { TenantClient } from '../tenantPrisma.js';

export type CustomFieldRow = {
  id: string;
  name: string;
  type: CustomFieldType;
  options: unknown;
  appliesTo: unknown;
  position: number;
};

export function mapCustomField(row: CustomFieldRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    options: parseStringList(row.options),
    appliesTo: parseStringList(row.appliesTo),
  };
}

export function mapCustomFieldValues(rows: { fieldId: string; value: string }[] | undefined) {
  return (rows ?? []).map((row) => ({ fieldId: row.fieldId, value: row.value }));
}

export async function listProjectCustomFields(db: TenantClient, projectId: string) {
  const rows = await db.customField.findMany({
    where: { projectId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(mapCustomField);
}

function normaliseName(name: string) {
  const next = name.trim().replace(/\s+/g, ' ');
  if (next.length < 1 || next.length > MAX_CUSTOM_FIELD_NAME) {
    throw validation(`Name must be 1-${MAX_CUSTOM_FIELD_NAME} characters.`);
  }
  return next;
}

function normaliseOptions(type: CustomFieldType, options: string[] | undefined) {
  if (type !== 'dropdown') return [];
  const next = [...new Set((options ?? []).map((item) => item.trim()).filter(Boolean))];
  if (next.length < 2) throw validation('A dropdown needs at least two options.');
  if (next.length > MAX_CUSTOM_FIELD_OPTIONS) {
    throw validation(`A dropdown can have at most ${MAX_CUSTOM_FIELD_OPTIONS} options.`);
  }
  return next;
}

export async function createCustomField(
  db: TenantClient,
  input: {
    tenantId: string;
    projectId: string;
    name: string;
    type: CustomFieldType;
    options?: string[];
    appliesTo?: string[];
  },
) {
  const count = await db.customField.count({ where: { projectId: input.projectId } });
  if (count >= MAX_CUSTOM_FIELDS) {
    throw validation(`A project can have at most ${MAX_CUSTOM_FIELDS} custom fields.`);
  }
  const name = normaliseName(input.name);
  const clash = await db.customField.findFirst({ where: { projectId: input.projectId, name } });
  if (clash) throw validation('A field with that name already exists on this project.');
  const options = normaliseOptions(input.type, input.options);
  const appliesTo = [...new Set((input.appliesTo ?? []).map((item) => item.trim()).filter(Boolean))];
  const last = await db.customField.findFirst({
    where: { projectId: input.projectId },
    orderBy: { position: 'desc' },
  });
  const row = await db.customField.create({
    data: {
      tenantId: input.tenantId,
      projectId: input.projectId,
      name,
      type: input.type,
      options,
      appliesTo,
      position: (last?.position ?? 0) + 1,
    },
  });
  return mapCustomField(row);
}

export async function updateCustomField(
  db: TenantClient,
  field: { id: string; projectId: string; type: CustomFieldType },
  input: { name?: string; options?: string[]; appliesTo?: string[] },
) {
  const name = input.name === undefined ? undefined : normaliseName(input.name);
  if (name) {
    const clash = await db.customField.findFirst({
      where: { projectId: field.projectId, name, id: { not: field.id } },
    });
    if (clash) throw validation('A field with that name already exists on this project.');
  }
  const options = input.options === undefined ? undefined : normaliseOptions(field.type, input.options);
  const appliesTo = input.appliesTo === undefined
    ? undefined
    : [...new Set(input.appliesTo.map((item) => item.trim()).filter(Boolean))];
  const row = await db.customField.update({
    where: { id: field.id },
    data: { name, options, appliesTo },
  });
  return mapCustomField(row);
}

export async function ensureFoundOnField(db: TenantClient, tenantId: string, projectId: string) {
  const existing = await db.customField.findFirst({
    where: { projectId, name: FOUND_ON_FIELD.name },
  });
  if (existing) return mapCustomField(existing);
  return createCustomField(db, {
    tenantId,
    projectId,
    name: FOUND_ON_FIELD.name,
    type: FOUND_ON_FIELD.type,
    options: FOUND_ON_FIELD.options,
    appliesTo: FOUND_ON_FIELD.appliesTo,
  });
}

export async function setTaskCustomFields(
  db: TenantClient,
  input: {
    tenantId: string;
    projectId: string;
    taskId: string;
    taskType: string;
    values: { fieldId: string; value: string | null }[];
  },
) {
  const fields = await db.customField.findMany({ where: { projectId: input.projectId } });
  const byId = new Map(fields.map((field) => [field.id, field]));
  for (const row of input.values) {
    const field = byId.get(row.fieldId);
    if (!field) throw validation('Unknown custom field.');
    const appliesTo = parseStringList(field.appliesTo);
    if (!fieldAppliesToType(appliesTo, input.taskType)) {
      throw validation(`${field.name} does not apply to this task type.`);
    }
    const raw = (row.value ?? '').trim();
    if (!raw) {
      await db.customFieldValue.deleteMany({ where: { taskId: input.taskId, fieldId: field.id } });
      continue;
    }
    if (field.type === 'dropdown') {
      const options = parseStringList(field.options);
      if (!options.includes(raw)) throw validation(`Choose a ${field.name} option.`);
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw validation(`${field.name} must be a date.`);
    } else if (raw.length > MAX_CUSTOM_FIELD_TEXT) {
      throw validation(`${field.name} is too long.`);
    }
    await db.customFieldValue.upsert({
      where: { taskId_fieldId: { taskId: input.taskId, fieldId: field.id } },
      update: { value: raw },
      create: { tenantId: input.tenantId, taskId: input.taskId, fieldId: field.id, value: raw },
    });
  }
}
