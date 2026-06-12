import React, { useEffect, useState } from 'react';
import { WorkOrder } from '../types';
import { subscribeToWorkOrders } from '../services/workOrders';
import { generateShiftSummary } from '../services/ai';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { CheckCircle2, AlertTriangle, Clock, TrendingUp, Sparkles, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

export default function StatsDashboard() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToWorkOrders(setOrders);
    return () => unsubscribe();
  }, []);

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    try {
      const summary = await generateShiftSummary(orders);
      setAiSummary(summary);
    } catch (e) {
      console.error(e);
      setAiSummary('Error al generar el resumen. Por favor, compruebe su clave API e inténtelo de nuevo.');
    }
    setIsGenerating(false);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(`*Resumen de Turno:*\n\n${aiSummary}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Calculate stats
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'quality' && o.quantity_completed >= o.quantity_total).length;
  const inProgressOrders = orders.filter(o => o.status === 'production').length;
  const onHoldOrders = orders.filter(o => o.status === 'hold').length;

  const totalPartsTarget = orders.reduce((sum, o) => sum + o.quantity_total, 0);
  const totalPartsCompleted = orders.reduce((sum, o) => sum + o.quantity_completed, 0);
  const completionRate = totalPartsTarget > 0 ? Math.round((totalPartsCompleted / totalPartsTarget) * 100) : 0;

  // Prepare chart data
  const statusData = [
    { name: 'Programado', value: orders.filter(o => o.status === 'scheduled').length },
    { name: 'Producción', value: inProgressOrders },
    { name: 'Pausa', value: onHoldOrders },
    { name: 'Calidad/Hecho', value: orders.filter(o => o.status === 'quality').length },
  ];

  const priorityData = [
    { name: 'Baja', value: orders.filter(o => o.priority === 'low').length },
    { name: 'Normal', value: orders.filter(o => o.priority === 'normal').length },
    { name: 'Alta', value: orders.filter(o => o.priority === 'high').length },
    { name: 'Crítica', value: orders.filter(o => o.priority === 'critical').length },
  ];

  // Top clients by volume
  const clientVolume = orders.reduce((acc, order) => {
    acc[order.company_name] = (acc[order.company_name] || 0) + order.quantity_total;
    return acc;
  }, {} as Record<string, number>);

  const clientData = Object.entries(clientVolume)
    .map(([name, volume]) => ({ name, volume: Number(volume) }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden font-sans">
      {/* Vibrant Background Orbs */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[20%] w-[30%] h-[30%] bg-amber-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="p-8 max-w-7xl mx-auto relative z-10">
        <div className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight">
              Análisis de Producción
            </h1>
            <p className="text-zinc-400 mt-2 font-medium">Información en tiempo real sobre las operaciones de fabricación.</p>
          </div>
          <button 
            onClick={handleGenerateSummary}
            disabled={isGenerating}
            className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-5 h-5" />
            {isGenerating ? 'Analizando...' : 'Resumen de Turno (IA)'}
          </button>
        </div>

        {aiSummary && (
          <div className="mb-10 bg-indigo-500/10 border border-indigo-500/30 p-8 rounded-3xl shadow-[0_0_30px_rgba(99,102,241,0.15)] backdrop-blur-xl">
            <div className="flex items-center gap-3 mb-6 text-indigo-300 font-bold text-xl">
              <Sparkles className="w-6 h-6 text-indigo-400" />
              <h3>Resumen Ejecutivo de IA</h3>
            </div>
            <div className="prose prose-invert prose-indigo max-w-none text-zinc-300 text-base leading-relaxed mb-6">
              <ReactMarkdown>{aiSummary}</ReactMarkdown>
            </div>
            <div className="flex justify-end border-t border-indigo-500/20 pt-4">
              <button 
                onClick={handleShareWhatsApp}
                className="flex items-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#1DA851] text-white rounded-xl font-bold transition-colors shadow-lg"
              >
                <MessageCircle className="w-5 h-5" />
                Compartir por WhatsApp
              </button>
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          <div className="bg-zinc-900/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 hover:border-blue-500/30 transition-colors group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-blue-500/10 text-blue-400 rounded-2xl group-hover:bg-blue-500/20 transition-colors">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Órdenes Totales</p>
                <h3 className="text-3xl font-black text-white">{totalOrders}</h3>
              </div>
            </div>
          </div>
          
          <div className="bg-zinc-900/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 hover:border-emerald-500/30 transition-colors group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-2xl group-hover:bg-emerald-500/20 transition-colors">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Tasa de Finalización</p>
                <h3 className="text-3xl font-black text-white">{completionRate}%</h3>
              </div>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden border border-white/5">
              <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: `${completionRate}%` }}></div>
            </div>
          </div>

          <div className="bg-zinc-900/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 hover:border-indigo-500/30 transition-colors group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-2xl group-hover:bg-indigo-500/20 transition-colors">
                <Clock className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">En Producción</p>
                <h3 className="text-3xl font-black text-white">{inProgressOrders}</h3>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/60 backdrop-blur-xl p-6 rounded-3xl shadow-xl border border-white/10 hover:border-amber-500/30 transition-colors group">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-4 bg-amber-500/10 text-amber-400 rounded-2xl group-hover:bg-amber-500/20 transition-colors">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">En Pausa</p>
                <h3 className="text-3xl font-black text-white">{onHoldOrders}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status Distribution */}
          <div className="bg-zinc-900/60 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/10">
            <h3 className="text-xl font-bold text-white mb-8">Órdenes por Estado</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', backdropFilter: 'blur(12px)' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: '#a1a1aa', fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Clients */}
          <div className="bg-zinc-900/60 backdrop-blur-xl p-8 rounded-3xl shadow-xl border border-white/10">
            <h3 className="text-xl font-bold text-white mb-8">Principales Clientes por Volumen</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" tick={{ fill: '#a1a1aa' }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fill: '#a1a1aa', fontSize: 12, fontWeight: 600 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} tickLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', backdropFilter: 'blur(12px)' }}
                  />
                  <Bar dataKey="volume" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
