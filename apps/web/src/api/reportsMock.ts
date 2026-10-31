import type { WorkspaceReports } from './queries';

const WEB = { id: 'p_web', projectId: 'p_web', key: 'WEB', name: 'Website relaunch', colour: 'var(--bt-cat-active)' };
const MOB = { id: 'p_mob', projectId: 'p_mob', key: 'MOB', name: 'Mobile app', colour: 'var(--bt-warning)' };
const CLI = { id: 'p_cli', projectId: 'p_cli', key: 'CLI', name: 'Client onboarding', colour: 'var(--bt-role-lead-fg)' };
const OPS = { id: 'p_ops', projectId: 'p_ops', key: 'OPS', name: 'Internal ops', colour: 'var(--bt-ink3)' };

/** Canvas fixture from Reports.dc.html / Chat 1. */
export function mockWorkspaceReports(): WorkspaceReports {
  return {
    range: { from: '2026-10-01', to: '2026-10-29' },
    timeZone: 'Europe/Malta',
    holidays: [],
    workingDaysSoFar: 21,
    tasks: {
      opened: 48,
      closed: 41,
      closedHint: '33 deployed · 8 rejected',
      open: 63,
      openHint: '21 in flight · 5 on hold',
      overdue: 7,
      unscheduled: 12,
      closeDays: '6.5 days',
      closeHint: 'median · average 9.1 days',
      startDays: '1.5 days',
      startHint: 'median · average 3.2 days · to first move into WIP or review',
      byProject: [
        { ...WEB, opened: 22, closed: 19, open: 28, flight: 9, overdue: 3, close: '5.5 d', start: '1.5 d' },
        { ...MOB, opened: 14, closed: 11, open: 19, flight: 6, overdue: 2, close: '8.0 d', start: '2.0 d' },
        { ...CLI, opened: 9, closed: 8, open: 11, flight: 4, overdue: 2, close: '7.0 d', start: '1.0 d' },
        { ...OPS, opened: 3, closed: 3, open: 5, flight: 2, overdue: 0, close: '3.0 d', start: '0.5 d' },
      ],
      byPerson: [
        { userId: 'u_karl', name: 'Karl Farrugia', initials: 'KF', open: 13, closed: 9, overdue: 1, close: '5.5 d' },
        { userId: 'u_luke', name: 'Luke Camilleri', initials: 'LC', open: 12, closed: 10, overdue: 1, close: '5.0 d' },
        { userId: 'u_maria', name: 'Maria Borg', initials: 'MB', open: 11, closed: 8, overdue: 2, close: '7.5 d' },
        { userId: 'u_scope', name: 'Scope', initials: 'SC', open: 9, closed: 5, overdue: 1, close: '6.0 d' },
        { userId: 'u_daniela', name: 'Daniela Vella', initials: 'DV', open: 8, closed: 6, overdue: 1, close: '8.0 d' },
        { userId: 'u_elena', name: 'Elena Grech', initials: 'EG', open: 6, closed: 3, overdue: 1, close: '9.0 d' },
        { userId: 'u_mark', name: 'Mark Calleja', initials: 'MC', open: 2, closed: 0, overdue: 0, close: '-' },
        { userId: null, name: 'Unassigned', initials: '', open: 2, closed: 0, overdue: 0, close: '-' },
      ],
      upcoming: [
        { key: 'MOB-27', title: 'Review push notification copy', who: 'Scope', status: 'Ready for testing', due: 'Today', dueTone: 'today' },
        { key: 'WEB-133', title: 'Lazy-load hero and product images', who: 'Karl Farrugia', status: 'Ready for testing', due: 'Fri 30 Oct', dueTone: 'normal' },
        { key: 'CLI-12', title: 'Welcome email sequence for new clients', who: 'Scope', status: 'WIP', due: 'Mon 2 Nov', dueTone: 'normal' },
        { key: 'WEB-158', title: 'Cookie banner overlaps the nav on mobile', who: 'Maria Borg', status: 'Approved', due: 'Tue 3 Nov', dueTone: 'normal' },
        { key: 'WEB-147', title: 'Rate-limit the login endpoint', who: 'Karl Farrugia', status: 'WIP', due: 'Wed 4 Nov', dueTone: 'normal' },
      ],
    },
    timesheets: {
      time: '659:30',
      peopleWithTime: 6,
      peopleTotal: 7,
      complete: 4,
      missingDays: 25,
      missingPeople: 3,
      daysOff: 7,
      daysOffPeople: 2,
      completeLabel: '4 complete · 2 partial · 1 none',
      projects: [WEB, MOB, CLI, OPS],
      people: [
        { userId: 'u_karl', name: 'Karl Farrugia', initials: 'KF', byProject: { p_web: '70:00', p_mob: '52:30', p_ops: '8:00' }, total: '130:30', off: 0, loggedDays: 21, expected: 21 },
        { userId: 'u_luke', name: 'Luke Camilleri', initials: 'LC', byProject: { p_web: '88:30', p_mob: '12:00', p_cli: '24:00', p_ops: '4:00' }, total: '128:30', off: 0, loggedDays: 21, expected: 21 },
        { userId: 'u_scope', name: 'Scope', initials: 'SC', byProject: { p_web: '38:00', p_mob: '31:30', p_cli: '29:00', p_ops: '18:30' }, total: '117:00', off: 0, loggedDays: 20, expected: 21 },
        { userId: 'u_maria', name: 'Maria Borg', initials: 'MB', byProject: { p_web: '62:00', p_mob: '44:00', p_ops: '6:00' }, total: '112:00', off: 0, loggedDays: 21, expected: 21 },
        { userId: 'u_daniela', name: 'Daniela Vella', initials: 'DV', byProject: { p_web: '20:00', p_cli: '71:30', p_ops: '10:00' }, total: '101:30', off: 2, loggedDays: 19, expected: 19 },
        { userId: 'u_elena', name: 'Elena Grech', initials: 'EG', byProject: { p_mob: '36:00', p_cli: '12:00', p_ops: '22:00' }, total: '70:00', off: 5, loggedDays: 13, expected: 16 },
        { userId: 'u_mark', name: 'Mark Calleja', initials: 'MC', byProject: {}, total: '0:00', off: 0, loggedDays: 0, expected: 21 },
      ],
      byProject: [
        { projectId: 'p_web', name: 'Website relaunch', colour: WEB.colour, time: '278:30', people: 5, share: '42%' },
        { projectId: 'p_mob', name: 'Mobile app', colour: MOB.colour, time: '176:00', people: 5, share: '27%' },
        { projectId: 'p_cli', name: 'Client onboarding', colour: CLI.colour, time: '136:30', people: 4, share: '21%' },
        { projectId: 'p_ops', name: 'Internal ops', colour: OPS.colour, time: '68:30', people: 6, share: '10%' },
      ],
      projectTotals: { p_web: '278:30', p_mob: '176:00', p_cli: '136:30', p_ops: '68:30', total: '659:30', off: 7 },
      missing: [
        { userId: 'u_mark', name: 'Mark Calleja', initials: 'MC', detail: 'No time and no days off this period', count: '21 days', tone: 'danger' },
        { userId: 'u_elena', name: 'Elena Grech', initials: 'EG', detail: 'Missing Mon 26 - Wed 28 Oct · on leave 12-16 Oct', count: '3 days', tone: 'warning' },
        { userId: 'u_scope', name: 'Scope', initials: 'SC', detail: 'Missing Fri 16 Oct', count: '1 day', tone: 'warning' },
      ],
    },
  };
}
