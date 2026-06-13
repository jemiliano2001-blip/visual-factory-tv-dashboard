import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CompanyConfig } from '../types';
import { subscribeToCompanyConfigs } from '../services/companyConfigs';
import { getCustomerLogo } from '../utils/customerLogos';
import { Clock, RefreshCw, WifiOff, CheckCircle2 } from 'lucide-react';
import {
  OdooSaleOrder,
  getDeliveryProgress,
  isOrderOverdue,
} from '../services/odoo';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { processVoiceCommand, generateSpeech } from '../services/ai';
import OdooOrderCard from '../components/OdooOrderCard';
import type { ViewMode } from '../components/OdooOrderCard';
import SkeletonCard from '../components/SkeletonCard';
import DashboardHeader from '../components/DashboardHeader';
import DashboardFooter from '../components/DashboardFooter';

// ─── Audio helpers ─────────────────────────────────────────────────────────────

let sharedAudioCtx: AudioContext | null = null;
const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) sharedAudioCtx = new AudioContextClass({ sampleRate: 24000 });
  }
  return sharedAudioCtx;
};

const playPCMBase64 = async (base64: string, onEnded?: () => void) => {
  try {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const audioCtx = getAudioContext();
    if (!audioCtx) return onEnded && onEnded();
    
    const numSamples = bytes.length / 2;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < numSamples; i++) channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    if (onEnded) source.onended = onEnded;
    source.start();
  } catch (e) {
    console.error('Error playing TTS audio', e);
    if (onEnded) onEnded();
  }
};

const playSuccessSound = () => {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    const playBeep = (freq: number, time: number, duration = 0.15) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.start(time); osc.stop(time + duration);
    };
    playBeep(880, audioCtx.currentTime, 0.2);
    playBeep(1760, audioCtx.currentTime + 0.1, 0.3);
  } catch {}
};

const playErrorSound = () => {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.2);
  } catch {}
};

// ─── TVDashboard principal ─────────────────────────────────────────────────────

const VALID_VOICE_FILTERS = ['all', 'overdue', 'pending', 'delivered'] as const;
type VoiceFilter = typeof VALID_VOICE_FILTERS[number];

export default function TVDashboard() {
  const navigate = useNavigate();

  // ── Odoo state (hook compartido) ─────────────────────────────────────────────
  const {
    status: odooStatus,
    orders: odooOrders,
    lastUpdated: odooLastUpdated,
    error: odooError,
    isLoading: isLoadingOdoo,
    isFetching: isRefreshing,
    refetch,
  } = useOdooOrders();

  const loadOdooOrders = () => refetch();

  // ── Configs + UI ─────────────────────────────────────────────────────────────
  const [companyConfigs, setCompanyConfigs] = useState<CompanyConfig[]>([]);
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [highlightedSO, setHighlightedSO]   = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [viewMode, setViewMode]             = useState<ViewMode>('tv');
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [showGradient, setShowGradient]     = useState(true);
  const containerRef                        = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols]             = useState(4);
  const [gridRows, setGridRows]             = useState(2);
  const [ordersPerPage, setOrdersPerPage]   = useState(8);
  const [isWide, setIsWide]                 = useState(false);
  const [isDense, setIsDense]               = useState(false);
  const [toast, setToast]                   = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [voiceFilter, setVoiceFilter]       = useState<'all' | 'overdue' | 'pending' | 'delivered'>('all');

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const streamRef         = useRef<MediaStream | null>(null);
  const toastTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTVMode = viewMode === 'tv';

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Company configs (para horarios de entrega) ───────────────────────────────
  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setCompanyConfigs);
    return () => unsub();
  }, []);

  // ── Reloj ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err =>
        showToast(`Error al activar pantalla completa: ${err.message}`, 'error')
      );
    } else {
      document.exitFullscreen();
    }
  };

  // ── ResizeObserver para layout adaptativo ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const aspectRatio    = width / height;
        const isWideScreen   = aspectRatio > 1.3;
        const gap            = width > 1200 ? 16 : 12;
        // En modo TV, reservar espacio preciso para header y footer
        // En modo desktop, no importa tanto porque hay scroll
        const headerArea     = isWideScreen ? 100 : 80;
        const footerArea     = 40;
        const available      = isTVMode
          ? height - headerArea - footerArea
          : height; // En desktop el grid puede crecer más allá

        let cols = 1;
        if (width > 1800) cols = 5;
        else if (width > 1400) cols = 4;
        else if (width > 1000) cols = 3;
        else if (width > 600)  cols = 2;

        const isDenseLayout = isTVMode && ((available / 4) < 200 || cols >= 4);
        const minCardHeight = isDenseLayout ? 80 : (isWideScreen ? 240 : 200);
        let rows = Math.max(1, Math.floor((available + gap) / (minCardHeight + gap)));

        // En modo desktop sin paginación: mostrar hasta 20 rows
        if (!isTVMode) {
          rows = Math.max(rows, 4);
        }

        setGridCols(cols);
        setGridRows(rows);
        setOrdersPerPage(isTVMode ? cols * rows || 8 : 999);
        setIsWide(cols <= 4 && rows <= 2 && isWideScreen && !isDenseLayout);
        setIsDense(isDenseLayout);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isTVMode]);

  // ── Scroll to highlighted SO ─────────────────────────────────────────────────
  useEffect(() => {
    if (highlightedSO) {
      const el = document.getElementById(`so-${highlightedSO.replace(/\//g, '-')}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedSO]);

  // ── Paginación ───────────────────────────────────────────────────────────────
  const filteredOdooOrders = useMemo(() => {
    if (voiceFilter === 'all') return odooOrders;
    return odooOrders.filter(order => {
      const isOverdue = isOrderOverdue(order);
      const progress = getDeliveryProgress(order);
      if (voiceFilter === 'overdue') return isOverdue;
      if (voiceFilter === 'delivered') return progress >= 100;
      if (voiceFilter === 'pending') return progress < 100 && !isOverdue;
      return true;
    });
  }, [odooOrders, voiceFilter]);

  const groupedOrders = useMemo(() =>
    filteredOdooOrders.reduce((acc, order) => {
      const key = order.partner_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, OdooSaleOrder[]>),
    [filteredOdooOrders]
  );

  const pages = useMemo(() => {
    const result: { company: string; orders: OdooSaleOrder[]; current: number; total: number }[] = [];
    if (isTVMode) {
      // TV: paginación por cliente, respetando ordersPerPage
      Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
        const totalPages = Math.ceil(companyOrders.length / ordersPerPage);
        for (let i = 0; i < totalPages; i++) {
          result.push({
            company,
            orders: companyOrders.slice(i * ordersPerPage, (i + 1) * ordersPerPage),
            current: i + 1,
            total: totalPages,
          });
        }
      });
    } else {
      // Desktop: una sola "página" con todas las órdenes agrupadas por cliente
      // Usamos la primera compañía como referencia, pero renderizamos todo
      Object.entries(groupedOrders).forEach(([company, companyOrders]) => {
        result.push({
          company,
          orders: companyOrders,
          current: 1,
          total: 1,
        });
      });
    }
    return result;
  }, [groupedOrders, ordersPerPage, isTVMode]);

  // ── Auto-rotate pages (solo en modo TV) ──────────────────────────────────────
  useEffect(() => {
    if (!isTVMode || pages.length <= 1 || highlightedSO) return;
    const interval = setInterval(() => {
      setCurrentPageIndex(prev => (prev + 1) % pages.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [pages.length, highlightedSO, isTVMode]);

  useEffect(() => {
    if (currentPageIndex >= pages.length && pages.length > 0) setCurrentPageIndex(0);
  }, [pages.length, currentPageIndex]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const currentPage = pages.length > 0 ? pages[currentPageIndex] : null;

  // ── Voice control ────────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };
        mediaRecorder.onstop = async () => {
          setIsProcessingVoice(true);
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64data = (reader.result as string).split(',')[1];
            try {
              const result = await processVoiceCommand(base64data, 'audio/webm', odooOrders);
              if (result.message) {
                showToast(result.message, result.action === 'answer' ? 'info' : 'success');
                const audioBase64 = await generateSpeech(result.message);
                if (audioBase64) {
                  setIsSpeaking(true);
                  playPCMBase64(audioBase64, () => setIsSpeaking(false));
                }
              }
              if (result.action === 'filter' && result.filter_type) {
                const ft = result.filter_type as string;
                if ((VALID_VOICE_FILTERS as readonly string[]).includes(ft)) {
                  setVoiceFilter(ft as VoiceFilter);
                }
                setCurrentPageIndex(0);
              } else if (result.po_number) {
                const found = result.po_number
                  ? odooOrders.find(o => o.name === result.po_number || o.name.includes(result.po_number))
                  : undefined;
                if (found) {
                  const soId = found.name;
                  const pageIdx = pages.findIndex(p => p.orders.some(o => o.name === soId));
                  if (pageIdx !== -1) setCurrentPageIndex(pageIdx);
                  playSuccessSound();
                  setHighlightedSO(soId);
                  if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                  highlightTimerRef.current = setTimeout(() => setHighlightedSO(null), 10000);
                } else {
                  showToast(`No se encontró la orden ${result.po_number}.`, 'error');
                  playErrorSound();
                }
              }
            } catch (e) {
              console.error('Error en el procesamiento de voz', e);
              showToast('Hubo un error al procesar el comando de voz.', 'error');
              playErrorSound();
            } finally {
              setIsProcessingVoice(false);
            }
          };
          stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        setIsRecording(true);
      } catch {
        showToast('Se requiere acceso al micrófono para los comandos de voz.');
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`bg-zinc-950 text-white p-4 lg:p-6 font-sans transition-all duration-700 relative ${
        isTVMode ? 'tv-viewport' : 'desktop-viewport'
      } ${isFullscreen ? 'w-full h-full' : ''}`}
    >
      {/* Background gradient */}
      <AnimatePresence>
        {showGradient && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-0"
          >
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
            <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] bg-violet-500/5 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: '4s' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <DashboardHeader
        currentTime={currentTime}
        currentCompany={currentPage?.company}
        currentPageNum={currentPage?.current}
        totalPages={currentPage?.total}
        odooStatus={odooStatus}
        odooLastUpdated={odooLastUpdated}
        isRefreshing={isRefreshing}
        onRefresh={loadOdooOrders}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        showGradient={showGradient}
        onToggleGradient={() => setShowGradient(!showGradient)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        voiceFilter={voiceFilter}
        onClearFilter={() => { setVoiceFilter('all'); setCurrentPageIndex(0); }}
        isSpeaking={isSpeaking}
        onNavigateAdmin={() => navigate('/admin')}
      />

      {/* ── Main grid ──────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`flex-1 pb-4 relative flex flex-col z-10 ${
          isTVMode ? 'overflow-hidden' : 'overflow-visible min-h-0'
        }`}
      >
        {highlightedSO && (
          <div className="fixed inset-0 bg-black/70 z-40 backdrop-blur-sm transition-opacity duration-500 pointer-events-none" />
        )}

        {isLoadingOdoo ? (
          <div className="flex flex-col h-full">
            <div className="mb-6 flex items-center justify-between">
              <div className="h-10 w-64 bg-zinc-800/50 rounded-lg animate-pulse" />
            </div>
            <div
              className="grid gap-6 flex-1"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                gridTemplateRows: isTVMode ? `repeat(${gridRows}, minmax(0, 1fr))` : undefined,
              }}
            >
              {Array.from({ length: isTVMode ? (gridCols * gridRows) : 8 }).map((_, i) => (
                <SkeletonCard key={i} isWide={isWide} isDense={isDense} />
              ))}
            </div>
          </div>
        ) : odooError && odooOrders.length === 0 ? (
          /* Error state — Odoo no disponible */
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
              <WifiOff className="w-10 h-10 text-red-400" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Sin conexión a Odoo</h2>
              <p className="text-zinc-500 max-w-md">{odooError}</p>
              <p className="text-zinc-600 text-sm">
                Asegúrate de que el servidor Express proxy esté corriendo:<br />
                <code className="text-indigo-400 bg-zinc-900 px-2 py-0.5 rounded text-xs">npm run server</code>
              </p>
            </div>
            <button
              onClick={() => loadOdooOrders()}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl font-bold hover:bg-indigo-500/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Reintentar
            </button>
          </div>
        ) : odooOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-black text-white uppercase tracking-tight">Todo facturado</h2>
              <p className="text-zinc-500 mt-2">No hay órdenes de venta pendientes de facturar en Odoo.</p>
            </div>
          </div>
        ) : isTVMode && currentPage ? (
          /* ── Modo TV: paginación con cards que caben en viewport ──── */
          <div className="flex flex-col h-full min-h-0">
            <div className="mb-3 lg:mb-4 flex items-center justify-between flex-shrink-0">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3 lg:gap-5">
                  <AnimatePresence mode="wait">
                    {getCustomerLogo(currentPage.company) && (
                      <motion.div
                        key={currentPage.company}
                        initial={{ opacity: 0, scale: 0.85, x: -10 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.85, x: -10 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                        className={`flex-shrink-0 flex items-center justify-center rounded-2xl bg-white/8 border border-white/10 backdrop-blur-sm shadow-[0_0_20px_rgba(255,255,255,0.05)] ${
                          isWide ? 'h-20 px-5 py-2' : 'h-12 px-3 py-1.5'
                        }`}
                      >
                        <img
                          src={getCustomerLogo(currentPage.company)!}
                          alt={currentPage.company}
                          className={`object-contain ${
                            isWide ? 'max-h-16 max-w-[200px]' : 'max-h-9 max-w-[120px]'
                          }`}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <h2 className={`${isWide ? 'text-5xl' : 'text-2xl lg:text-3xl'} font-black text-white tracking-tight uppercase`}>
                    {currentPage.company}
                  </h2>
                </div>
                {companyConfigs.find(c => c.company_name === currentPage.company) && (
                  <div className="flex items-center gap-2 mt-1 text-zinc-400">
                    <Clock className={`${isWide ? 'w-6 h-6' : 'w-4 h-4'}`} />
                    <span className={`${isWide ? 'text-lg' : 'text-xs lg:text-sm'} font-bold uppercase tracking-widest`}>
                      Horario: {companyConfigs.find(c => c.company_name === currentPage.company)?.delivery_schedule}
                    </span>
                  </div>
                )}
              </div>
              {currentPage.total > 1 && (
                <span className={`${isWide ? 'text-xl' : 'text-xs lg:text-sm'} text-zinc-500 font-bold uppercase tracking-widest`}>
                  Página {currentPage.current} de {currentPage.total}
                </span>
              )}
            </div>

            <motion.div
              key={`${currentPage.company}-${currentPage.current}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
              className="grid gap-3 lg:gap-4 flex-1 min-h-0"
              style={{
                gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
              }}
            >
              {currentPage.orders.map((order) => (
                <OdooOrderCard
                  key={order.id}
                  order={order}
                  isHighlighted={highlightedSO === order.name}
                  isWide={isWide}
                  isDense={isDense}
                  viewMode="tv"
                />
              ))}
            </motion.div>
          </div>
        ) : !isTVMode && pages.length > 0 ? (
          /* ── Modo Desktop: todas las órdenes con scroll, agrupadas ── */
          <div className="flex flex-col gap-8">
            {pages.map((pageData) => (
              <div key={pageData.company} className="flex flex-col gap-4">
                {/* Company header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 lg:gap-5">
                    {getCustomerLogo(pageData.company) && (
                      <div className="flex-shrink-0 flex items-center justify-center rounded-2xl bg-white/8 border border-white/10 backdrop-blur-sm shadow-[0_0_20px_rgba(255,255,255,0.05)] h-12 px-3 py-1.5">
                        <img
                          src={getCustomerLogo(pageData.company)!}
                          alt={pageData.company}
                          className="object-contain max-h-9 max-w-[120px]"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl lg:text-3xl font-black text-white tracking-tight uppercase">
                        {pageData.company}
                      </h2>
                      {companyConfigs.find(c => c.company_name === pageData.company) && (
                        <div className="flex items-center gap-2 mt-1 text-zinc-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs lg:text-sm font-bold uppercase tracking-widest">
                            Horario: {companyConfigs.find(c => c.company_name === pageData.company)?.delivery_schedule}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm text-zinc-500 font-bold uppercase tracking-widest">
                    {pageData.orders.length} {pageData.orders.length === 1 ? 'orden' : 'órdenes'}
                  </span>
                </div>

                {/* Orders grid */}
                <div
                  className="grid gap-4 lg:gap-6"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(gridCols, 4)}, minmax(0, 1fr))`,
                    gridAutoRows: 'minmax(220px, auto)',
                  }}
                >
                  {pageData.orders.map((order) => (
                    <OdooOrderCard
                      key={order.id}
                      order={order}
                      isHighlighted={highlightedSO === order.name}
                      isWide={false}
                      isDense={false}
                      viewMode="desktop"
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <DashboardFooter
        totalOrders={odooOrders.length}
        pages={pages}
        currentPageIndex={currentPageIndex}
        onPageChange={setCurrentPageIndex}
        toast={toast}
        isRecording={isRecording}
        isProcessingVoice={isProcessingVoice}
        isSpeaking={isSpeaking}
        onToggleRecording={toggleRecording}
      />
    </div>
  );
}
