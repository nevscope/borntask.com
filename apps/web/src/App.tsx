import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useQuickAdd } from './components/QuickAdd';
import { MyTasksScreen } from './screens/MyTasksScreen';
import { ProjectBoardScreen } from './screens/ProjectBoardScreen';
import { ProjectListScreen } from './screens/ProjectListScreen';

/**
 * Demo navigation for reviews: ?screen=my-tasks | list | board | task | quick-add
 * jumps straight to one of the five screens. Remove once real routing/auth lands.
 */
const DEMO_SCREENS: Record<string, { path: string; task?: string; quickAdd?: boolean }> = {
  'my-tasks': { path: '/' },
  list: { path: '/p/WEB/list' },
  board: { path: '/p/WEB/board' },
  task: { path: '/p/WEB/list', task: 'WEB-142' },
  'quick-add': { path: '/', quickAdd: true },
};

function DemoScreenParam() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();
  const screen = params.get('screen');

  useEffect(() => {
    if (!screen) return;
    const target = DEMO_SCREENS[screen];
    if (!target) return;
    navigate(target.task ? `${target.path}?task=${target.task}` : target.path, { replace: true });
    if (target.quickAdd) quickAdd.open({ projectKey: 'WEB' });
    // Runs once per ?screen= value.
  }, [screen]);

  return null;
}

export function App() {
  return (
    <AppShell>
      <DemoScreenParam />
      <Routes>
        <Route path="/" element={<MyTasksScreen />} />
        <Route path="/p/:projectKey" element={<Navigate to="list" replace />} />
        <Route path="/p/:projectKey/list" element={<ProjectListScreen />} />
        <Route path="/p/:projectKey/board" element={<ProjectBoardScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
