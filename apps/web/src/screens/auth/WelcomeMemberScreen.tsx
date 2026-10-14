import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { useProjects } from '../../api/queries';
import { AuthFrame } from './AuthFrame';

export function WelcomeMemberScreen() {
  const projects = useProjects().data ?? [];
  return (
    <AuthFrame title="Welcome to the workspace">
      <p>Nothing is assigned to you yet. Open a project to see the backlog, or create a task with Q.</p>
      {projects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Projects you can open</div>
          {projects.map((p) => (
            <Link key={p.key} to={`/p/${p.key}/list`}>{p.name}</Link>
          ))}
        </div>
      )}
      <Button type="primary" href="/">Go to My tasks</Button>
    </AuthFrame>
  );
}
