import { Navigate } from 'react-router-dom';

export function WelcomeMemberScreen() {
  return <Navigate to="/?welcome=member" replace />;
}
