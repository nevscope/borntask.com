import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from './api/http';
import { useMe } from './api/queries';
import { safeNext } from './lib/safeNext';
import { color } from './theme/tokens';
import { AppShell } from './components/AppShell';
import { CommandPalette } from './components/CommandPalette';
import { useQuickAdd } from './components/QuickAdd';
import { AcceptInviteScreen } from './screens/auth/AcceptInviteScreen';
import { CreateWorkspaceScreen } from './screens/auth/CreateWorkspaceScreen';
import { SignInScreen } from './screens/auth/SignInScreen';
import { WelcomeGuestScreen } from './screens/auth/WelcomeGuestScreen';
import { WelcomeMemberScreen } from './screens/auth/WelcomeMemberScreen';
import { WrongAccountScreen } from './screens/auth/WrongAccountScreen';
import { MyTasksScreen } from './screens/MyTasksScreen';
import { ProjectBoardScreen } from './screens/ProjectBoardScreen';
import { ProjectListScreen } from './screens/ProjectListScreen';
import { SearchScreen } from './screens/SearchScreen';
import { TrashScreen } from './screens/TrashScreen';
import { WorkflowEditorScreen } from './screens/WorkflowEditorScreen';
import { AdminDefaultsScreen } from './screens/AdminDefaultsScreen';
import { AdminPeopleScreen } from './screens/AdminPeopleScreen';
import { CreateProjectScreen } from './screens/CreateProjectScreen';
import { ImportScreen } from './screens/ImportScreen';
import { ProjectMembersScreen } from './screens/ProjectMembersScreen';
import { ProjectStructureScreen } from './screens/ProjectStructureScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { WorkspaceGeneralScreen } from './screens/WorkspaceGeneralScreen';
import { AdminBillingScreen } from './screens/AdminBillingScreen';
import { ApiTokensScreen } from './screens/ApiTokensScreen';
import { GitHubSettingsScreen } from './screens/GitHubSettingsScreen';
import { GoogleChatScreen } from './screens/GoogleChatScreen';
import { ProfileSettingsScreen } from './screens/ProfileSettingsScreen';
import { McpConnectedScreen } from './screens/auth/McpConnectedScreen';
import { McpConsentScreen } from './screens/auth/McpConsentScreen';

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
  }, [screen]);

  return null;
}

function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isLoading) {
    return <div style={{ minHeight: '100dvh', background: color.canvas }} aria-busy="true" aria-label="Checking sign-in" />;
  }
  const unauthenticated = me.isError && me.error instanceof ApiError && me.error.status === 401;
  if (unauthenticated || !me.data) {
    const dest = safeNext(`${location.pathname}${location.search}`);
    return <Navigate to={dest ? `/sign-in?next=${encodeURIComponent(dest)}` : '/sign-in'} replace />;
  }
  return <Outlet />;
}

function Shell() {
  return (
    <AppShell>
      <DemoScreenParam />
      <CommandPalette />
      <Routes>
        <Route path="/" element={<MyTasksScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/projects/new" element={<CreateProjectScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/settings/workflow" element={<WorkflowEditorScreen />} />
        <Route path="/settings/people" element={<AdminPeopleScreen />} />
        <Route path="/settings/defaults" element={<AdminDefaultsScreen />} />
        <Route path="/settings/workspace" element={<WorkspaceGeneralScreen />} />
        <Route path="/settings/billing" element={<AdminBillingScreen />} />
        <Route path="/settings/profile" element={<ProfileSettingsScreen />} />
        <Route path="/settings/tokens" element={<ApiTokensScreen />} />
        <Route path="/p/:projectKey" element={<Navigate to="list" replace />} />
        <Route path="/p/:projectKey/list" element={<ProjectListScreen />} />
        <Route path="/p/:projectKey/board" element={<ProjectBoardScreen />} />
        <Route path="/p/:projectKey/trash" element={<TrashScreen />} />
        <Route path="/p/:projectKey/settings/members" element={<ProjectMembersScreen />} />
        <Route path="/p/:projectKey/settings/structure" element={<ProjectStructureScreen />} />
        <Route path="/p/:projectKey/settings/workflow" element={<WorkflowEditorScreen />} />
        <Route path="/p/:projectKey/settings/chat" element={<GoogleChatScreen />} />
        <Route path="/p/:projectKey/settings/github" element={<GitHubSettingsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/invite/:token" element={<AcceptInviteScreen />} />
      <Route path="/invite/:token/wrong-account" element={<WrongAccountScreen />} />
      <Route element={<RequireAuth />}>
        <Route path="/welcome/member" element={<WelcomeMemberScreen />} />
        <Route path="/welcome/guest" element={<WelcomeGuestScreen />} />
        <Route path="/create-workspace" element={<CreateWorkspaceScreen />} />
        <Route path="/oauth/consent" element={<McpConsentScreen />} />
        <Route path="/oauth/connected" element={<McpConnectedScreen />} />
        <Route path="/*" element={<Shell />} />
      </Route>
    </Routes>
  );
}
