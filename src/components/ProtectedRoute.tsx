import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { auth, isRealUser } from '../firebase';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  if (!isRealUser(auth.currentUser)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
