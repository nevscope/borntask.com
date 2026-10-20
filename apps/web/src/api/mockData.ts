// Fictional sample data (the same people, projects and tasks as the approved screens) plus an
// in-memory implementation of the Api contract. Used when VITE_USE_MOCKS=true.
// Mutations change the in-memory store, so the app behaves like the real thing until reload.
import dayjs from 'dayjs';
import { ApiError } from './http';
import type { Activity, Api, Comment, Me, Notification, Project, ProjectDetail, ProjectMember, SearchHit, Section, StatusCounts, Subtask, Task, TaskDetail, User, Workflow } from './types';
import { isTaskDescriptionTooLong, TASK_DESCRIPTION_TOO_LONG } from '@borntask/shared';
import { persistDescription, stripTags } from '../lib/descriptionHtml';
import { isTaskKey, snippetAround } from '../lib/search';
import { canOverride, checkMove, initialStatusFor, statusById } from '../lib/workflow';

const day = (offset: number) => dayjs().add(offset, 'day').format('YYYY-MM-DD');
const ago = (hours: number) => dayjs().subtract(hours, 'hour').toISOString();

// ---------- people ----------
export const users: User[] = [
  { id: 'u_scope', name: 'Scope', email: 'scope@scopecloud.example', initials: 'SC' },
  { id: 'u_maria', name: 'Maria Borg', email: 'maria@scopecloud.example', initials: 'MB' },
  { id: 'u_luke', name: 'Luke Camilleri', email: 'luke@scopecloud.example', initials: 'LC' },
  { id: 'u_daniela', name: 'Daniela Vella', email: 'daniela@scopecloud.example', initials: 'DV' },
  { id: 'u_karl', name: 'Karl Farrugia', email: 'karl@scopecloud.example', initials: 'KF' },
];

const joanna: User = { id: 'u_joanna', name: 'Joanna Zammit', email: 'joanna@harbour.example', initials: 'JZ' };
const githubBot: User = { id: 'u_github', name: 'GitHub', email: 'notifications@github.example', initials: 'GH' };

const me: Me = {
  user: users[0]!,
  workspace: { id: 'ws_scope', name: 'Scope Cloud Solutions' },
  workspaceRole: 'owner',
};

// ---------- workflow ----------
export const deliveryWorkflow: Workflow = {
  id: 'wf_delivery',
  name: 'Delivery',
  statuses: [
    { id: 'idea', name: 'Idea', category: 'backlog', tone: 'neutral', position: 1, wipLimit: null, side: false },
    { id: 'approved', name: 'Approved', category: 'backlog', tone: 'indigo', position: 2, wipLimit: null, side: false },
    { id: 'wip', name: 'WIP', category: 'active', tone: 'blue', position: 3, wipLimit: 3, side: false },
    { id: 'ready', name: 'Ready for testing', category: 'review', tone: 'amber', position: 4, wipLimit: null, side: false },
    { id: 'testing', name: 'Testing', category: 'review', tone: 'orange', position: 5, wipLimit: 2, side: false },
    { id: 'deployed', name: 'Deployed', category: 'done', tone: 'green', position: 6, wipLimit: null, side: false },
    { id: 'on_hold', name: 'On hold', category: 'backlog', tone: 'neutral', position: 7, wipLimit: null, side: true },
    { id: 'rejected', name: 'Rejected', category: 'done', tone: 'slate', position: 8, wipLimit: null, side: true },
  ],
  transitions: [
    { from: 'idea', to: 'approved', roles: ['business'], requireComment: false, label: 'Approve' },
    { from: 'idea', to: 'rejected', roles: ['business'], requireComment: true, label: 'Reject' },
    { from: 'approved', to: 'wip', roles: ['developer'], requireComment: false, label: 'Start work' },
    { from: 'wip', to: 'ready', roles: ['developer'], requireComment: false, label: 'Ready for testing' },
    { from: 'ready', to: 'testing', roles: ['tester'], requireComment: false, label: 'Start testing' },
    { from: 'testing', to: 'deployed', roles: ['tester'], requireComment: false, label: 'Pass' },
    { from: 'testing', to: 'wip', roles: ['tester'], requireComment: true, label: 'Fail' },
    { from: '*', to: 'on_hold', roles: [], requireComment: false, label: 'Put on hold' },
  ],
};

// ---------- projects ----------
const projects: Project[] = [
  { id: 'p_web', key: 'WEB', name: 'Website relaunch', color: '#2F6FDB', leadId: 'u_luke', workflowId: 'wf_delivery', openCount: 0, starred: true, counts: { backlog: 0, active: 0, review: 0, done: 0 } },
  { id: 'p_mob', key: 'MOB', name: 'Mobile app', color: '#E0731F', leadId: 'u_karl', workflowId: 'wf_delivery', openCount: 0, starred: false, counts: { backlog: 0, active: 0, review: 0, done: 0 } },
  { id: 'p_cli', key: 'CLI', name: 'Client onboarding', color: '#8E59D9', leadId: 'u_daniela', workflowId: 'wf_delivery', openCount: 0, starred: false, counts: { backlog: 0, active: 0, review: 0, done: 0 } },
];

const sections: Section[] = [
  { id: 's_web_home', projectKey: 'WEB', name: 'Homepage', position: 1 },
  { id: 's_web_checkout', projectKey: 'WEB', name: 'Checkout', position: 2 },
  { id: 's_web_platform', projectKey: 'WEB', name: 'Platform', position: 3 },
  { id: 's_mob_notif', projectKey: 'MOB', name: 'Notifications', position: 1 },
  { id: 's_mob_offline', projectKey: 'MOB', name: 'Offline', position: 2 },
  { id: 's_mob_pay', projectKey: 'MOB', name: 'Payments', position: 3 },
  { id: 's_cli_emails', projectKey: 'CLI', name: 'Emails', position: 1 },
  { id: 's_cli_portal', projectKey: 'CLI', name: 'Portal', position: 2 },
];

// Scope (the signed-in owner) is Business + Tester everywhere: can approve ideas and pass tests,
// but cannot start development work. That makes the blocked-move flow easy to demo.
const members: Record<string, ProjectMember[]> = {
  WEB: [
    { userId: 'u_luke', roles: ['lead', 'developer'] },
    { userId: 'u_maria', roles: ['tester'] },
    { userId: 'u_daniela', roles: ['business'] },
    { userId: 'u_karl', roles: ['developer', 'tester'] },
    { userId: 'u_scope', roles: ['business', 'tester'] },
  ],
  MOB: [
    { userId: 'u_karl', roles: ['lead', 'developer'] },
    { userId: 'u_maria', roles: ['tester'] },
    { userId: 'u_luke', roles: ['developer'] },
    { userId: 'u_scope', roles: ['business', 'tester'] },
  ],
  CLI: [
    { userId: 'u_daniela', roles: ['lead', 'business'] },
    { userId: 'u_karl', roles: ['developer'] },
    { userId: 'u_maria', roles: ['tester'] },
    { userId: 'u_scope', roles: ['business', 'tester'] },
  ],
};

// ---------- tasks ----------
type Seed = Partial<Task> & Pick<Task, 'key' | 'title' | 'type' | 'statusId' | 'sectionId'>;

const BUG_TEMPLATE = 'Steps to reproduce\n1. \n\nExpected\n\nActual\n';

function seed(s: Seed, position: number): Task {
  const projectKey = s.key.split('-')[0]!;
  return {
    id: `t_${s.key.toLowerCase()}`,
    projectKey,
    description: s.type === 'bug' ? BUG_TEMPLATE : '',
    previousStatusId: null,
    assigneeId: null,
    reporterId: 'u_daniela',
    priority: 'medium',
    dueDate: null,
    labels: [],
    position,
    subtaskCount: { done: 0, total: 0 },
    createdAt: ago(240),
    updatedAt: ago(4),
    ...s,
  };
}

let tasks: Task[] = [
  // WEB · Homepage
  seed({ key: 'WEB-158', title: 'Cookie banner overlaps the nav on mobile', type: 'bug', statusId: 'approved', sectionId: 's_web_home', assigneeId: 'u_maria', dueDate: day(3), priority: 'high' }, 1),
  seed({ key: 'WEB-133', title: 'Lazy-load hero and product images', type: 'improvement', statusId: 'ready', sectionId: 's_web_home', assigneeId: 'u_karl', dueDate: day(2), priority: 'high', labels: ['performance'], githubBadge: 'merged' }, 2),
  seed({ key: 'WEB-151', title: 'Hero copy for the autumn campaign', type: 'improvement', statusId: 'approved', sectionId: 's_web_home', assigneeId: 'u_scope', dueDate: day(-1), priority: 'medium' }, 3),
  seed({ key: 'WEB-160', title: 'Customer reviews on product pages', type: 'idea', statusId: 'idea', sectionId: 's_web_home', reporterId: 'u_luke', description: 'Show star ratings and written reviews under each product, with moderation.' }, 4),
  seed({ key: 'WEB-155', title: 'Exit-intent discount popup', type: 'idea', statusId: 'idea', sectionId: 's_web_home', priority: 'low' }, 5),
  // WEB · Checkout
  seed({
    key: 'WEB-142', title: 'Checkout fails on Safari 17', type: 'bug', statusId: 'testing', sectionId: 's_web_checkout', assigneeId: 'u_scope', dueDate: day(0), priority: 'urgent', labels: ['safari', 'payments'],
    description: 'Steps to reproduce\n1. Open the site in Safari 17 on macOS\n2. Add any product to the basket\n3. Pay by card with 3-D Secure\n\nExpected\nThe bank\'s 3-D Secure window opens.\n\nActual\nThe page reloads and the basket empties.',
    subtaskCount: { done: 1, total: 2 },
    githubBadge: 'pr_running',
  }, 1),
  seed({ key: 'WEB-139', title: 'Add Apple Pay to checkout', type: 'feature', statusId: 'wip', sectionId: 's_web_checkout', assigneeId: 'u_luke', dueDate: day(7), priority: 'high', subtaskCount: { done: 2, total: 3 }, githubBadge: 'branch' }, 2),
  seed({
    key: 'WEB-144', title: 'Show the delivery date before payment', type: 'feature', statusId: 'approved', sectionId: 's_web_checkout', dueDate: day(11),
    description: 'The promised window should be shown on the checkout summary step before the customer pays.',
  }, 3),
  // WEB · Platform
  seed({ key: 'WEB-147', title: 'Rate-limit the login endpoint', type: 'feature', statusId: 'wip', sectionId: 's_web_platform', assigneeId: 'u_karl', dueDate: day(9), priority: 'high' }, 1),
  seed({ key: 'WEB-149', title: 'Broken links on the 404 page', type: 'bug', statusId: 'on_hold', previousStatusId: 'wip', sectionId: 's_web_platform', assigneeId: 'u_maria', dueDate: day(-2), priority: 'low' }, 2),
  seed({ key: 'WEB-128', title: 'Move images to the new CDN', type: 'feature', statusId: 'deployed', sectionId: 's_web_platform', assigneeId: 'u_luke', dueDate: day(-3) }, 3),
  seed({ key: 'WEB-121', title: 'Regenerate the sitemap nightly', type: 'improvement', statusId: 'deployed', sectionId: 's_web_platform', assigneeId: 'u_karl', dueDate: day(-6) }, 4),
  // MOB
  seed({ key: 'MOB-27', title: 'Review push notification copy', type: 'improvement', statusId: 'ready', sectionId: 's_mob_notif', assigneeId: 'u_scope', dueDate: day(0), priority: 'high' }, 1),
  seed({ key: 'MOB-30', title: 'Offline mode for the task list', type: 'idea', statusId: 'idea', sectionId: 's_mob_offline', assigneeId: 'u_scope', priority: 'low' }, 1),
  seed({ key: 'MOB-31', title: 'Dark mode for the mobile app', type: 'feature', statusId: 'idea', sectionId: 's_mob_offline', reporterId: 'u_karl' }, 2),
  seed({ key: 'MOB-22', title: 'One-tap checkout for saved cards', type: 'idea', statusId: 'idea', sectionId: 's_mob_pay', reporterId: 'u_luke' }, 1),
  // CLI
  seed({ key: 'CLI-12', title: 'Welcome email sequence for new clients', type: 'feature', statusId: 'wip', sectionId: 's_cli_emails', assigneeId: 'u_scope', dueDate: day(2), priority: 'medium' }, 1),
  seed({ key: 'CLI-9', title: 'Welcome pack checkout link expires too early', type: 'bug', statusId: 'on_hold', previousStatusId: 'wip', sectionId: 's_cli_emails', assigneeId: 'u_daniela', dueDate: day(-4) }, 2),
  seed({ key: 'CLI-14', title: 'Shorter onboarding questionnaire', type: 'improvement', statusId: 'idea', sectionId: 's_cli_portal', reporterId: 'u_maria' }, 1),
];

const deleted = new Map<string, Task>();

const subtasks: Record<string, Subtask[]> = {
  'WEB-142': [
    { id: 'st_1', title: 'Reproduce on BrowserStack', done: true },
    { id: 'st_2', title: 'Retest with 3-D Secure test cards', done: false },
  ],
  'WEB-139': [
    { id: 'st_3', title: 'Merchant ID and domain verification', done: true },
    { id: 'st_4', title: 'Payment sheet on product page', done: true },
    { id: 'st_5', title: 'Refunds through Apple Pay', done: false },
  ],
};

const watchers: Record<string, string[]> = {
  'WEB-139': ['u_karl'],
};

const comments: Record<string, Comment[]> = {
  'WEB-142': [
    { id: 'c_1', authorId: 'u_karl', body: 'Fixed the polyfill and deployed to staging. Moved to Testing.', via: 'app', createdAt: ago(2) },
    { id: 'c_2', authorId: 'u_maria', body: '@Karl still failing when the card needs 3-D Secure.', via: 'app', createdAt: ago(0.6) },
    { id: 'c_5', authorId: 'u_scope', body: 'I will look at the 3-D Secure failure next.', via: 'app', createdAt: ago(0.2) },
  ],
  'WEB-133': [
    { id: 'c_3', authorId: 'u_karl', body: 'This also covers the checkout thumbnails, not only the hero.', via: 'app', createdAt: ago(8) },
  ],
  'WEB-158': [
    { id: 'c_4', authorId: 'u_maria', body: 'On iPhone SE it blocks the checkout button entirely.', via: 'app', createdAt: ago(5) },
  ],
};

const activity: Record<string, Activity[]> = {
  'WEB-142': [
    { id: 'a_1', actorId: 'u_daniela', via: 'app', text: 'created this bug', at: ago(190) },
    { id: 'a_2', actorId: 'u_karl', via: 'github', text: 'linked PR #224 · moved to Ready for testing', at: ago(30) },
    { id: 'a_3', actorId: 'u_karl', via: 'app', text: 'moved to Testing', at: ago(2) },
  ],
};

let notifications: Notification[] = [
  {
    id: 'n_mention',
    kind: 'mention',
    text: 'Maria Borg mentioned you: "still failing when the card needs 3-D Secure"',
    taskKey: 'WEB-142',
    projectKey: 'WEB',
    actor: users[1]!,
    createdAt: ago(0.58),
    readAt: null,
  },
  {
    id: 'n_assigned',
    kind: 'assigned',
    text: 'Luke Camilleri assigned you Add Apple Pay to checkout',
    taskKey: 'WEB-139',
    projectKey: 'WEB',
    actor: users[2]!,
    createdAt: ago(2),
    readAt: null,
  },
  {
    id: 'n_moved',
    kind: 'moved',
    text: 'Karl Farrugia moved Lazy-load hero images to Ready for testing',
    taskKey: 'WEB-133',
    projectKey: 'WEB',
    actor: users[4]!,
    createdAt: ago(3),
    readAt: null,
  },
  {
    id: 'n_invite',
    kind: 'invite',
    text: 'Joanna Zammit accepted your invitation to Harbour Logistics portal',
    taskKey: null,
    projectKey: 'HLP',
    actor: joanna,
    createdAt: ago(26),
    readAt: ago(20),
  },
  {
    id: 'n_github',
    kind: 'github',
    text: 'Pull request #212 merged, WEB-128 moved to Deployed',
    taskKey: 'WEB-128',
    projectKey: 'WEB',
    actor: githubBot,
    createdAt: ago(72),
    readAt: ago(60),
  },
];

function notificationList() {
  const items = [...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { items: clone(items), unreadCount: items.filter((n) => !n.readAt).length };
}

// ---------- helpers ----------
const LATENCY_MS = 140;
const wait = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS));
const clone = <T>(v: T): T => structuredClone(v);
let seq = 1000;
const uid = (p: string) => `${p}_${++seq}`;

function findTask(key: string): Task {
  const t = tasks.find((x) => x.key === key);
  if (!t) throw new ApiError(404, 'NOT_FOUND', `Task ${key} not found`);
  return t;
}
function projectOf(key: string): Project {
  const p = projects.find((x) => x.key === key);
  if (!p) throw new ApiError(404, 'NOT_FOUND', `Project ${key} not found`);
  return p;
}
function myRolesIn(projectKey: string) {
  return members[projectKey]?.find((m) => m.userId === me.user.id)?.roles ?? [];
}
function log(key: string, text: string) {
  (activity[key] ??= []).push({ id: uid('a'), actorId: me.user.id, via: 'app', text, at: new Date().toISOString() });
}
function touch(t: Task) {
  t.updatedAt = new Date().toISOString();
}
function countsFor(projectKey: string): StatusCounts {
  const counts: StatusCounts = { backlog: 0, active: 0, review: 0, done: 0 };
  for (const t of tasks) {
    if (t.projectKey !== projectKey) continue;
    const cat = statusById(deliveryWorkflow, t.statusId)?.category;
    if (cat) counts[cat] += 1;
  }
  return counts;
}
function presentProject(p: Project): Project {
  const counts = countsFor(p.key);
  return {
    ...p,
    counts,
    openCount: counts.backlog + counts.active + counts.review,
    leadName: users.find((u) => u.id === p.leadId)?.name ?? null,
    guestCount: 0,
    updatedAt: new Date().toISOString(),
  };
}
function sorted(list: Task[]) {
  return [...list].sort((a, b) => a.position - b.position);
}

// ---------- the mock Api ----------
export const mockApi: Api = {
  async getMe() {
    await wait();
    return clone(me);
  },

  async listProjects() {
    await wait();
    return clone(projects.map((p) => presentProject(p)));
  },

  async setFavourite(key, starred) {
    await wait();
    projectOf(key).starred = starred;
    return { ok: true };
  },

  async getProject(key): Promise<ProjectDetail> {
    await wait();
    const project = projectOf(key);
    return clone({
      project: presentProject(project),
      sections: sections.filter((s) => s.projectKey === key).sort((a, b) => a.position - b.position),
      members: members[key] ?? [],
      users,
      workflow: deliveryWorkflow,
    });
  },

  async listProjectTasks(key) {
    await wait();
    projectOf(key);
    return clone(sorted(tasks.filter((t) => t.projectKey === key)));
  },

  async search(q) {
    const started = Date.now();
    await wait();
    const n = q.trim();
    if (!n) return { hits: [], tookMs: Date.now() - started };
    const hits: SearchHit[] = [];
    const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;

    const pushHit = (t: Task, matchField: SearchHit['matchField'], matchSnippet: string, commentAuthor: string | null) => {
      const project = projects.find((p) => p.key === t.projectKey);
      const status = statusById(deliveryWorkflow, t.statusId);
      if (!project || !status) return;
      hits.push({
        key: t.key,
        projectKey: t.projectKey,
        projectName: project.name,
        projectColor: project.color,
        title: t.title,
        type: t.type,
        statusId: t.statusId,
        statusName: status.name,
        statusTone: status.tone,
        statusCategory: status.category,
        sectionName: sections.find((s) => s.id === t.sectionId)?.name ?? null,
        assigneeName: userName(t.assigneeId),
        matchField,
        matchSnippet,
        commentAuthor,
      });
    };

    if (isTaskKey(n)) {
      const t = tasks.find((x) => x.key.toLowerCase() === n.toLowerCase());
      if (t) pushHit(t, 'key', t.title, null);
      return { hits, tookMs: Date.now() - started };
    }

    const needle = n.toLowerCase();
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(needle)) {
        pushHit(t, 'title', t.title, null);
        continue;
      }
      if (stripTags(t.description).toLowerCase().includes(needle)) {
        pushHit(t, 'description', snippetAround(t.description, n), null);
        continue;
      }
      const c = (comments[t.key] ?? []).find((x) => x.body.toLowerCase().includes(needle));
      if (c) pushHit(t, 'comment', snippetAround(c.body, n), userName(c.authorId));
    }
    return { hits, tookMs: Date.now() - started };
  },

  async listMyTasks() {
    await wait();
    const assigned = tasks.filter((t) => t.assigneeId === me.user.id && statusById(deliveryWorkflow, t.statusId)?.category !== 'done');
    const approvals = tasks.filter((t) => t.statusId === 'idea' && myRolesIn(t.projectKey).includes('business'));
    const created = tasks.filter((t) => t.reporterId === me.user.id && statusById(deliveryWorkflow, t.statusId)?.category !== 'done');
    const watching = tasks.filter((t) => t.labels.includes('watch-demo'));
    return clone({ assigned, approvals, created, watching });
  },

  async getTask(key): Promise<TaskDetail> {
    await wait();
    const t = findTask(key);
    return clone({
      ...t,
      subtasks: subtasks[key] ?? [],
      comments: comments[key] ?? [],
      activity: activity[key] ?? [],
      watcherIds: watchers[key] ?? [],
      attachments: [],
      development: key.startsWith('WEB-')
        ? {
            enabled: true,
            suggestedBranch: `bug/${key}-${t.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}`,
            gitCheckout: `git checkout -b bug/${key}-work`,
            links:
              key === 'WEB-142'
                ? [
                    { id: 'd1', kind: 'pr' as const, title: '#231 Fix 3-D Secure redirect on Safari', url: 'https://github.com/example/checkout-service/pull/231', repo: 'checkout-service', author: 'karl-f', prState: 'open', checks: 'running' as const, extra: 'Fix 3-D Secure redirect on Safari' },
                    { id: 'd2', kind: 'pr' as const, title: '#224 Add Safari polyfill for payment iframe', url: 'https://github.com/example/website/pull/224', repo: 'website', author: 'karl-f', prState: 'merged', checks: 'passed' as const, extra: 'Add Safari polyfill for payment iframe' },
                    { id: 'd3', kind: 'branch' as const, title: 'bug/WEB-142-checkout-fails-on-safari-17', url: 'https://github.com/example/checkout-service/tree/bug/WEB-142-checkout-fails-on-safari-17', repo: 'checkout-service', author: '', prState: null, checks: null, extra: 'bug/WEB-142-checkout-fails-on-safari-17' },
                  ]
                : [],
            githubActivity:
              key === 'WEB-142'
                ? [
                    { when: ago(0.1), text: 'PR #231 opened by karl-f' },
                    { when: ago(30), text: 'PR #224 merged. Moved to Ready for testing via GitHub' },
                  ]
                : [],
          }
        : { enabled: false, suggestedBranch: '', gitCheckout: '', links: [], githubActivity: [] },
    });
  },

  async createTask(input) {
    await wait();
    projectOf(input.projectKey);
    const description = persistDescription(input.description);
    if (isTaskDescriptionTooLong(description)) throw new ApiError(400, 'VALIDATION', TASK_DESCRIPTION_TOO_LONG);
    const max = Math.max(0, ...tasks.filter((t) => t.projectKey === input.projectKey).map((t) => Number(t.key.split('-')[1])));
    const inSection = tasks.filter((t) => t.sectionId === input.sectionId);
    const now = new Date().toISOString();
    const task: Task = {
      id: uid('t'),
      key: `${input.projectKey}-${max + 1}`,
      projectKey: input.projectKey,
      title: input.title.trim(),
      description,
      type: input.type,
      statusId: initialStatusFor(input.type),
      previousStatusId: null,
      sectionId: input.sectionId,
      assigneeId: input.assigneeId,
      reporterId: me.user.id,
      priority: input.priority,
      dueDate: input.dueDate,
      labels: input.labels,
      position: Math.max(0, ...inSection.map((t) => t.position)) + 1,
      subtaskCount: { done: 0, total: 0 },
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(task);
    log(task.key, `created this ${task.type}${input.attachmentIds.length ? ` with ${input.attachmentIds.length} attachment(s)` : ''}`);
    return clone(task);
  },

  async updateTask(key, input) {
    await wait();
    const t = findTask(key);
    const description = input.description === undefined ? undefined : persistDescription(input.description);
    if (description !== undefined && isTaskDescriptionTooLong(description)) {
      throw new ApiError(400, 'VALIDATION', TASK_DESCRIPTION_TOO_LONG);
    }
    Object.assign(t, description !== undefined ? { ...input, description } : input);
    touch(t);
    return clone(t);
  },

  async moveTask(key, input) {
    await wait();
    const t = findTask(key);
    if (input.undo) {
      t.statusId = input.toStatusId;
      touch(t);
      log(key, `undid the move, back to ${input.toStatusId}`);
      return clone(t);
    }
    const roles = myRolesIn(t.projectKey);
    const check = checkMove(deliveryWorkflow, t, input.toStatusId, roles);
    if (check.kind === 'no-path') throw new ApiError(422, 'VALIDATION', check.reason);
    if (check.kind === 'not-allowed') {
      const mayOverride = canOverride(me.workspaceRole, roles) && !!input.overrideReason?.trim();
      if (!mayOverride) throw new ApiError(403, 'TRANSITION_NOT_ALLOWED', check.reason, check.transition.roles);
    }
    if (check.transition.requireComment && !input.comment?.trim() && !input.overrideReason) {
      throw new ApiError(422, 'COMMENT_REQUIRED', 'This move needs a comment');
    }
    const to = statusById(deliveryWorkflow, input.toStatusId)!;
    t.previousStatusId = input.toStatusId === 'on_hold' ? t.statusId : null;
    t.statusId = input.toStatusId;
    touch(t);
    if (input.comment?.trim()) {
      (comments[key] ??= []).push({ id: uid('c'), authorId: me.user.id, body: input.comment.trim(), via: 'app', createdAt: t.updatedAt });
    }
    log(key, input.overrideReason ? `moved to ${to.name} (override: ${input.overrideReason})` : `moved to ${to.name}`);
    return clone(t);
  },

  async reorderTask(key, input) {
    await wait();
    const t = findTask(key);
    const siblings = sorted(tasks.filter((x) => x.sectionId === input.sectionId && x.key !== key));
    const idx = input.beforeKey ? siblings.findIndex((x) => x.key === input.beforeKey) : -1;
    if (idx === -1) {
      t.position = (siblings.at(-1)?.position ?? 0) + 1;
    } else {
      const next = siblings[idx]!;
      const prev = siblings[idx - 1];
      t.position = prev ? (prev.position + next.position) / 2 : next.position - 1;
    }
    if (t.sectionId !== input.sectionId) {
      const name = sections.find((s) => s.id === input.sectionId)?.name ?? 'another section';
      log(key, `moved to section ${name}`);
    }
    t.sectionId = input.sectionId;
    touch(t);
    return clone(t);
  },

  async addComment(key, body) {
    await wait();
    findTask(key);
    const c: Comment = { id: uid('c'), authorId: me.user.id, body, via: 'app', createdAt: new Date().toISOString() };
    (comments[key] ??= []).push(c);
    return clone(c);
  },

  async updateComment(key, commentId, body) {
    await wait();
    findTask(key);
    const c = (comments[key] ?? []).find((x) => x.id === commentId);
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Comment not found');
    if (c.authorId !== me.user.id) throw new ApiError(403, 'FORBIDDEN', 'You can only edit your own comments.');
    c.body = body;
    return clone(c);
  },

  async deleteComment(key, commentId) {
    await wait();
    findTask(key);
    const list = comments[key] ?? [];
    const c = list.find((x) => x.id === commentId);
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Comment not found');
    const canDelete = c.authorId === me.user.id || me.workspaceRole === 'owner' || me.workspaceRole === 'admin';
    if (!canDelete) throw new ApiError(403, 'FORBIDDEN', 'You cannot delete this comment.');
    comments[key] = list.filter((x) => x.id !== commentId);
  },

  async addSubtask(key, title) {
    await wait();
    const t = findTask(key);
    const s: Subtask = { id: uid('st'), title, done: false };
    (subtasks[key] ??= []).push(s);
    t.subtaskCount = { done: t.subtaskCount.done, total: t.subtaskCount.total + 1 };
    return clone(s);
  },

  async setSubtaskDone(key, subtaskId, done) {
    await wait();
    const t = findTask(key);
    const s = subtasks[key]?.find((x) => x.id === subtaskId);
    if (!s) throw new ApiError(404, 'NOT_FOUND', 'Subtask not found');
    s.done = done;
    const list = subtasks[key] ?? [];
    t.subtaskCount = { done: list.filter((x) => x.done).length, total: list.length };
    return clone(s);
  },

  async deleteTask(key) {
    await wait();
    const t = findTask(key);
    tasks = tasks.filter((x) => x.key !== key);
    deleted.set(key, t);
  },

  async setWatching(key, watch) {
    await wait();
    findTask(key);
    const list = watchers[key] ?? [];
    watchers[key] = watch
      ? [...new Set([...list, me.user.id])]
      : list.filter((id) => id !== me.user.id);
    return { ok: true };
  },

  async restoreTask(key) {
    await wait();
    const t = deleted.get(key);
    if (!t) throw new ApiError(404, 'NOT_FOUND', `${key} is not in Trash`);
    deleted.delete(key);
    tasks.push(t);
    return clone(t);
  },

  async listNotifications() {
    await wait();
    return notificationList();
  },

  async markNotificationsRead(input) {
    await wait();
    const now = new Date().toISOString();
    for (const n of notifications) {
      if (n.readAt) continue;
      if (input.all || n.id === input.id) n.readAt = now;
    }
    return notificationList();
  },
};
