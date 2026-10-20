import { describe, expect, test } from 'vitest';
import { renderMail } from '../apps/worker/src/mail.ts';
import { isDueForHardDelete, TRASH_MS } from '../apps/worker/src/trashPurge.ts';
import { digestSubject, shouldSendDigest, workingDaysBetween } from '../packages/shared/src/digest.ts';
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
});

describe('delete confirm copy', () => {
  test('names the people who will be told', () => {
    expect(trashToldCopy(['Karl Farrugia'])).toBe('They go to Trash for 30 days, and Karl Farrugia is told.');
    expect(trashToldCopy(['Karl Farrugia', 'Maria Borg'])).toBe(
      'They go to Trash for 30 days, and Karl Farrugia and Maria Borg are told.',
    );
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
