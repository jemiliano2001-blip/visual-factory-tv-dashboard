import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();

    // Detección de SSO token desde SMV Hub
    const hash = typeof window !== 'undefined' && window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const ssoToken = params.get('sso_token');
      if (ssoToken) {
        signInWithCustomToken(auth, ssoToken)
          .then(() => {
            const urlLimpia = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', urlLimpia);
          })
          .catch((err) => {
            console.error('[visual-factory][auth] signInWithCustomToken falló:', err);
          });
      }
    }


    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
          // onAuthStateChanged fires again once signed in
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          setAuthError(
            'No se pudo iniciar la sesión anónima de Firebase. Sin ella, el tablero no puede cargar datos de Odoo ni configuración. Habilita "Anonymous" en Firebase Console → Authentication → Sign-in method.',
          );
          console.error('[Auth] signInAnonymously falló:', msg);
          setIsAuthReady(true);
        }
      } else {
        setAuthError(null);
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-lg space-y-6">
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Error de autenticación
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">{authError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-8">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto">
            <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-black text-white uppercase tracking-tight">Configuración de IA Requerida</h1>
            <p className="text-zinc-400">Para habilitar la generación de imágenes y funciones avanzadas, por favor selecciona tu clave de API de Google Cloud.</p>
          </div>
          <button
            onClick={async () => {
              if (window.aistudio) {
                await window.aistudio.openSelectKey();
                setHasApiKey(true);
              }
            }}
            className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/20"
          >
            Seleccionar Clave de API
          </button>
          <p className="text-xs text-zinc-600">
            Requiere una clave de un proyecto de Google Cloud con facturación habilitada.
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline ml-1">Más info</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />

                <Route path="/" element={<Layout />}>
                  {/* TV dashboard: público sin login visible — auth anónima provee el ID token */}
                  <Route index element={<TVDashboard />} />

                  {/* /admin es herramienta de trabajo del equipo de diseño, no un panel
                      restringido — cualquier cuenta real (no anónima) entra, igual que /stats. */}
                  <Route path="admin" element={
                    <ProtectedRoute>
                      <AdminPanel />
                    </ProtectedRoute>
                  } />

                  <Route path="stats" element={
                    <ProtectedRoute>
                      <StatsDashboard />
                    </ProtectedRoute>
                  } />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </MotionConfig>
      </TooltipProvider>
    </ErrorBoundary>
  );
}
