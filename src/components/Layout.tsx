import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LayoutDashboard, Settings, BarChart3, LogOut, Tv } from 'lucide-react';

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
      <div className="min-h-screen bg-zinc-950 text-white">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white font-sans overflow-hidden relative">
      {/* Global Background Orbs for Layout */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Sidebar */}
      <aside className="w-72 bg-zinc-900/40 backdrop-blur-2xl border-r border-white/10 flex flex-col relative z-20 shadow-2xl">
        <div className="p-8 border-b border-white/10">
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400 flex items-center gap-3 tracking-tight">
            <Tv className="w-8 h-8 text-indigo-400" />
            Fábrica Visual
          </h1>
        </div>
        
        <nav className="flex-1 p-6 space-y-3">
          <Link 
            to="/admin" 
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold ${location.pathname === '/admin' ? 'bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 text-white border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'}`}
          >
            <Settings className={`w-6 h-6 ${location.pathname === '/admin' ? 'text-indigo-400' : ''}`} />
            Panel de Admin
          </Link>
          <Link 
            to="/stats" 
            className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold ${location.pathname === '/stats' ? 'bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 text-white border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)]' : 'text-zinc-400 hover:bg-white/5 hover:text-white border border-transparent'}`}
          >
            <BarChart3 className={`w-6 h-6 ${location.pathname === '/stats' ? 'text-fuchsia-400' : ''}`} />
            Estadísticas
          </Link>

          <div className="pt-6 mt-6 border-t border-white/10">
            <p className="px-5 text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Vistas en Vivo</p>
            <Link 
              to="/" 
              target="_blank"
              className="group relative flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-bold bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 hover:from-emerald-500/20 hover:to-cyan-500/20 text-emerald-100 border border-emerald-500/30 hover:border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/10 to-emerald-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
              <div className="relative z-10 flex items-center gap-4 w-full">
                <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                  <Tv className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-emerald-50 tracking-wide">TV Dashboard</span>
                  <span className="text-[10px] text-emerald-400/70 uppercase tracking-widest font-black mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En Vivo
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </nav>

        <div className="p-6 border-t border-white/10 bg-black/20">
          {user ? (
            <div className="flex items-center justify-between bg-zinc-800/50 p-4 rounded-2xl border border-white/5">
              <div className="text-sm truncate pr-2">
                <p className="text-white font-bold truncate">{user.displayName || 'Admin'}</p>
                <p className="text-zinc-400 text-xs truncate font-medium mt-0.5">{user.email}</p>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2.5 hover:bg-red-500/20 rounded-xl text-zinc-400 hover:text-red-400 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="block w-full text-center py-3 bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 text-white rounded-xl transition-all font-bold shadow-lg">
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
