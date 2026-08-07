import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CompanyConfig } from '../types';
import { subscribeToCompanyConfigs } from '../services/companyConfigs';
import { getCustomerLogo } from '../utils/customerLogos';
import { Clock, RefreshCw, WifiOff, CheckCircle2, Mic } from 'lucide-react';
import {
  OdooSaleOrder,
  getDeliveryProgress,
  isOrderOverdue,
  isOrderFullyDelivered,
  getOrderPriority,
} from '../services/odoo';
import { formatPONumber } from '../utils/formatters';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { processTextVoiceCommand, tryLocalFastVoiceCommand, speakFastLocal, getSpokenAudio, AIError, type VoiceCommandResponse } from '../services/ai';
import { VoiceFeedbackOverlay } from '../components/VoiceFeedbackOverlay';
import OdooOrderCard from '../components/OdooOrderCard';
import type { ViewMode, ScreenTier } from '../components/OdooOrderCard';
import { SharedTVPage } from '../components/SharedTVPage';
import SkeletonCard from '../components/SkeletonCard';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import DashboardHeader from '../components/DashboardHeader';
import DashboardFooter from '../components/DashboardFooter';
import TVControlBar from '../components/TVControlBar';
import { usePersistedState } from '../hooks/usePersistedState';
import { useMobile } from '../hooks/useMobile';
import { buildTVPages, type TVPage } from '../utils/tvPagePacking';
import type {
  SpeechRecognitionInstance,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  WindowWithSpeech,
} from '../types/speech';

// ─── Audio helpers ─────────────────────────────────────────────────────────────

let sharedAudioCtx: AudioContext | null = null;
// Referencia al nodo de audio de Gemini TTS actualmente en reproducción (voz principal de
// los comandos) para poder cortarlo si el operador vuelve a picarle al micro a la mitad.
let activeAudioSource: AudioBufferSourceNode | null = null;

const getAudioContext = () => {
  if (!sharedAudioCtx) {
    const win = window as WindowWithSpeech;
    const AudioContextClass = window.AudioContext || win.webkitAudioContext;
    if (AudioContextClass) sharedAudioCtx = new AudioContextClass({ sampleRate: 24000 });
  }
  return sharedAudioCtx;
};

const ensureAudioRunning = async (audioCtx: AudioContext) => {
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
};

const playPCMBase64 = async (base64: string, onEnded?: () => void) => {
  try {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const audioCtx = getAudioContext();
    if (!audioCtx) return onEnded && onEnded();

    await ensureAudioRunning(audioCtx);
    const numSamples = bytes.length / 2;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < numSamples; i++) channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    if (onEnded) source.onended = onEnded;
    if (activeAudioSource) {
      // Quitar su onended antes de detenerlo: si no, su callback (setIsSpeaking(false) de
      // un turno anterior) se dispara durante el arranque de este nuevo audio y pisa el
      // indicador de "hablando" del turno actual.
      activeAudioSource.onended = null;
      try { activeAudioSource.stop(); } catch { /* ya había terminado */ }
    }
    activeAudioSource = source;
    source.start();
  } catch (e) {
    console.error('Error playing TTS audio', e);
    if (onEnded) onEnded();
  }
};

/** Corta cualquier voz en curso (Gemini TTS o el respaldo nativo del navegador). */
const stopSpokenAudio = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (activeAudioSource) {
    try { activeAudioSource.stop(); } catch { /* ya había terminado */ }
    activeAudioSource = null;
  }
};

const playSuccessSound = async () => {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    await ensureAudioRunning(audioCtx);
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

const playErrorSound = async () => {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    await ensureAudioRunning(audioCtx);
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

const VALID_VOICE_FILTERS = ['all', 'overdue', 'pending', 'delivered', 'critical'] as const;
type VoiceFilter = typeof VALID_VOICE_FILTERS[number];

const CompanyTVSection: React.FC<{
  company: string;
  orders: OdooSaleOrder[];
  isWide: boolean;
  isDense: boolean;
  screenTier: ScreenTier;
  gridCols: number;
  gridRows: number;
  companyConfigs: CompanyConfig[];
  highlightedSO: string | null;
  onOrderClick: (order: OdooSaleOrder) => void;
}> = ({ company, orders, isWide, isDense, screenTier, gridCols, gridRows, companyConfigs, highlightedSO, onOrderClick }) => (
  <div className="flex flex-col h-full min-h-0 w-full">
    <div className="mb-3 lg:mb-4 flex items-center justify-between flex-shrink-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 lg:gap-5">
          <AnimatePresence mode="wait">
            {getCustomerLogo(company) && (
              <motion.div
                key={company}
                initial={{ opacity: 0, scale: 0.85, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.85, x: -10 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className={`flex-shrink-0 flex items-center justify-center rounded-2xl bg-white/8 border border-white/10 backdrop-blur-sm shadow-[0_0_20px_rgba(255,255,255,0.05)] ${
                  isWide ? 'h-20 px-5 py-2' : 'h-12 px-3 py-1.5'
                }`}
              >
                <img
                  src={getCustomerLogo(company)!}
                  alt={company}
                  className={`object-contain ${
                    isWide ? 'max-h-16 max-w-[200px]' : 'max-h-9 max-w-[120px]'
                  }`}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <h2 className={`${isWide ? 'text-4xl lg:text-5xl' : 'text-xl lg:text-2xl'} font-black text-white tracking-tight uppercase`}>
            {company}
          </h2>
        </div>
        {companyConfigs.find(c => c.company_name === company) && (
          <div className="flex items-center gap-2 mt-1 text-zinc-400">
            <Clock className={`${isWide ? 'w-6 h-6' : 'w-4 h-4'}`} />
            <span className={`${isWide ? 'text-lg' : 'text-xs lg:text-sm'} font-bold uppercase tracking-widest`}>
              Horario: {companyConfigs.find(c => c.company_name === company)?.delivery_schedule}
            </span>
          </div>
        )}
      </div>
    </div>

    <motion.div
      key={`${company}-grid`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5 }}
      className="grid gap-3 lg:gap-4 flex-1 min-h-0"
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.ceil(orders.length / gridCols)}, minmax(0, 1fr))`,
      }}
    >
      {orders.map((order) => (
        <OdooOrderCard
          key={order.id}
          order={order}
          isHighlighted={highlightedSO === order.name}
          isWide={isWide}
          isDense={isDense}
          screenTier={screenTier}
          viewMode="tv"
          onClick={() => onOrderClick(order)}
        />
      ))}
    </motion.div>
  </div>
);

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
  const [selectedOrder, setSelectedOrder]   = useState<OdooSaleOrder | null>(null);
  const [viewMode, setViewMode]             = usePersistedState<ViewMode>('vftv:tv:viewMode', 'tv');
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [showGradient, setShowGradient]     = useState(true);
  const containerRef                        = useRef<HTMLDivElement>(null);
  const mainViewportRef                     = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols]             = useState(4);
  const [gridRows, setGridRows]             = useState(2);
  const [ordersPerPage, setOrdersPerPage]   = useState(8);
  const [isWide, setIsWide]                 = useState(false);
  const [isDense, setIsDense]               = useState(false);
  const [screenTier, setScreenTier]         = useState<ScreenTier>('lg');
  const [toast, setToast]                   = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [voiceFilter, setVoiceFilter]       = useState<VoiceFilter>('all');
  const [clientFilter, setClientFilter]     = usePersistedState<string | null>('vftv:tv:client', null);
  const [textFilter, setTextFilter]         = usePersistedState<string>('vftv:tv:text', '');
  const [rotationPaused, setRotationPaused] = usePersistedState<boolean>('vftv:tv:paused', false);

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking]             = useState(false);
  const [voiceTranscript, setVoiceTranscript]   = useState<string | null>(null);
  const [voiceResponse, setVoiceResponse]       = useState<VoiceCommandResponse | null>(null);
  const recognitionRef          = useRef<SpeechRecognitionInstance | null>(null);
  const toastTimerRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceResponseTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Se incrementa cada vez que se inicia una nueva grabación. El botón de voz vuelve a
  // habilitarse antes de que termine el TTS del comando anterior (a propósito, para poder
  // interrumpir), así que el TTS fire-and-forget de un turno viejo debe poder detectar que
  // ya lo superó un turno más nuevo y no hablar/pisar el indicador "hablando" de este.
  const voiceTurnRef            = useRef(0);
  // Último turno para dar contexto conversacional a seguimientos ("¿y las de Bosch?")
  const lastVoiceTurnRef        = useRef<{ transcript: string; message: string } | null>(null);
  // El handler onresult es async y puede resolver segundos después (viaje a Gemini de por medio);
  // usar una ref en vez de la variable del closure evita operar sobre catálogo ya obsoleto
  // si odooOrders cambió (polling) mientras se procesaba el comando.
  const odooOrdersRef           = useRef<OdooSaleOrder[]>(odooOrders);

  const isMobile = useMobile();
  // En móvil siempre modo escritorio: sin paginación ni auto-rotación
  const effectiveViewMode: ViewMode = isMobile ? 'desktop' : viewMode;
  const isTVMode = effectiveViewMode === 'tv';

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

  // ── Reset scroll on mode change ──────────────────────────────────────────────
  useEffect(() => {
    if (mainViewportRef.current) {
      mainViewportRef.current.scrollTop = 0;
    }
  }, [viewMode]);

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

        // Nivel de legibilidad por ancho de viewport: tablet < desktop < TV/4K.
        // Breakpoints inteligentes: mobile (<768) / tablet (768-1279) /
        // desktop (1280-1919) / TV (>=1920).
        const tier: ScreenTier =
          width >= 1920 ? 'xl'
          : width >= 1280 ? 'lg'
          : width >= 768  ? 'md'
          : 'sm';

        setGridCols(cols);
        setGridRows(rows);
        setOrdersPerPage(isTVMode ? cols * rows || 8 : 999);
        setIsWide(cols <= 4 && rows <= 2 && isWideScreen && !isDenseLayout);
        setIsDense(isDenseLayout);
        setScreenTier(tier);
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
  const uniqueClients = useMemo(
    () => Array.from(new Set(odooOrders.map(o => o.partner_name))).sort(),
    [odooOrders],
  );

  const filteredOdooOrders = useMemo(() => {
    const matchesClient = (order: OdooSaleOrder) =>
      !clientFilter || order.partner_name.toLowerCase().includes(clientFilter.toLowerCase());

    const q = textFilter.trim().toLowerCase();
    const matchesText = (order: OdooSaleOrder) =>
      !q ||
      order.name.toLowerCase().includes(q) ||
      order.main_product.toLowerCase().includes(q) ||
      order.partner_name.toLowerCase().includes(q);

    // Override: el filtro de voz 'entregadas' muestra SOLO las totalmente entregadas.
    if (voiceFilter === 'delivered') {
      return odooOrders.filter(o => isOrderFullyDelivered(o) && matchesClient(o) && matchesText(o));
    }

    // Por defecto: ocultar de la vista TV las órdenes totalmente entregadas.
    return odooOrders.filter(order => {
      if (isOrderFullyDelivered(order)) return false;
      if (!matchesClient(order)) return false;
      if (!matchesText(order)) return false;
      if (voiceFilter === 'all') return true;
      const isOverdue = isOrderOverdue(order);
      const progress = getDeliveryProgress(order);
      if (voiceFilter === 'overdue') return isOverdue;
      if (voiceFilter === 'pending') return progress < 100 && !isOverdue;
      if (voiceFilter === 'critical') {
        const priority = getOrderPriority(order);
        return priority === 'critical' || priority === 'high';
      }
      return true;
    });
  }, [odooOrders, voiceFilter, clientFilter, textFilter]);

  const groupedOrders = useMemo(() =>
    filteredOdooOrders.reduce((acc, order) => {
      const key = order.partner_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, OdooSaleOrder[]>),
    [filteredOdooOrders]
  );

  const pages = useMemo<TVPage[]>(() => {
    if (isTVMode) return buildTVPages(filteredOdooOrders, ordersPerPage);
    return Object.entries(groupedOrders).map(([company, orders]) => ({
      type: 'company' as const,
      company,
      orders,
    }));
  }, [filteredOdooOrders, groupedOrders, ordersPerPage, isTVMode]);

  // Mantener la ref de catálogo al día con cada render, para que el handler async de
  // reconocimiento de voz siempre opere sobre los datos más recientes.
  useEffect(() => { odooOrdersRef.current = odooOrders; }, [odooOrders]);

  // ── Auto-rotate pages (solo en modo TV) ──────────────────────────────────────
  useEffect(() => {
    if (!isTVMode || pages.length <= 1 || highlightedSO || rotationPaused) return;
    const interval = setInterval(() => {
      setCurrentPageIndex(prev => (prev + 1) % pages.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [pages.length, highlightedSO, isTVMode, rotationPaused]);

  useEffect(() => {
    if (currentPageIndex >= pages.length && pages.length > 0) setCurrentPageIndex(0);
  }, [pages.length, currentPageIndex]);

  // Al cambiar el filtro de cliente o la búsqueda, volver a la primera página.
  useEffect(() => {
    setCurrentPageIndex(0);
  }, [clientFilter, textFilter]);

  // Navegar a la página de la orden resaltada por voz. Se hace en un efecto (no inline
  // en el handler de voz) porque un comando de voz puede resaltar Y filtrar a la vez:
  // `pages` todavía no refleja el nuevo filtro en el mismo tick que se llama setHighlightedSO,
  // así que hay que esperar a que este efecto corra con la paginación ya actualizada.
  useEffect(() => {
    if (!highlightedSO) return;
    const pageIdx = pages.findIndex(page =>
      page.type === 'company'
        ? page.orders.some(order => order.name === highlightedSO)
        : page.segments.some(segment => segment.orders.some(order => order.name === highlightedSO))
    );
    if (pageIdx !== -1) setCurrentPageIndex(pageIdx);
  }, [highlightedSO, pages]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
      if (voiceResponseTimerRef.current) clearTimeout(voiceResponseTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const currentPage = pages.length > 0 ? pages[currentPageIndex] : null;

  // ── Voice control ────────────────────────────────────────────────────────────
  const toggleRecording = async () => {
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const win = window as WindowWithSpeech;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Tu navegador no soporta la API de reconocimiento de voz. Usa Chrome o Edge.', 'error');
      return;
    }

    // Interrumpir cualquier respuesta de voz en curso: si el operador ya vuelve a
    // picarle al micro, quiere hablar ya, no esperar a que termine el anuncio anterior.
    stopSpokenAudio();
    setIsSpeaking(false);
    // Invalida el TTS pendiente de un turno anterior (ver comentario en voiceTurnRef).
    const turnId = ++voiceTurnRef.current;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-MX';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;
      recognitionRef.current = recognition;

      recognition.onstart = () => setIsRecording(true);

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        let interimTranscript = '';
        let finalTranscript = '';
        const finalAlternatives: string[] = [];

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
            for (let a = 0; a < result.length; a++) {
              const alt = result[a]?.transcript;
              if (alt) finalAlternatives.push(alt);
            }
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        // Mostrar lo que se va entendiendo en tiempo real
        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
          setVoiceTranscript(currentText);
        }

        if (finalTranscript) {
          recognition.stop();
          setIsRecording(false);
          setIsProcessingVoice(true);

          try {
            // 1. Intentar patrón local ultra-rápido (< 5ms) probando cada alternativa de
            // reconocimiento (ayuda sobre todo a acertar números de PO con ruido de piso).
            // Una alternativa de menor confianza que resuelve a "highlight" (PO exacto) se
            // prefiere sobre una de mayor confianza que solo resuelve a "filter" — de lo
            // contrario el orden de las alternativas podría resucitar el secuestro de
            // intención que motivó este fast path (pedir una orden y recibir un filtro).
            const localCandidates = finalAlternatives
              .map(alt => tryLocalFastVoiceCommand(alt, odooOrdersRef.current))
              .filter((r): r is VoiceCommandResponse => r !== null);
            const localResult = localCandidates.find(r => r.action === 'highlight') ?? localCandidates[0] ?? null;
            const result = localResult ?? await processTextVoiceCommand(
              finalTranscript,
              odooOrdersRef.current,
              lastVoiceTurnRef.current,
            );

            if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
            setVoiceTranscript(result.transcript || finalTranscript);
            transcriptTimerRef.current = setTimeout(() => setVoiceTranscript(null), 10000);

            setVoiceResponse(result);
            if (voiceResponseTimerRef.current) clearTimeout(voiceResponseTimerRef.current);
            voiceResponseTimerRef.current = setTimeout(() => setVoiceResponse(null), 12000);

            if (result.transcript && result.message) {
              lastVoiceTurnRef.current = { transcript: result.transcript, message: result.message };
            }

            if (result.message) {
              showToast(result.message, result.action === 'answer' ? 'info' : 'success');
              setIsSpeaking(true);
              // Gemini TTS es la voz principal para todo comando (local o de Gemini): la app
              // ya depende de internet para todo lo demás (Odoo, interpretación de voz), así
              // que evitar la red aquí no compra nada real — y la voz de Gemini suena mejor
              // que la nativa del navegador. speakFastLocal queda solo como respaldo de
              // emergencia si el TTS en la nube falla. getSpokenAudio memoiza por texto exacto,
              // así que un mensaje repetido (p. ej. "Filtros limpiados...") no vuelve a golpear
              // la red.
              getSpokenAudio(result.message)
                .then(audioBase64 => {
                  // Un turno más nuevo (el operador ya volvió a picarle al micro) superó a
                  // este: no hablar la respuesta vieja ni pisar el indicador de "hablando".
                  if (turnId !== voiceTurnRef.current) return;
                  if (audioBase64) {
                    playPCMBase64(audioBase64, () => setIsSpeaking(false));
                  } else if (!speakFastLocal(result.message, () => setIsSpeaking(false))) {
                    setIsSpeaking(false);
                  }
                })
                .catch(() => {
                  if (turnId !== voiceTurnRef.current) return;
                  if (!speakFastLocal(result.message, () => setIsSpeaking(false))) setIsSpeaking(false);
                });
            }

            if (result.action === 'filter') {
              const ft = result.filter_type as string | null;
              if (ft && (VALID_VOICE_FILTERS as readonly string[]).includes(ft)) {
                setVoiceFilter(ft as VoiceFilter);
                if (ft === 'all') setClientFilter(null);
              }
              if (result.filter_client) {
                setClientFilter(result.filter_client);
              }
              setCurrentPageIndex(0);
            }

            // Manejo de orden esperada/encontrada
            const targetPOString = result.expected_order?.po_number || result.po_number;
            if (targetPOString) {
              const target = formatPONumber(targetPOString);
              const currentOrders = odooOrdersRef.current;
              const targetDigits = targetPOString.replace(/\D/g, '');
              // El PO puede venir de Gemini en formato libre, no solo del regex determinista
              // del fast path — se compara igual por sufijo de dígitos (nunca substring amplio)
              // para no confundir un año como "2026" con una orden que solo comparte esos dígitos.
              const found =
                currentOrders.find(o => formatPONumber(o.name) === target) ??
                currentOrders.find(o => o.name === targetPOString) ??
                (targetDigits.length >= 3 ? currentOrders.find(o => o.name.replace(/\D/g, '').endsWith(targetDigits)) : undefined);
              if (found) {
                const soId = found.name;
                // La navegación a la página correcta la resuelve un useEffect([highlightedSO, pages]) —
                // si este comando también filtró, `pages` todavía no lo refleja en este punto.
                await playSuccessSound();
                setHighlightedSO(soId);
                if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
                highlightTimerRef.current = setTimeout(() => setHighlightedSO(null), 12000);
              } else if (result.action !== 'filter') {
                showToast(`No se encontró la orden ${targetPOString}.`, 'error');
                await playErrorSound();
              }
            }
          } catch (e) {
            console.error('Error en el procesamiento de voz', e);
            const msg = e instanceof AIError ? e.userMessage : 'Hubo un error al procesar el comando de voz.';
            showToast(msg, 'error');
            await playErrorSound();
          } finally {
            setIsProcessingVoice(false);
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
          showToast('Permiso de micrófono denegado. Habilítalo en el navegador.', 'error');
        } else if (event.error !== 'aborted') {
          showToast(`Error al escuchar: ${event.error}`, 'error');
        }
        setIsRecording(false);
        setIsProcessingVoice(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Error starting recognition', err);
      showToast('No se pudo acceder al micrófono para los comandos de voz.', 'error');
      setIsRecording(false);
    }
  };

  const handleClearControls = () => {
    setClientFilter(null);
    setTextFilter('');
    setRotationPaused(false);
    setVoiceFilter('all');
    setCurrentPageIndex(0);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={mainViewportRef}
      className={`bg-background text-foreground px-4 lg:px-6 font-sans transition-all duration-700 relative custom-scrollbar ${
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
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[130px] rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <DashboardHeader
        currentTime={currentTime}
        currentCompany={isTVMode ? (currentPage?.type === 'company' ? currentPage.company : (currentPage?.type === 'shared' ? 'MÚLTIPLES CLIENTES' : undefined)) : undefined}
        currentPageNum={currentPage?.type === 'company' ? currentPage.current : undefined}
        totalPages={currentPage?.type === 'company' ? currentPage.total : undefined}
        odooStatus={odooStatus}
        odooLastUpdated={odooLastUpdated}
        isRefreshing={isRefreshing}
        onRefresh={loadOdooOrders}
        viewMode={effectiveViewMode}
        onViewModeChange={setViewMode}
        showGradient={showGradient}
        onToggleGradient={() => setShowGradient(!showGradient)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        voiceFilter={voiceFilter}
        clientFilter={clientFilter}
        textFilter={textFilter}
        onClearFilter={() => { setVoiceFilter('all'); setClientFilter(null); setTextFilter(''); setRotationPaused(false); setCurrentPageIndex(0); }}
        isSpeaking={isSpeaking}
        onNavigateAdmin={() => navigate('/admin')}
      />

      {/* ── Main grid ──────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`flex-1 relative flex flex-col z-10 ${
          isTVMode ? 'min-h-0 overflow-hidden pb-1' : 'pb-1'
        }`}
      >
        {odooOrders.length > 0 && (
          <TVControlBar
            isTVMode={isTVMode}
            isMobile={isMobile}
            clients={uniqueClients}
            clientFilter={clientFilter}
            onClient={setClientFilter}
            textFilter={textFilter}
            onText={setTextFilter}
            isPaused={rotationPaused}
            onTogglePause={() => setRotationPaused(p => !p)}
            onClear={handleClearControls}
          />
        )}

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
                <SkeletonCard key={i} isWide={isWide} isDense={isDense} screenTier={screenTier} />
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
              {window.location.hostname === 'localhost' && (
                <p className="text-zinc-600 text-sm">
                  Asegúrate de que el servidor Express proxy esté corriendo:<br />
                  <code className="text-indigo-400 bg-zinc-900 px-2 py-0.5 rounded text-xs">npm run server</code>
                </p>
              )}
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
          <div className="flex flex-col h-full min-h-0 relative">
            {currentPage.type === 'company' && currentPage.total && currentPage.total > 1 && (
              <div className="absolute top-0 right-0 z-10 text-zinc-500 font-bold uppercase tracking-widest text-xs lg:text-sm bg-background/50 px-2 py-1 rounded backdrop-blur-sm">
                Página {currentPage.current} de {currentPage.total}
              </div>
            )}
            
            {currentPage.type === 'company' ? (
              <CompanyTVSection 
                company={currentPage.company}
                orders={currentPage.orders}
                isWide={isWide}
                isDense={isDense}
                screenTier={screenTier}
                gridCols={gridCols}
                gridRows={gridRows}
                companyConfigs={companyConfigs}
                highlightedSO={highlightedSO}
                onOrderClick={setSelectedOrder}
              />
            ) : (
              <SharedTVPage
                page={currentPage}
                gridCols={gridCols}
                gridRows={gridRows}
                isWide={isWide}
                isDense={isDense}
                screenTier={screenTier}
                highlightedSO={highlightedSO}
                onOrderClick={setSelectedOrder}
              />
            )}
          </div>
        ) : !isTVMode && pages.length > 0 ? (
          /* ── Modo Desktop: todas las órdenes con scroll, agrupadas ── */
          <div className={`flex flex-col ${isMobile ? 'gap-4' : 'gap-8'}`}>
            {pages.map((page) => {
              if (page.type !== 'company') return null;
              const pageData = page;
              return (
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
                      <h2 className="text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight uppercase">
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
                  className={`grid ${isMobile ? 'gap-3' : 'gap-4 lg:gap-6'}`}
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(gridCols, 4)}, minmax(0, 1fr))`,
                    gridAutoRows: isMobile ? 'auto' : 'minmax(220px, auto)',
                  }}
                >
                  {pageData.orders.map((order) => (
                    <OdooOrderCard
                      key={order.id}
                      order={order}
                      isHighlighted={highlightedSO === order.name}
                      isWide={false}
                      isDense={false}
                      isMobile={isMobile}
                      screenTier={screenTier}
                      viewMode="desktop"
                      onClick={() => setSelectedOrder(order)}
                    />
                  ))}
                </div>
              </div>
            )})}
          </div>
        ) : null}
      </div>

      {/* ── Feedback de voz (escucha + transcripción) ───────────────────────────── */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            key="voice-listening"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-3 px-6 py-3 rounded-full bg-red-500/15 border border-red-500/40 backdrop-blur-md shadow-[0_0_30px_rgba(239,68,68,0.3)]"
          >
            <span className="flex items-end gap-1 h-5">
              {[0, 1, 2, 3, 4].map(i => (
                <span
                  key={i}
                  className="w-1 bg-red-400 rounded-full animate-pulse"
                  style={{ height: `${6 + ((i % 3) + 1) * 4}px`, animationDelay: `${i * 0.12}s` }}
                />
              ))}
            </span>
            <span className="text-red-200 font-bold uppercase tracking-widest text-sm">Escuchando…</span>
          </motion.div>
        )}
        {!isRecording && voiceTranscript && (
          <motion.div
            key="voice-transcript"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[80vw] px-6 py-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 backdrop-blur-md shadow-[0_0_30px_rgba(99,102,241,0.3)]"
          >
            <span className="flex items-center gap-2 text-indigo-200 font-semibold text-base lg:text-lg">
              <Mic className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              «{voiceTranscript}»
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Overlay HUD de Respuesta por Voz ───────────────────────────── */}
      <VoiceFeedbackOverlay
        response={voiceResponse}
        isProcessing={isProcessingVoice}
        isRecording={isRecording}
        transcript={voiceTranscript}
        onClose={() => setVoiceResponse(null)}
      />

      {/* ── Modal de Detalles de Orden ───────────────────────────────────────── */}
      <OrderDetailsModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <DashboardFooter
        totalOrders={odooOrders.length}
        pages={isTVMode ? pages : []}
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
