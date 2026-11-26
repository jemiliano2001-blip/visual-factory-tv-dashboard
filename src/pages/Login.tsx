import React, { useEffect, useState } from 'react';
import { auth, isRealUser } from '../firebase';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged, type User } from 'firebase/auth';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Tv } from 'lucide-react';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  if (!checked) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError('');
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate(from, { replace: true });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError(code === 'auth/unauthorized-domain'
        ? 'Este sitio aún no está autorizado para entrar con Google.'
        : 'No se pudo entrar con Google. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      <div className="w-full max-w-md bg-card rounded-2xl p-10 shadow-card border border-border relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20">
            <Tv className="w-9 h-9 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Fábrica Visual</h1>
          <p className="text-muted-foreground mt-3 text-center font-medium text-pretty">Acceso exclusivo para personal SMV.</p>
        </div>

        {error && (
          <div role="alert" className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-2xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Correo electrónico
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              required
              autoComplete="username"
              spellCheck={false}
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-secondary/60 border border-input text-foreground rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground/60"
              placeholder="usuario@empresa.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-secondary/60 border border-input text-foreground rounded-xl pl-4 pr-12 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground/60"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            className="w-full cursor-pointer py-4 bg-primary hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 text-primary-foreground font-bold rounded-2xl transition-all disabled:opacity-50 shadow-xl shadow-primary/20 mt-2"
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> o <span className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full min-h-11 cursor-pointer py-3 bg-secondary hover:bg-secondary/80 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 text-foreground font-semibold rounded-2xl border border-input transition-all disabled:opacity-50"
        >
          Entrar con Google
        </button>

      </div>
    </div>
  );
}
