import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LayoutDashboard, BarChart3, LogOut, Tv } from 'lucide-react';
import { Button } from './ui/button';

export default function Layout() {
  const [user, setUser] = useState(auth.currentUser);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const isTvDashboard = location.pathname === '/';

  if (isTvDashboard) {
    return (
      <div className="h-dvh bg-background text-foreground">
        <Outlet />
      </div>
    );
  }

  const navItem = (to: string, icon: React.ReactNode, label: string) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
          isActive
            ? 'bg-primary/12 text-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
        )}
        <span className={isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}>
          {icon}
        </span>
        {label}
      </Link>
    );
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      {/* Glow sutil de profundidad — un solo foco, no neón en todo */}
      <div className="pointer-events-none absolute left-0 top-0 h-[40%] w-[35%] rounded-full bg-primary/5 blur-[120px]" />

      {/* Sidebar — oculto en móvil, visible en md+ */}
      <aside className="relative z-20 hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card/70 backdrop-blur-xl">
        {/* Marca */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <Tv className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-base font-extrabold leading-none tracking-tight text-foreground">
              Fábrica Visual
            </h1>
            <p className="mt-1 font-mono-data text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Control Room v2
            </p>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItem('/admin', <LayoutDashboard className="size-[18px]" />, 'Panel de Admin')}
          {navItem('/stats', <BarChart3 className="size-[18px]" />, 'Estadísticas')}

          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-2 px-3 font-mono-data text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              Vistas en vivo
            </p>
            <Link
              to="/"
              target="_blank"
              className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Tv className="size-[18px] text-success" />
              <span>TV Dashboard</span>
              <span className="ml-auto flex items-center gap-1.5 font-mono-data text-[9px] font-bold uppercase tracking-wider text-success">
                <span className="size-1.5 animate-pulse rounded-full bg-success" />
                Live
              </span>
            </Link>
          </div>
        </nav>

        {/* Usuario */}
        <div className="border-t border-border px-3 py-4">
          {user ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {(user.displayName || user.email || 'A')[0].toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{user.displayName || 'Admin'}</p>
                <p className="truncate font-mono-data text-[10px] text-muted-foreground">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          ) : (
            <Button asChild className="w-full">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          )}
        </div>
      </aside>

      {/* Contenido */}
      <main className="custom-scrollbar relative z-10 flex-1 overflow-auto pb-14 md:pb-0">
        <Outlet />
      </main>

      {/* Barra de navegación inferior — solo en móvil */}
      <nav
        className="fixed bottom-0 inset-x-0 z-30 flex md:hidden backdrop-blur-2xl"
        style={{ backgroundColor: 'rgba(10,10,16,0.93)', borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        {([
          { to: '/admin', icon: <LayoutDashboard className="size-[22px]" />, label: 'Admin' },
          { to: '/stats', icon: <BarChart3 className="size-[22px]" />, label: 'Stats' },
        ] as const).map(({ to, icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[58px] transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground/60'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="mobile-nav-active"
                  className="absolute inset-x-4 top-0 h-[2px] rounded-b-full bg-primary"
                  style={{ boxShadow: '0 0 10px rgba(99,102,241,0.9)' }}
                />
              )}
              <span className={`transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground/60'}`}>{icon}</span>
              <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.15em]">{label}</span>
            </Link>
          );
        })}
        <Link
          to="/"
          target="_blank"
          className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[58px] text-success/80 transition-colors hover:text-success"
        >
          <Tv className="size-[22px]" />
          <span className="font-mono-data text-[9px] font-bold uppercase tracking-[0.15em]">TV Live</span>
        </Link>
      </nav>
    </div>
  );
}
