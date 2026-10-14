import { Navigate } from 'react-router-dom';

export function WelcomeGuestScreen() {
  return <Navigate to="/?welcome=guest" replace />;
}
