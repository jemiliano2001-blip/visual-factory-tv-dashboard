import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import TVDashboard from './pages/TVDashboard';
import AdminPanel from './pages/AdminPanel';
import StatsDashboard from './pages/StatsDashboard';
import Login from './pages/Login';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);

  useEffect(() => {
    const checkApiKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();
    
    const unsubscribe = onAuthStateChanged(auth, () => {
      setIsAuthReady(true);
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={<Layout />}>
            <Route index element={
              <ProtectedRoute>
                <TVDashboard />
              </ProtectedRoute>
            } />
            
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
      </BrowserRouter>
    </ErrorBoundary>
  );
}
