import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { auth } from './firebase';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import TVDashboard from './pages/TVDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import { TooltipProvider } from './components/ui/tooltip';

const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const StatsDashboard = lazy(() => import('./pages/StatsDashboard'));
const Login = lazy(() => import('./pages/Login'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Fábrica Visual TV — SMV',
  '/admin': 'Administración — Fábrica Visual TV',
  '/stats': 'Estadísticas — Fábrica Visual TV',
  '/login': 'Iniciar sesión — Fábrica Visual TV',
};

function RouteTitleSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = ROUTE_TITLES[pathname] ?? 'Fábrica Visual TV — SMV';
  }, [pathname]);
  return null;
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let unsubAuth: (() => void) | null = null;

    async function initAuth() {
      // Detección de SSO token desde SMV Hub
      const hash = typeof window !== 'undefined' && window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : '';
      if (hash) {
        const params = new URLSearchParams(hash);
        const ssoToken = params.get('sso_token');
        if (ssoToken) {
          try {
            await signInWithCustomToken(auth, ssoToken);
          } catch (err) {
            console.error('[visual-factory][auth] signInWithCustomToken falló:', err);
          } finally {
            const urlLimpia = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', urlLimpia);
          }
        }
      }

      if (cancelado) return;

      unsubAuth = onAuthStateChanged(auth, () => {
        if (cancelado) return;
        // Sin sesión no se crea una cuenta anónima: cada ruta protegida manda a /login.
        setIsAuthReady(true);
      });
    }

    void initAuth();

    return () => {
      cancelado = true;
      if (unsubAuth) unsubAuth();
    };
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <RouteTitleSync />
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/login" element={
                  <ErrorBoundary>
                    <Login />
                  </ErrorBoundary>
                } />

                <Route path="/" element={<Layout />}>
                  {/* TV dashboard: exige cuenta real de personal SMV (la TV usa una cuenta de solo lectura). */}
                  <Route index element={
                    <ProtectedRoute>
                      <ErrorBoundary>
                        <TVDashboard />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  } />

                  {/* /admin es herramienta de trabajo del equipo de diseño, no un panel
                      restringido — cualquier cuenta real (no anónima) entra, igual que /stats. */}
                  <Route path="admin" element={
                    <ProtectedRoute>
                      <ErrorBoundary>
                        <AdminPanel />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  } />

                  <Route path="stats" element={
                    <ProtectedRoute>
                      <ErrorBoundary>
                        <StatsDashboard />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  } />

                  {/* Ruta desconocida: en vez de una pantalla en blanco, de vuelta a Órdenes. */}
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </MotionConfig>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
