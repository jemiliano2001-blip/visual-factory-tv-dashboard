import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LayoutDashboard, BarChart3, LogOut, Tv } from 'lucide-react';

export default function Layout() {
  const [user, setUser] = useState(auth.currentUser);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const isTvDashboard = location.pathname === '/';

  if (isTvDashboard) {
    return (
      <div className="min-h-screen text-white" style={{ backgroundColor: '#0a0a0f' }}>
        <Outlet />
      </div>
    );
  }

  const navItem = (to: string, icon: React.ReactNode, label: string) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm ${
          isActive
            ? 'bg-white/8 text-indigo-300 border-l-4 border-indigo-500 shadow-[inset_0_0_12px_rgba(99,102,241,0.15)] pl-3'
            : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border-l-4 border-transparent'
        }`}
      >
        <span className={isActive ? 'text-indigo-400' : 'text-zinc-500'}>{icon}</span>
        {label}
      </Link>
    );
  };

  return (
    <div className="flex h-screen text-white font-sans overflow-hidden relative" style={{ backgroundColor: '#0a0a0f' }}>
      {/* Background orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/8 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-600/8 rounded-full blur-[140px] pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-64 flex flex-col relative z-20 shrink-0" style={{ backgroundColor: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(24px)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Brand */}
        <div className="px-5 py-6 border-b border-white/8">
          <h1 className="font-display text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 flex items-center gap-2.5 tracking-tight">
            <Tv className="w-6 h-6 text-indigo-400 shrink-0" />
            Fábrica Visual
          </h1>
          <p className="text-zinc-600 text-[10px] font-mono-data uppercase tracking-widest mt-1.5 pl-8">Control Room v2</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-1">
          {navItem('/admin', <LayoutDashboard className="w-4 h-4" />, 'Panel de Admin')}
          {navItem('/stats', <BarChart3 className="w-4 h-4" />, 'Estadísticas')}

          <div className="pt-5 mt-4 border-t border-white/8">
            <p className="px-4 text-[9px] font-mono-data font-bold text-zinc-600 uppercase tracking-[0.2em] mb-2">Vistas en Vivo</p>
            <Link
              to="/"
              target="_blank"
              className="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-semibold text-sm text-emerald-300/80 hover:text-emerald-200 hover:bg-emerald-500/8 border-l-4 border-emerald-500/40 hover:border-emerald-400 pl-3"
            >
              <Tv className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>TV Dashboard</span>
              <span className="ml-auto flex items-center gap-1 text-[9px] font-mono-data text-emerald-500/60 group-hover:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                EN VIVO
              </span>
            </Link>
          </div>
        </nav>

        {/* User card */}
        <div className="px-3 py-4 border-t border-white/8">
          {user ? (
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/4 border border-white/6">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
                {(user.displayName || user.email || 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-bold truncate">{user.displayName || 'Admin'}</p>
                <p className="text-zinc-500 text-[10px] truncate font-mono-data">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-red-500/20 rounded-lg text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="block w-full text-center py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white rounded-xl transition-all font-bold text-sm shadow-lg">
              Iniciar Sesión
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative z-10 custom-scrollbar">
        <Outlet />
      </main>
    </div>
  );
}
