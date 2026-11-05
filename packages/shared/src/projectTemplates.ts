export const projectTemplateIds = ['product_dev', 'launch_ops'] as const;
export type ProjectTemplateId = (typeof projectTemplateIds)[number];
export type ProjectWorkflowChoice = 'delivery' | 'simple';

export type ProjectTemplate = {
  id: ProjectTemplateId;
  title: string;
  summary: string;
  workflow: ProjectWorkflowChoice;
  sectionKind: 'releases' | 'phases';
  sections: string[];
  defaultViewIds: readonly string[];
  sectionHint: string;
};

export const SECTION_WHEN_RULE =
  'Status says where a task is. Type says what kind of work it is. A section says when: a release or a phase. Do not put status words in section names.';

export const PROJECT_DEFAULT_VIEW_IDS = [
  'preset-open',
  'preset-all',
  'preset-mine',
  'preset-week',
  'preset-overdue',
  'preset-done',
] as const;

const STATUS_SECTION_WORDS = [
  'approved',
  'deployed',
  'testing',
  'ready for testing',
  'wip',
  'to do',
  'todo',
  'doing',
  'done',
  'in progress',
  'rejected',
  'on hold',
  'current issues',
  'ready for',
];

export const projectTemplates: ProjectTemplate[] = [
  {
    id: 'product_dev',
    title: 'Product dev',
    summary: 'Delivery workflow. Sections: Inbox, then each release, then Backlog.',
    workflow: 'delivery',
    sectionKind: 'releases',
    sections: ['Inbox', 'Next release', 'Backlog'],
    defaultViewIds: PROJECT_DEFAULT_VIEW_IDS,
    sectionHint: 'Name a release and a date. Inbox is new work. Backlog is later.',
  },
  {
    id: 'launch_ops',
    title: 'Launch and ops',
    summary: 'Simple workflow. Sections are phases of the launch or the work.',
    workflow: 'simple',
    sectionKind: 'phases',
    sections: ['Discovery', 'Launch', 'After launch'],
    defaultViewIds: PROJECT_DEFAULT_VIEW_IDS,
    sectionHint: 'Name the phase you are in, not a status.',
  },
];

export function projectTemplateById(id: string | undefined): ProjectTemplate | undefined {
  if (!id) return undefined;
  return projectTemplates.find((row) => row.id === id);
}

export function sectionNameLooksLikeStatus(name: string): boolean {
  const text = name.trim().toLowerCase();
  if (!text) return false;
  return STATUS_SECTION_WORDS.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(text);
  });
}

export function formatReleaseSectionName(name: string, dateIso?: string | null): string {
  const label = name.trim();
  if (!label) return '';
  if (!dateIso) return label;
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return label;
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return `${label} (${day})`;
}

export function resolveProjectCreatePlan(input: {
  template?: string;
  workflow?: ProjectWorkflowChoice;
  sections?: string[];
}): {
  templateId: ProjectTemplateId | null;
  workflow: ProjectWorkflowChoice;
  sections: string[];
  defaultViewIds: readonly string[];
} {
  const template = projectTemplateById(input.template);
  const workflow = template?.workflow ?? input.workflow ?? 'delivery';
  const named = (input.sections ?? []).map((row) => row.trim()).filter(Boolean);
  const sections = named.length ? named : (template?.sections ?? ['Inbox']);
  return {
    templateId: template?.id ?? null,
    workflow,
    sections,
    defaultViewIds: template?.defaultViewIds ?? PROJECT_DEFAULT_VIEW_IDS,
  };
}
