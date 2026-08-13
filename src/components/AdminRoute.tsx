import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { auth, isRealUser, isVerifiedRealUser } from '../firebase';
import { hasAdminClaim } from '../services/adminAccess';

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [state, setState] = useState<'checking' | 'login' | 'denied' | 'allowed'>('checking');

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isRealUser(user)) {
        if (active) setState('login');
        return;
      }
      if (!isVerifiedRealUser(user)) {
        if (active) setState('denied');
        return;
      }

      try {
        const token = await user.getIdTokenResult();
        if (active) setState(hasAdminClaim(token.claims) ? 'allowed' : 'denied');
      } catch {
        if (active) setState('denied');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (state === 'checking') {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /></div>;
  }
  if (state === 'login') return <Navigate to="/login" state={{ from: location }} replace />;
  if (state === 'denied') {
    return (
      <section className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-black text-white">Acceso restringido</h1>
        <p className="text-sm text-zinc-400">Esta cuenta no tiene el permiso administrativo requerido.</p>
        <Link to="/" className="rounded-lg bg-indigo-500 px-4 py-2 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Volver al tablero</Link>
      </section>
    );
  }
  return <>{children}</>;
}
