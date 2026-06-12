import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { useNavigate, Navigate } from 'react-router-dom';
import { Tv } from 'lucide-react';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (auth.currentUser) {
    return <Navigate to="/admin" replace />;
  }

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      navigate('/admin');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-4 font-sans relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-fuchsia-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/60 backdrop-blur-2xl rounded-3xl p-10 shadow-2xl border border-white/10 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 rounded-3xl flex items-center justify-center mb-6 border border-white/10 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
            <Tv className="w-10 h-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight">Fábrica Visual</h1>
          <p className="text-zinc-400 mt-3 text-center font-medium">Inicie sesión para gestionar órdenes de trabajo y ver análisis.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl mb-8 text-sm font-medium">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-zinc-900 py-4 px-6 rounded-2xl font-bold hover:bg-zinc-100 transition-all disabled:opacity-50 shadow-xl hover:shadow-2xl hover:-translate-y-0.5"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-6 h-6" />
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión con Google'}
        </button>
        
        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-zinc-500 hover:text-white transition-colors font-medium">
            Volver al Panel de TV
          </a>
        </div>
      </div>
    </div>
  );
}
