export const workspacePackIds = ['software', 'admin', 'project', 'support', 'content', 'simple'] as const;
export type WorkspacePackId = (typeof workspacePackIds)[number];

export type PackStatusCategory = 'backlog' | 'active' | 'review' | 'done';

export type WorkspacePack = {
  id: WorkspacePackId;
  title: string;
  summary: string;
  roles: { slug: string; name: string; colour: string }[];
  types: { slug: string; name: string; colour: string; template: string | null }[];
  workflows: {
    slug: string;
    name: string;
    isDefault: boolean;
    stages: { slug: string; name: string; category: PackStatusCategory; position: number }[];
    moves: { from: string; to: string; roles: string[]; requireComment?: boolean; label?: string }[];
  }[];
};

const LEAD = { slug: 'lead', name: 'Project lead', colour: '#121417' };
const OBSERVER = { slug: 'observer', name: 'Observer', colour: '#3A3F38' };

const HOLD: WorkspacePack['workflows'][number]['stages'] = [
  { slug: 'on_hold', name: 'On hold', category: 'backlog', position: 90 },
];

function openMoves(stageSlugs: string[]): WorkspacePack['workflows'][number]['moves'] {
  const moves: WorkspacePack['workflows'][number]['moves'] = [];
  for (let i = 0; i < stageSlugs.length - 1; i++) {
    const from = stageSlugs[i]!;
    const to = stageSlugs[i + 1]!;
    moves.push({ from, to, roles: [] });
    moves.push({ from: to, to: from, roles: [] });
  }
  for (const from of stageSlugs) {
    if (from !== 'on_hold') moves.push({ from, to: 'on_hold', roles: [] });
  }
  return moves;
}

export const workspacePacks: WorkspacePack[] = [
  {
    id: 'software',
    title: 'Software delivery',
    summary: 'For developers shipping product: ideas need approval, then build, test and deploy.',
    roles: [
      LEAD,
      { slug: 'business', name: 'Business', colour: '#3B49B8' },
      { slug: 'developer', name: 'Developer', colour: '#1F55B8' },
      { slug: 'tester', name: 'Tester', colour: '#8A5A0B' },
      OBSERVER,
    ],
    types: [
      { slug: 'idea', name: 'Idea', colour: '#5B3FC4', template: '## Problem\n\n## Who benefits\n' },
      { slug: 'bug', name: 'Bug', colour: '#B42323', template: '## Steps\n\n## Expected\n\n## Actual\n' },
      { slug: 'improvement', name: 'Improvement', colour: '#8A5A0B', template: '## Today\n\n## Proposed\n' },
      { slug: 'feature', name: 'Feature', colour: '#1F55B8', template: '## Acceptance criteria\n\n- \n' },
    ],
    workflows: [
      {
        slug: 'delivery',
        name: 'Delivery',
        isDefault: true,
        stages: [
          { slug: 'idea', name: 'Idea', category: 'backlog', position: 0 },
          { slug: 'approved', name: 'Approved', category: 'backlog', position: 1 },
          { slug: 'wip', name: 'WIP', category: 'active', position: 2 },
          { slug: 'ready_for_testing', name: 'Ready for testing', category: 'review', position: 3 },
          { slug: 'testing', name: 'Testing', category: 'review', position: 4 },
          { slug: 'deployed', name: 'Deployed', category: 'done', position: 5 },
          ...HOLD,
          { slug: 'rejected', name: 'Rejected', category: 'done', position: 91 },
        ],
        moves: [
          { from: 'idea', to: 'approved', roles: ['business', 'lead'], label: 'Approve' },
          { from: 'idea', to: 'rejected', roles: ['business', 'lead'], requireComment: true, label: 'Reject' },
          { from: 'approved', to: 'wip', roles: ['developer', 'lead'] },
          { from: 'wip', to: 'ready_for_testing', roles: ['developer', 'lead'] },
          { from: 'ready_for_testing', to: 'testing', roles: ['tester', 'lead'] },
          { from: 'testing', to: 'deployed', roles: ['tester', 'lead'], label: 'Pass' },
          { from: 'testing', to: 'wip', roles: ['tester', 'lead'], requireComment: true, label: 'Fail' },
          { from: 'idea', to: 'on_hold', roles: [] },
          { from: 'approved', to: 'on_hold', roles: [] },
          { from: 'wip', to: 'on_hold', roles: [] },
          { from: 'ready_for_testing', to: 'on_hold', roles: [] },
          { from: 'testing', to: 'on_hold', roles: [] },
        ],
      },
      simpleWorkflow(false),
    ],
  },
  {
    id: 'admin',
    title: 'Admin tracking',
    summary: 'For operations and office work: requests come in, someone reviews them, then they are done.',
    roles: [
      LEAD,
      { slug: 'requester', name: 'Requester', colour: '#3B49B8' },
      { slug: 'admin', name: 'Admin', colour: '#1F55B8' },
      OBSERVER,
    ],
    types: [
      { slug: 'request', name: 'Request', colour: '#1F55B8', template: '## What is needed\n\n## By when\n' },
      { slug: 'renewal', name: 'Renewal', colour: '#8A5A0B', template: '## Item\n\n## Current end date\n' },
      { slug: 'compliance', name: 'Compliance', colour: '#5B3FC4', template: '## Requirement\n\n## Evidence\n' },
      { slug: 'incident', name: 'Incident', colour: '#B42323', template: '## What happened\n\n## Impact\n' },
    ],
    workflows: [
      {
        slug: 'admin',
        name: 'Admin',
        isDefault: true,
        stages: [
          { slug: 'submitted', name: 'Submitted', category: 'backlog', position: 0 },
          { slug: 'in_review', name: 'In review', category: 'review', position: 1 },
          { slug: 'processing', name: 'Processing', category: 'active', position: 2 },
          { slug: 'complete', name: 'Complete', category: 'done', position: 3 },
          ...HOLD,
        ],
        moves: [
          { from: 'submitted', to: 'in_review', roles: ['admin', 'lead'] },
          { from: 'in_review', to: 'processing', roles: ['admin', 'lead'] },
          { from: 'in_review', to: 'submitted', roles: ['admin', 'lead'], requireComment: true, label: 'Send back' },
          { from: 'processing', to: 'complete', roles: ['admin', 'lead'] },
          { from: 'submitted', to: 'on_hold', roles: [] },
          { from: 'in_review', to: 'on_hold', roles: [] },
          { from: 'processing', to: 'on_hold', roles: [] },
        ],
      },
      simpleWorkflow(false),
    ],
  },
  {
    id: 'project',
    title: 'Project work',
    summary: 'For plans and delivery: a backlog, then planned work, progress, review and done.',
    roles: [
      LEAD,
      { slug: 'owner', name: 'Owner', colour: '#3B49B8' },
      { slug: 'contributor', name: 'Contributor', colour: '#1F55B8' },
      { slug: 'reviewer', name: 'Reviewer', colour: '#8A5A0B' },
      OBSERVER,
    ],
    types: [
      { slug: 'task', name: 'Task', colour: '#1F55B8', template: '## Outcome\n\n## Notes\n' },
      { slug: 'milestone', name: 'Milestone', colour: '#5B3FC4', template: '## What done looks like\n' },
      { slug: 'risk', name: 'Risk', colour: '#B42323', template: '## Risk\n\n## Mitigation\n' },
      { slug: 'decision', name: 'Decision', colour: '#8A5A0B', template: '## Context\n\n## Options\n\n## Decision\n' },
    ],
    workflows: [
      {
        slug: 'project',
        name: 'Project',
        isDefault: true,
        stages: [
          { slug: 'backlog', name: 'Backlog', category: 'backlog', position: 0 },
          { slug: 'planned', name: 'Planned', category: 'backlog', position: 1 },
          { slug: 'in_progress', name: 'In progress', category: 'active', position: 2 },
          { slug: 'review', name: 'Review', category: 'review', position: 3 },
          { slug: 'done', name: 'Done', category: 'done', position: 4 },
          ...HOLD,
        ],
        moves: [
          { from: 'backlog', to: 'planned', roles: ['owner', 'lead'] },
          { from: 'planned', to: 'in_progress', roles: ['contributor', 'lead'] },
          { from: 'in_progress', to: 'review', roles: ['contributor', 'lead'] },
          { from: 'review', to: 'done', roles: ['reviewer', 'lead'] },
          { from: 'review', to: 'in_progress', roles: ['reviewer', 'lead'], requireComment: true, label: 'Changes needed' },
          { from: 'backlog', to: 'on_hold', roles: [] },
          { from: 'planned', to: 'on_hold', roles: [] },
          { from: 'in_progress', to: 'on_hold', roles: [] },
          { from: 'review', to: 'on_hold', roles: [] },
        ],
      },
      simpleWorkflow(false),
    ],
  },
  {
    id: 'support',
    title: 'Support',
    summary: 'For tickets and customer issues: new work comes in, agents handle it, then it is resolved.',
    roles: [
      LEAD,
      { slug: 'agent', name: 'Agent', colour: '#1F55B8' },
      { slug: 'specialist', name: 'Specialist', colour: '#8A5A0B' },
      OBSERVER,
    ],
    types: [
      { slug: 'ticket', name: 'Ticket', colour: '#1F55B8', template: '## Customer\n\n## Issue\n' },
      { slug: 'incident', name: 'Incident', colour: '#B42323', template: '## Impact\n\n## Workaround\n' },
      { slug: 'question', name: 'Question', colour: '#5B3FC4', template: '## Question\n' },
      { slug: 'request', name: 'Request', colour: '#8A5A0B', template: '## What they need\n' },
    ],
    workflows: [
      {
        slug: 'support',
        name: 'Support',
        isDefault: true,
        stages: [
          { slug: 'new', name: 'New', category: 'backlog', position: 0 },
          { slug: 'open', name: 'Open', category: 'active', position: 1 },
          { slug: 'waiting', name: 'Waiting', category: 'review', position: 2 },
          { slug: 'resolved', name: 'Resolved', category: 'done', position: 3 },
          ...HOLD,
        ],
        moves: [
          { from: 'new', to: 'open', roles: ['agent', 'specialist', 'lead'] },
          { from: 'open', to: 'waiting', roles: ['agent', 'specialist', 'lead'] },
          { from: 'waiting', to: 'open', roles: ['agent', 'specialist', 'lead'] },
          { from: 'open', to: 'resolved', roles: ['agent', 'specialist', 'lead'], label: 'Resolve' },
          { from: 'waiting', to: 'resolved', roles: ['agent', 'specialist', 'lead'], label: 'Resolve' },
          { from: 'new', to: 'on_hold', roles: [] },
          { from: 'open', to: 'on_hold', roles: [] },
          { from: 'waiting', to: 'on_hold', roles: [] },
        ],
      },
      simpleWorkflow(false),
    ],
  },
  {
    id: 'content',
    title: 'Content and campaigns',
    summary: 'For writing and publishing: an idea becomes a draft, then review, then live.',
    roles: [
      LEAD,
      { slug: 'writer', name: 'Writer', colour: '#1F55B8' },
      { slug: 'editor', name: 'Editor', colour: '#8A5A0B' },
      { slug: 'publisher', name: 'Publisher', colour: '#5B3FC4' },
      OBSERVER,
    ],
    types: [
      { slug: 'article', name: 'Article', colour: '#1F55B8', template: '## Angle\n\n## Outline\n' },
      { slug: 'campaign', name: 'Campaign', colour: '#5B3FC4', template: '## Goal\n\n## Channels\n' },
      { slug: 'asset', name: 'Asset', colour: '#8A5A0B', template: '## Use\n\n## Spec\n' },
      { slug: 'idea', name: 'Idea', colour: '#3B49B8', template: '## Idea\n\n## Why now\n' },
    ],
    workflows: [
      {
        slug: 'content',
        name: 'Content',
        isDefault: true,
        stages: [
          { slug: 'idea', name: 'Idea', category: 'backlog', position: 0 },
          { slug: 'draft', name: 'Draft', category: 'active', position: 1 },
          { slug: 'review', name: 'Review', category: 'review', position: 2 },
          { slug: 'scheduled', name: 'Scheduled', category: 'review', position: 3 },
          { slug: 'published', name: 'Published', category: 'done', position: 4 },
          ...HOLD,
        ],
        moves: [
          { from: 'idea', to: 'draft', roles: ['writer', 'lead'] },
          { from: 'draft', to: 'review', roles: ['writer', 'lead'] },
          { from: 'review', to: 'scheduled', roles: ['editor', 'lead'] },
          { from: 'review', to: 'draft', roles: ['editor', 'lead'], requireComment: true, label: 'Revise' },
          { from: 'scheduled', to: 'published', roles: ['publisher', 'lead'] },
          { from: 'idea', to: 'on_hold', roles: [] },
          { from: 'draft', to: 'on_hold', roles: [] },
          { from: 'review', to: 'on_hold', roles: [] },
          { from: 'scheduled', to: 'on_hold', roles: [] },
        ],
      },
      simpleWorkflow(false),
    ],
  },
  {
    id: 'simple',
    title: 'Simple tasks',
    summary: 'For a small team that just needs a list. Anyone on the project can move work.',
    roles: [
      LEAD,
      { slug: 'member', name: 'Member', colour: '#1F55B8' },
      OBSERVER,
    ],
    types: [
      { slug: 'task', name: 'Task', colour: '#1F55B8', template: '## Notes\n' },
      { slug: 'bug', name: 'Bug', colour: '#B42323', template: '## Steps\n\n## Expected\n\n## Actual\n' },
      { slug: 'idea', name: 'Idea', colour: '#5B3FC4', template: '## Idea\n' },
    ],
    workflows: [simpleWorkflow(true)],
  },
];

function simpleWorkflow(isDefault: boolean): WorkspacePack['workflows'][number] {
  const stages = [
    { slug: 'todo', name: 'To do', category: 'backlog' as const, position: 0 },
    { slug: 'doing', name: 'Doing', category: 'active' as const, position: 1 },
    { slug: 'done', name: 'Done', category: 'done' as const, position: 2 },
  ];
  return {
    slug: 'simple',
    name: 'Simple',
    isDefault,
    stages,
    moves: [
      ...openMoves(stages.map((s) => s.slug)),
      { from: 'todo', to: 'done', roles: [], label: 'Complete' },
    ],
  };
}

export function workspacePackById(id: string | undefined): WorkspacePack {
  return workspacePacks.find((pack) => pack.id === id) ?? workspacePacks[0]!;
}

export function resolveWorkspacePackId(input: { pack?: string; workflow?: string }): WorkspacePackId {
  if (input.pack && workspacePackIds.includes(input.pack as WorkspacePackId)) return input.pack as WorkspacePackId;
  if (input.workflow === 'simple') return 'simple';
  return 'software';
}
