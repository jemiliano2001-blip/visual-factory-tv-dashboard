import React, { useEffect, useState } from 'react';
import { auth, isRealUser } from '../firebase';
import { signInWithCustomToken, signInWithEmailAndPassword, onAuthStateChanged, type User } from 'firebase/auth';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Tv } from 'lucide-react';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [user, setUser]         = useState<User | null>(auth.currentUser);
  const [checked, setChecked]   = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setChecked(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const hash = typeof window !== 'undefined' && window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : '';
    if (hash) {
      const params = new URLSearchParams(hash);
      const ssoToken = params.get('sso_token');
      if (ssoToken) {
        setLoading(true);
        signInWithCustomToken(auth, ssoToken)
          .then(() => {
            const urlLimpia = window.location.pathname + window.location.search;
            window.history.replaceState(null, '', urlLimpia);
            navigate(from, { replace: true });
          })
          .catch((err) => {
            console.error('[visual-factory][login] SSO falló:', err);
            setError('No se pudo autenticar con SSO token.');
          })
          .finally(() => {
            setLoading(false);
          });
      }
    }
  }, [from, navigate]);


  if (!checked) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isRealUser(user)) {
    return <Navigate to={from} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      await signInWithEmailAndPassword(auth, email, password);
      navigate(from, { replace: true });
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      {/* Background accent — indigo only, no fuchsia */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/60 backdrop-blur-2xl rounded-3xl p-10 shadow-2xl border border-white/10 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 border border-indigo-500/20">
            <Tv className="w-9 h-9 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight">Fábrica Visual</h1>
          <p className="text-zinc-400 mt-3 text-center font-medium text-pretty">Acceso exclusivo para personal SMV.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-zinc-800/60 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-zinc-600"
              placeholder="usuario@empresa.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Contraseña
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-zinc-800/60 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder-zinc-600"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-indigo-500/20 mt-2"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

      </div>
    </div>
  );
}
