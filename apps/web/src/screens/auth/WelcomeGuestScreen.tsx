import { Button } from 'antd';
import { Link } from 'react-router-dom';
import { useMyTasks, useProjects } from '../../api/queries';
import { AuthFrame } from './AuthFrame';

export function WelcomeGuestScreen() {
  const projects = useProjects().data ?? [];
  const approvals = useMyTasks().data?.approvals ?? [];
  const first = projects[0];
  return (
    <AuthFrame title="Welcome - you are a guest">
      <p>
        You can see the project you were invited to. If you hold the Business role you can approve ideas.
        You cannot create projects or see the full member list.
      </p>
      {first && <p>Your project: <Link to={`/p/${first.key}/list`}>{first.name}</Link></p>}
      {approvals.length > 0 && <p>{approvals.length} item{approvals.length === 1 ? '' : 's'} waiting for your approval.</p>}
      <Button type="primary" href={first ? `/p/${first.key}/list` : '/'}>Open your project</Button>
    </AuthFrame>
  );
}
