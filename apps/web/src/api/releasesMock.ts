import { isReleaseReleased, summariseReleaseProgress } from '@borntask/shared';
import type { WorkspaceRelease } from './queries';

const MOCK_TASKS = [
  { key: 'WEB-128', title: 'Move images to the new CDN', projectKey: 'WEB', projectName: 'Website', statusId: 'deployed', statusName: 'Deployed', statusCategory: 'done' as const },
  { key: 'WEB-121', title: 'Regenerate the sitemap nightly', projectKey: 'WEB', projectName: 'Website', statusId: 'deployed', statusName: 'Deployed', statusCategory: 'done' as const },
  { key: 'MOB-27', title: 'Review push notification copy', projectKey: 'MOB', projectName: 'Mobile', statusId: 'ready_for_testing', statusName: 'Ready for testing', statusCategory: 'review' as const },
];

function pack(id: string, name: string, date: string, projectKey?: string): WorkspaceRelease {
  const tasks = MOCK_TASKS.filter((task) => !projectKey || task.projectKey === projectKey);
  const progress = summariseReleaseProgress(tasks);
  const released = isReleaseReleased(date, '2026-11-06');
  const projects = [...new Map(tasks.map((task) => [task.projectKey, { key: task.projectKey, name: task.projectName }])).values()]
    .map((project) => ({ ...project, count: tasks.filter((task) => task.projectKey === project.key).length }));
  return {
    id,
    name,
    date,
    released,
    taskCount: progress.total,
    projectCount: projects.length,
    progress,
    projects,
    tasks,
    shipped: released ? tasks.filter((task) => task.statusCategory === 'done') : [],
  };
}

export function mockReleases(projectKey?: string): WorkspaceRelease[] {
  return [
    pack('rel_nov', 'November', '2026-11-12', projectKey),
    pack('rel_ga', 'Google Analytics', '2026-11-20', projectKey),
  ];
}
