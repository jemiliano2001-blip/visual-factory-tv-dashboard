import { lazy, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

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
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AppShellChrome />
    </Suspense>
  );
}
