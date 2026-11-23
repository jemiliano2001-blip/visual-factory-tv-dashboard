import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ErrorBoundary from './ErrorBoundary';

const AppShellChrome = lazy(() => import('./AppShellChrome'));

export default function Layout() {
  const location = useLocation();

  if (location.pathname === '/') {
    return (
      <div className="h-dvh bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <AppShellChrome />
      </Suspense>
    </ErrorBoundary>
  );
}
