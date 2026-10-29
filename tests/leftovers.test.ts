import { describe, expect, test } from 'vitest';
import { renderMail } from '../apps/worker/src/mail.ts';
import { isDueForHardDelete, TRASH_MS } from '../apps/worker/src/trashPurge.ts';
import { digestSubject, shouldSendDigest, workingDaysBetween } from '../packages/shared/src/digest.ts';
import { readdirSync } from 'node:fs';
import { createTaskStartSlug, planningParentAllowed, planningTypeAllowed } from '../packages/shared/src/domain.ts';
import { CHECKS } from '../prisma/migrateDeploy.mjs';
import { allowedGroup, groupTasks } from '../apps/web/src/lib/taskFilters.ts';
import { initialStatusFor } from '../apps/web/src/lib/workflow.ts';
import type { ProjectDetail, Task } from '../apps/web/src/api/types.ts';
import {
  commentParentForClient,
  htmlToPlain,
  inboundCommentBody,
  inboundPlainFromParts,
  inboundSecretRequired,
  parseReplyAddress,
  parseSendGridEnvelope,
  resolveInboundSecret,
  skipWatcherBecauseMentioned,
} from '../packages/shared/src/inboundMail.ts';
import { signReplyToken, verifyReplyToken } from '../apps/api/src/lib/replyToken.ts';
import { trashToldCopy } from '../apps/web/src/lib/toldPeople.ts';
import { mergeDefaultAutomations, pickAssigneeForRole } from '../packages/shared/src/automations.ts';

describe('trash purge cutoff', () => {
  test('keeps tasks inside 30 days and hard-deletes older ones', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(isDueForHardDelete(new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), now)).toBe(false);
    expect(isDueForHardDelete(new Date(now.getTime() - TRASH_MS), now)).toBe(true);
    expect(isDueForHardDelete(null, now)).toBe(false);
  });
});

describe('daily digest', () => {
  test('skips digestMode off and builds a Today subject', () => {
    const now = new Date('2026-10-16T06:05:00Z');
    expect(
      shouldSendDigest({
        digestMode: 'off',
        emailEnabled: true,
        now,
        timeZone: 'Europe/Malta',
      }),
    ).toBe(false);
    expect(
      shouldSendDigest({
        digestMode: 'daily',
        emailEnabled: false,
        now,
        timeZone: 'Europe/Malta',
      }),
    ).toBe(false);
    expect(digestSubject(2, 1)).toBe('Today: 2 due, 1 mention');
  });

  test('counts more than 5 working days and renders digest mail', () => {
    const start = new Date('2026-10-05T08:00:00Z');
    const end = new Date('2026-10-16T08:00:00Z');
    expect(workingDaysBetween(start, end, 'UTC')).toBeGreaterThan(5);
    const rendered = renderMail({
      kind: 'digest',
      to: 'owner@borntask.com',
      greetingName: 'Maria',
      dateLabel: 'Fri 16 Oct',
      myTasksUrl: 'http://localhost:5174/',
      profileUrl: 'http://localhost:5174/settings/profile',
      due: [{ key: 'WEB-142', title: 'Checkout fails', statusName: 'Testing', url: 'http://localhost:5174/p/WEB/list?task=WEB-142' }],
      overdue: [],
      mentions: [{ key: 'WEB-133', title: 'Copy', extra: 'Karl on WEB-133: "ready"', url: 'http://localhost:5174/p/WEB/list?task=WEB-133' }],
      staleIdeas: [],
      footerNote: 'Sent at 08:00 on workdays.',
    });
    expect(rendered.subject).toBe('Today: 1 due, 1 mention');
    expect(rendered.text).toContain('Good morning, Maria');
    expect(rendered.html).toContain('Open My tasks');
    expect(rendered.html).toContain('borntask-logo-120.png');
    expect(rendered.html).toContain('<table role="presentation"');
    expect(rendered.html).toContain('Due today');
    expect(rendered.html).toContain('WEB-142');
  });

  test('strips mention HTML for digest extras', () => {
    const html = '<p><span data-type="mention" data-label="Hannah">@Hannah</span> we also need a banner</p>';
    expect(htmlToPlain(html)).toBe('@Hannah we also need a banner');
    expect(htmlToPlain('<p>Karl on WEB-133:</p><p>ready <strong>now</strong></p>')).toBe('Karl on WEB-133:\nready now');
  });

  test('renders a per-ticket email without raw HTML', () => {
    const rendered = renderMail({
      kind: 'task-event',
      to: 'hannah@example.com',
      greetingName: 'Hannah',
      actorName: 'Neville',
      eventLabel: 'mentioned you',
      taskKey: 'RBL-5',
      title: 'Need a banner',
      projectName: 'Rows Big Launch',
      statusName: 'Idea',
      comment: '@Hannah we also need a banner',
      url: 'http://localhost:5174/p/RBL/list?task=RBL-5',
      replyTo: 'reply+u.t.sig@notify.borntask.com',
      profileUrl: 'http://localhost:5174/settings/profile',
    });
    expect(rendered.subject).toContain('RBL-5');
    expect(rendered.html).toContain('Open task');
    expect(rendered.html).not.toContain('data-type');
    expect(rendered.text).toContain('Reply to this email to add a comment.');
  });
});

describe('inbound mail replies', () => {
  test('signs and verifies a reply token', () => {
    const token = signReplyToken('user1', 'task1', 'secret');
    expect(verifyReplyToken(token, 'secret')).toEqual({ userId: 'user1', taskId: 'task1' });
    expect(verifyReplyToken(token, 'other')).toBeNull();
  });

  test('parses the reply plus address and drops quoted history', () => {
    expect(parseReplyAddress('BornTask <reply+user.task.sig@notify.borntask.com>')).toBe('user.task.sig');
    expect(inboundCommentBody('Looks good.\n\nOn Tue, someone wrote:\n> old')).toBe('Looks good.');
  });

  test('parses SendGrid envelope JSON and html-only bodies', () => {
    expect(parseSendGridEnvelope('{"to":["reply+u.t.s@notify.borntask.com"],"from":"hannah@example.com"}')).toEqual({
      to: 'reply+u.t.s@notify.borntask.com',
      from: 'hannah@example.com',
    });
    expect(inboundPlainFromParts('', '<p>Looks good.</p>')).toBe('Looks good.');
    expect(inboundCommentBody(inboundPlainFromParts('', '<p>Looks good.</p><br>On Tue, someone wrote:<br>&gt; old'))).toBe('Looks good.');
  });

  test('rejects inbound mail in production when the secret is unset', () => {
    expect(inboundSecretRequired('production')).toBe(true);
    expect(inboundSecretRequired('development')).toBe(false);
    expect(resolveInboundSecret('s3cret', 'production')).toBe('s3cret');
    expect(resolveInboundSecret('', 'production')).toBe('missing');
    expect(resolveInboundSecret('', 'development')).toBeNull();
  });

  test('renders the email sign-in code mail', () => {
    const rendered = renderMail({
      kind: 'login-code',
      to: 'maya@example.com',
      code: '123456',
      linkUrl: 'http://localhost:5174/sign-in/email?token=t',
    });
    expect(rendered.subject).toBe('123456 is your BornTask sign-in code');
    expect(rendered.text).toContain('http://localhost:5174/sign-in/email?token=t');
    expect(rendered.html).not.toContain('\u2014');
  });
});

describe('delete confirm copy', () => {
  test('names the people who will be told', () => {
    expect(trashToldCopy(['Karl Farrugia'])).toBe('They go to Trash for 30 days, and Karl Farrugia is told.');
    expect(trashToldCopy(['Karl Farrugia', 'Maria Borg'])).toBe(
      'They go to Trash for 30 days, and Karl Farrugia and Maria Borg are told.',
    );
  });
});

describe('copy start status', () => {
  test('uses Idea for ideas and bugsStartIn for bugs', () => {
    expect(createTaskStartSlug('idea')).toBe('idea');
    expect(createTaskStartSlug('feature')).toBe('idea');
    expect(createTaskStartSlug('bug', 'approved')).toBe('approved');
    expect(createTaskStartSlug('bug', 'idea')).toBe('idea');
    expect(createTaskStartSlug('bug')).toBe('approved');
    expect(createTaskStartSlug('story', undefined, true)).toBe('idea');
    expect(createTaskStartSlug('story', undefined, false)).toBe('approved');
    expect(createTaskStartSlug('epic', undefined, false)).toBe('approved');
  });
});

describe('planning parent rules', () => {
  test('keeps epics and stories optional and two levels deep', () => {
    expect(planningTypeAllowed('off', 'story')).toBe(false);
    expect(planningTypeAllowed('stories', 'epic')).toBe(false);
    expect(planningParentAllowed('stories', 'feature', 'story')).toBe(true);
    expect(planningParentAllowed('stories', 'story', 'epic')).toBe(false);
    expect(planningParentAllowed('epics_stories', 'story', 'epic')).toBe(true);
    expect(planningParentAllowed('epics_stories', 'epic', 'story')).toBe(false);
  });
});

describe('quick add start status', () => {
  test('follows workspace bugsStartIn', () => {
    expect(initialStatusFor('bug', undefined, true, 'idea')).toBe('idea');
    expect(initialStatusFor('bug', undefined, true, 'approved')).toBe('approved');
    expect(initialStatusFor('story', undefined, false)).toBe('approved');
    expect(initialStatusFor('story', undefined, true)).toBe('idea');
  });
});

describe('list grouping', () => {
  test('keeps children under a story that the open filter hid', () => {
    const story = { id: 's1', type: 'story', title: 'Checkout', planningParentId: null } as Task;
    const child = { id: 't1', type: 'bug', title: 'Fail', planningParentId: 's1' } as Task;
    const detail = { sections: [], users: [], workflow: { statuses: [] } } as unknown as ProjectDetail;
    const groups = groupTasks([child], 'story', detail, [story, child]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('s1');
    expect(groups[0]?.tasks.map((row) => row.id)).toEqual(['t1']);
  });

  test('drops story grouping when work breakdown is off', () => {
    expect(allowedGroup('story', 'off')).toBe('section');
    expect(allowedGroup('epic', 'stories')).toBe('section');
    expect(allowedGroup('story', 'stories')).toBe('story');
  });
});

describe('comment replies and notify de-dupe', () => {
  test('treats replies whose parent is gone as top-level', () => {
    const comments = [
      { id: 'c2', parentId: 'c1' },
      { id: 'c3', parentId: null },
    ];
    expect(commentParentForClient(comments, comments[0]!)).toBeNull();
    expect(commentParentForClient([{ id: 'c1', parentId: null }, ...comments], comments[0]!)).toBe('c1');
  });

  test('skips the watcher email when that person was mentioned', () => {
    expect(skipWatcherBecauseMentioned(['u_hannah'], 'u_hannah')).toBe(true);
    expect(skipWatcherBecauseMentioned(['u_hannah'], 'u_karl')).toBe(false);
  });
});

describe('project automations', () => {
  test('prefers the lead when they are also a Tester, else the first Tester', () => {
    expect(
      pickAssigneeForRole(
        [
          { userId: 'maria', roleSlugs: ['tester'], isLead: false },
          { userId: 'karl', roleSlugs: ['tester', 'lead'], isLead: true },
        ],
        'tester',
      ),
    ).toBe('karl');
    expect(
      pickAssigneeForRole(
        [
          { userId: 'maria', roleSlugs: ['tester'], isLead: false },
          { userId: 'luke', roleSlugs: ['developer'], isLead: true },
        ],
        'tester',
      ),
    ).toBe('maria');
    expect(pickAssigneeForRole([{ userId: 'luke', roleSlugs: ['developer'], isLead: true }], 'tester')).toBeNull();
  });

  test('keeps default templates and extra status rules', () => {
    const merged = mergeDefaultAutomations([
      { onStatusSlug: 'deployed', action: 'notify_role', roleSlug: 'business', enabled: true },
      { onStatusSlug: 'wip', action: 'assign_role', roleSlug: 'developer', enabled: true },
    ]);
    expect(merged[0]).toEqual({ onStatusSlug: 'ready_for_testing', action: 'assign_role', roleSlug: 'tester', enabled: false });
    expect(merged[1]?.enabled).toBe(true);
    expect(merged[2]?.onStatusSlug).toBe('wip');
  });
});

describe('prisma migrate baseline list', () => {
  test('covers every folder in prisma/migrations', () => {
    const folders = readdirSync(new URL('../prisma/migrations', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(CHECKS.map((row) => row.name).sort()).toEqual(folders);
  });
});
