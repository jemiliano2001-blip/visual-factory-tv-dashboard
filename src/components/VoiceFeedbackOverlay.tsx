import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, CheckCircle2, AlertTriangle, Clock, ArrowRight, X } from 'lucide-react';
import type { VoiceCommandResponse, ExpectedOrderInfo } from '../services/ai';
import type { VoiceRiskOrder } from '../services/voiceRisk';

interface VoiceFeedbackOverlayProps {
  response: VoiceCommandResponse | null;
  isProcessing: boolean;
  isRiskProcessing: boolean;
  isRecording: boolean;
  transcript: string | null;
  onClose: () => void;
}

const getStatusBadge = (status: ExpectedOrderInfo['status'] | VoiceRiskOrder['status']) => {
  switch (status) {
    case 'overdue':
      return {
        label: 'VENCIDA',
        bg: 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
        icon: AlertTriangle,
      };
    case 'critical':
      return {
        label: 'CRÍTICA',
        bg: 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]',
        icon: Clock,
      };
    case 'delivered':
      return {
        label: 'ENTREGADA',
        bg: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/50 shadow-[0_0_15px_rgba(217,70,239,0.3)]',
        icon: CheckCircle2,
      };
    case 'pending':
    default:
      return {
        label: 'EN PROCESO',
        bg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]',
        icon: Clock,
      };
  }
};

export const VoiceFeedbackOverlay: React.FC<VoiceFeedbackOverlayProps> = ({
  response,
  isProcessing,
  isRiskProcessing,
  isRecording,
  transcript,
  onClose,
}) => {
  const visible = isRecording || isProcessing || !!response;
  if (!visible) return null;

  const expectedOrder = response?.expected_order;
  const riskOrders = response?.risk_orders ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-20 left-1/2 -translate-x-1/2 z-[70] w-[92%] max-w-4xl"
      >
        <div className="relative overflow-hidden rounded-2xl bg-zinc-950/95 border border-indigo-500/30 backdrop-blur-xl p-5 md:p-6 shadow-[0_20px_60px_-15px_rgba(99,102,241,0.25)]">
          {/* Header de estado de la voz */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl ${
                  isRecording
                    ? 'bg-red-500/20 text-red-400 animate-pulse border border-red-500/40'
                    : isProcessing
                    ? 'bg-amber-500/20 text-amber-400 animate-spin border border-amber-500/40'
                    : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                }`}
              >
                <Mic className="w-5 h-5 lg:w-6 lg:h-6" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest font-black text-indigo-400">
                  {isRecording
                    ? 'Escuchando comando de voz...'
                    : isProcessing
                    ? isRiskProcessing && !response
                      ? 'Analizando prioridades...'
                      : 'Procesando con Gemini 3.5 Flash...'
                    : 'Asistente de Voz Operativo'}
                </div>
                <div className="text-sm md:text-base font-medium text-zinc-200 line-clamp-1 italic">
                  "{transcript || response?.transcript || 'Esperando instrucción...'}"
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cuerpo principal cuando hay respuesta */}
          {response && (
            <div className="space-y-4">
              {/* Síntesis de lo que pidió el usuario */}
              {response.user_intent_summary && (
                <div className="flex items-start gap-2 text-xs md:text-sm text-zinc-300 bg-zinc-900/60 rounded-lg p-2.5 border border-zinc-800">
                  <ArrowRight className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-indigo-300">Solicitado:</strong> {response.user_intent_summary}
                  </span>
                </div>
              )}

              {/* Tarjeta de Orden Esperada */}
              {riskOrders.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-widest text-red-300">Atención hoy</div>
                      <div className="mt-1 text-base font-bold text-white">La TV quedó enfocada en estas prioridades.</div>
                    </div>
                    <span className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-black tracking-wider text-red-200">
                      {riskOrders.length} {riskOrders.length === 1 ? 'PRIORIDAD' : 'PRIORIDADES'}
                    </span>
                  </div>

                  {riskOrders.map((order, index) => {
                    const badge = getStatusBadge(order.status);
                    const IconComp = badge.icon;
                    const isPrimary = index === 0;
                    return (
                      <div
                        key={order.po_number}
                        className={isPrimary
                          ? 'rounded-xl border border-red-500/50 bg-gradient-to-br from-red-950/70 to-zinc-900 p-4 shadow-[0_0_24px_rgba(239,68,68,0.18)]'
                          : 'rounded-xl border border-zinc-700 bg-zinc-900/90 p-3'}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-black uppercase tracking-widest text-zinc-400">
                              Prioridad {order.rank}
                            </div>
                            <div className={`${isPrimary ? 'text-2xl lg:text-3xl' : 'text-lg'} mt-1 font-mono font-black tracking-wider text-white`}>
                              {order.po_number}
                            </div>
                            <div className="mt-1 text-sm font-bold text-zinc-100">{order.client} · {order.product}</div>
                          </div>
                          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${badge.bg}`}>
                            <IconComp className="h-3.5 w-3.5" />
                            {badge.label}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-700/80 pt-3 text-xs md:text-sm">
                          <span className="font-mono font-bold text-emerald-300">Avance: {order.delivery_progress}</span>
                          <span className="text-indigo-200">⚡ {order.reason}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : expectedOrder ? (
                <div className="rounded-xl bg-zinc-900/90 border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                        Orden Identificada / Esperada:
                      </span>
                      <span className="font-mono font-black text-xl lg:text-2xl text-white tracking-wider bg-zinc-800 px-3 py-0.5 rounded-lg border border-zinc-700">
                        {expectedOrder.po_number}
                      </span>
                    </div>

                    {/* Badge de Estado */}
                    {(() => {
                      const badge = getStatusBadge(expectedOrder.status);
                      const IconComp = badge.icon;
                      return (
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-black text-xs uppercase tracking-wider ${badge.bg}`}>
                          <IconComp className="w-3.5 h-3.5" />
                          <span>{badge.label}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Datos del Cliente y Producto */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-zinc-300">
                    <div>
                      <span className="text-zinc-500 text-xs block">Cliente:</span>
                      <span className="font-bold text-white text-base">{expectedOrder.client}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs block">Producto:</span>
                      <span className="font-semibold text-zinc-200">{expectedOrder.product}</span>
                    </div>
                  </div>

                  {/* Avance + Razón de selección por la IA */}
                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-zinc-800/80 gap-2 text-xs md:text-sm">
                    <div className="text-zinc-400">
                      <span className="text-zinc-500">Avance de piezas: </span>
                      <strong className="text-emerald-400 font-mono font-bold">
                        {expectedOrder.delivery_progress}
                      </strong>
                    </div>
                    <div className="text-indigo-300 italic text-xs">
                      ⚡ {expectedOrder.reason}
                    </div>
                  </div>
                </div>
              ) : (
                /* Mensaje hablado corto si no hay una orden específica */
                <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-indigo-200 text-sm md:text-base font-medium">
                  {response.message}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
