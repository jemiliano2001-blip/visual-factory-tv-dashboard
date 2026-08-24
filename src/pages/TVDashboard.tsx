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
  getEffectiveDeliverySchedule,
} from '../services/odoo';
import { formatPONumber } from '../utils/formatters';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { processTextVoiceCommand, tryLocalFastVoiceCommand, speakFastLocal, getSpokenAudio, AIError, type VoiceCommandResponse } from '../services/ai';
import { getVoiceRiskFocusedOrders, isVoiceRiskQuestion, validateVoiceRiskFocus } from '../services/voiceRisk';
import { playGeminiSpeechStream, type SpeechStreamPlayback } from '../services/speechStream';
import {
  RISK_ACKNOWLEDGEMENT_DELAY_MS,
  RISK_ACKNOWLEDGEMENT_TEXT,
  resolveVoiceTurn,
  shouldPlayRiskAcknowledgement,
} from '../services/voiceAcknowledgement';
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
import { getCenteredLastRowStart } from '../utils/tvGridLayout';
import { INITIAL_ROTATION_PAUSED, shouldAutoRotate } from '../services/rotationPolicy';
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

interface VoiceAcknowledgementTurn {
  turnId: number;
  startedAt: number;
  audioBase64?: string;
  audioReady: boolean;
  riskPending: boolean;
  resultReady: boolean;
  cancelled: boolean;
  played: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

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

const playPCMBase64 = async (
  base64: string,
  onEnded?: () => void,
  shouldStart?: () => boolean,
) => {
  try {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const audioCtx = getAudioContext();
    if (!audioCtx) return onEnded && onEnded();

    await ensureAudioRunning(audioCtx);
    if (shouldStart && !shouldStart()) return onEnded?.();
    const numSamples = bytes.length / 2;
    const audioBuffer = audioCtx.createBuffer(1, numSamples, 24000);
    const channelData = audioBuffer.getChannelData(0);
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < numSamples; i++) channelData[i] = dataView.getInt16(i * 2, true) / 32768.0;
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);
    source.onended = () => {
      if (activeAudioSource === source) activeAudioSource = null;
      onEnded?.();
    };
    if (activeAudioSource) {
      // Quitar su onended antes de detenerlo: si no, su callback (setIsSpeaking(false) de
      // un turno anterior) se dispara durante el arranque de este nuevo audio y pisa el
      // indicador de "hablando" del turno actual.
      activeAudioSource.onended = null;
      try { activeAudioSource.stop(); } catch { /* ya había terminado */ }
    }
    activeAudioSource = source;
    source.start();
  } catch {
    onEnded?.();
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
  highlightedSO: string | null;
  onOrderClick: (order: OdooSaleOrder) => void;
}> = ({ company, orders, isWide, isDense, screenTier, gridCols, gridRows, highlightedSO, onOrderClick }) => (
  <div className="h-full min-h-0 w-full">
    <motion.div
      key={`${company}-grid`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.5 }}
      className="grid h-full min-h-0 gap-3 lg:gap-4"
      style={{
        gridTemplateColumns: `repeat(${gridCols * 2}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.ceil(orders.length / gridCols)}, minmax(0, 1fr))`,
      }}
    >
      {orders.map((order, index) => {
        const centeredStart = getCenteredLastRowStart(index, orders.length, gridCols);

        return (
          <div
            key={order.id}
            className="min-h-0"
            style={{
              gridColumn: centeredStart ? `${centeredStart} / span 2` : 'span 2',
            }}
          >
            <OdooOrderCard
              order={order}
              isHighlighted={highlightedSO === order.name}
              isWide={isWide}
              isDense={isDense}
              screenTier={screenTier}
              viewMode="tv"
              onClick={() => onOrderClick(order)}
            />
          </div>
        );
      })}
    </motion.div>
  </div>
);

export default function TVDashboard() {

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
  const navigate = useNavigate();
  const [companyConfigs, setCompanyConfigs] = useState<CompanyConfig[]>([]);
  const [showGradient, setShowGradient]     = useState(true);
  const [currentTime, setCurrentTime]       = useState(new Date());
  const [highlightedSO, setHighlightedSO]   = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedOrder, setSelectedOrder]   = useState<OdooSaleOrder | null>(null);
  const [viewMode, setViewMode]             = usePersistedState<ViewMode>('vftv:tv:viewMode', 'tv');
  const [isFullscreen, setIsFullscreen]     = useState(false);
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
  const [voiceRiskFocusPOs, setVoiceRiskFocusPOs] = useState<string[]>([]);
  const [clientFilter, setClientFilter]     = usePersistedState<string | null>('vftv:tv:client', null);
  const [textFilter, setTextFilter]         = usePersistedState<string>('vftv:tv:text', '');
  const [rotationPaused, setRotationPaused] = useState(INITIAL_ROTATION_PAUSED);

  // ── Voice ────────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isRiskVoiceProcessing, setIsRiskVoiceProcessing] = useState(false);
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
  const streamPlaybackRef       = useRef<SpeechStreamPlayback | null>(null);
  const acknowledgementRef      = useRef<VoiceAcknowledgementTurn | null>(null);
  // Último turno para dar contexto conversacional a seguimientos ("¿y las de Bosch?")
  const lastVoiceTurnRef        = useRef<{ transcript: string; message: string } | null>(null);
  // El handler onresult es async y puede resolver segundos después (viaje a Gemini de por medio);
  // usar una ref en vez de la variable del closure evita operar sobre catálogo ya obsoleto
  // si odooOrders cambió (polling) mientras se procesaba el comando.
  const odooOrdersRef           = useRef<OdooSaleOrder[]>(odooOrders);

  const recheckRiskAcknowledgement = useCallback((turnId: number) => {
    const acknowledgement = acknowledgementRef.current;
    if (
      !acknowledgement
      || acknowledgement.turnId !== turnId
      || turnId !== voiceTurnRef.current
      || acknowledgement.cancelled
      || acknowledgement.played
    ) {
      return;
    }

    const elapsedMs = performance.now() - acknowledgement.startedAt;
    if (!shouldPlayRiskAcknowledgement({
      isRisk: acknowledgement.riskPending,
      elapsedMs,
      audioReady: acknowledgement.audioReady,
      resultReady: acknowledgement.resultReady,
    })) {
      return;
    }

    const audioBase64 = acknowledgement.audioBase64;
    if (!audioBase64) return;
    acknowledgement.played = true;
    void playPCMBase64(audioBase64, undefined, () => {
      const current = acknowledgementRef.current;
      return Boolean(
        current
        && current.turnId === turnId
        && turnId === voiceTurnRef.current
        && !current.cancelled
        && !current.resultReady,
      );
    });
  }, []);

  const resolveAcknowledgementForTurn = useCallback((turnId: number, finalMessage: string) => {
    const acknowledgement = acknowledgementRef.current;
    const acknowledgementPlaying = Boolean(
      acknowledgement
      && acknowledgement.turnId === turnId
      && acknowledgement.played
      && !acknowledgement.cancelled,
    );

    if (acknowledgement?.turnId === turnId) {
      acknowledgement.resultReady = true;
      acknowledgement.riskPending = false;
      acknowledgement.cancelled = true;
      if (acknowledgement.timer) {
        clearTimeout(acknowledgement.timer);
        acknowledgement.timer = undefined;
      }
    }

    const resolution = resolveVoiceTurn({ acknowledgementPlaying, finalMessage });
    if (resolution.includes('cancelAcknowledgement')) stopSpokenAudio();
    return resolution;
  }, []);

  const interruptVoicePlayback = useCallback(() => {
    streamPlaybackRef.current?.cancel();
    streamPlaybackRef.current = null;

    const acknowledgement = acknowledgementRef.current;
    if (acknowledgement) {
      acknowledgement.cancelled = true;
      acknowledgement.riskPending = false;
      if (acknowledgement.timer) {
        clearTimeout(acknowledgement.timer);
        acknowledgement.timer = undefined;
      }
    }

    stopSpokenAudio();
  }, []);

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
    if (voiceRiskFocusPOs.length > 0) {
      return getVoiceRiskFocusedOrders(odooOrders, voiceRiskFocusPOs);
    }
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
  }, [odooOrders, voiceFilter, clientFilter, textFilter, voiceRiskFocusPOs]);

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
    if (isTVMode) {
      return buildTVPages(filteredOdooOrders, { ordersPerPage, gridCols, gridRows });
    }
    return Object.entries(groupedOrders).map(([company, orders]) => ({
      type: 'company' as const,
      company,
      orders,
    }));
  }, [filteredOdooOrders, groupedOrders, ordersPerPage, gridCols, gridRows, isTVMode]);

  // Mantener la ref de catálogo al día con cada render, para que el handler async de
  // reconocimiento de voz siempre opere sobre los datos más recientes.
  useEffect(() => { odooOrdersRef.current = odooOrders; }, [odooOrders]);

  // ── Auto-rotate pages (solo en modo TV) ──────────────────────────────────────
  useEffect(() => {
    if (!shouldAutoRotate({
      isTVMode,
      pageCount: pages.length,
      highlightedOrder: Boolean(highlightedSO),
      paused: rotationPaused,
    })) return;
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
      voiceTurnRef.current += 1;
      interruptVoicePlayback();
    };
  }, [interruptVoicePlayback]);

  const currentPage = pages.length > 0 ? pages[currentPageIndex] : null;
  const currentHeaderCompany = isTVMode
    ? currentPage?.type === 'company'
      ? currentPage.company
      : currentPage?.type === 'shared'
        ? 'CLIENTES COMPARTIDOS'
        : undefined
    : undefined;
  const currentHeaderCompanyLogo = isTVMode && currentPage?.type === 'company'
    ? getCustomerLogo(currentPage.company)
    : null;
  const currentCompanyDeliverySchedule = isTVMode && currentPage?.type === 'company'
    ? getEffectiveDeliverySchedule(currentPage.company, currentPage.orders, companyConfigs)
    : null;
  const currentPageOrders = currentPage?.type === 'company'
    ? currentPage.orders
    : currentPage?.type === 'shared'
      ? currentPage.segments.flatMap(segment => segment.orders)
      : [];
  const currentPageOverdueCount = currentPageOrders.filter(isOrderOverdue).length;
  const currentPageCriticalCount = currentPageOrders.filter(order => {
    const priority = getOrderPriority(order);
    return priority === 'critical' || priority === 'high';
  }).length;

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
    interruptVoicePlayback();
    const audioContext = getAudioContext();
    if (audioContext) void ensureAudioRunning(audioContext).catch(() => undefined);
    setIsSpeaking(false);
    setIsRiskVoiceProcessing(false);
    if (voiceResponseTimerRef.current) {
      clearTimeout(voiceResponseTimerRef.current);
      voiceResponseTimerRef.current = null;
    }
    setVoiceResponse(null);
    // Invalida el TTS pendiente de un turno anterior (ver comentario en voiceTurnRef).
    const turnId = ++voiceTurnRef.current;
    acknowledgementRef.current = {
      turnId,
      startedAt: performance.now(),
      audioReady: false,
      riskPending: false,
      resultReady: false,
      cancelled: false,
      played: false,
    };
    void getSpokenAudio(RISK_ACKNOWLEDGEMENT_TEXT)
      .then(audioBase64 => {
        const acknowledgement = acknowledgementRef.current;
        if (
          !audioBase64
          || !acknowledgement
          || acknowledgement.turnId !== turnId
          || turnId !== voiceTurnRef.current
          || acknowledgement.cancelled
        ) {
          return;
        }
        acknowledgement.audioBase64 = audioBase64;
        acknowledgement.audioReady = true;
        recheckRiskAcknowledgement(turnId);
      })
      .catch(() => undefined);

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-MX';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;
      recognitionRef.current = recognition;

      recognition.onstart = () => setIsRecording(true);

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        if (turnId !== voiceTurnRef.current) return;
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
          const recognitionEndedAt = performance.now();
          recognition.stop();
          setIsRecording(false);

          try {
            // 1. Intentar patrón local ultra-rápido (< 5ms) probando cada alternativa de
            // reconocimiento (ayuda sobre todo a acertar números de PO con ruido de piso).
            // Una alternativa de menor confianza que resuelve a "highlight" (PO exacto) se
            // prefiere sobre una de mayor confianza que solo resuelve a "filter" — de lo
            // contrario el orden de las alternativas podría resucitar el secuestro de
            // intención que motivó este fast path (pedir una orden y recibir un filtro).
            const riskQuestion = isVoiceRiskQuestion(finalTranscript);
            let riskHudSetAt: number | undefined;
            let recognitionEndToHudMs: number | undefined;
            setIsProcessingVoice(true);
            setIsRiskVoiceProcessing(riskQuestion);

            const acknowledgement = acknowledgementRef.current;
            if (acknowledgement?.turnId === turnId) {
              acknowledgement.startedAt = recognitionEndedAt;
              acknowledgement.riskPending = riskQuestion;
              if (riskQuestion) {
                acknowledgement.timer = setTimeout(() => {
                  acknowledgement.timer = undefined;
                  recheckRiskAcknowledgement(turnId);
                }, RISK_ACKNOWLEDGEMENT_DELAY_MS);
                recheckRiskAcknowledgement(turnId);
              }
            }

            if (riskQuestion) {
              riskHudSetAt = performance.now();
              recognitionEndToHudMs = riskHudSetAt - recognitionEndedAt;
            }
            const localCandidates = riskQuestion
              ? []
              : finalAlternatives
                .map(alt => tryLocalFastVoiceCommand(alt, odooOrdersRef.current))
                .filter((r): r is VoiceCommandResponse => r !== null);
            const localResult = localCandidates.find(r => r.action === 'highlight') ?? localCandidates[0] ?? null;
            const result = localResult ?? await processTextVoiceCommand(
              finalTranscript,
              odooOrdersRef.current,
              lastVoiceTurnRef.current,
            );
            if (turnId !== voiceTurnRef.current) return;
            const voiceResolution = resolveAcknowledgementForTurn(turnId, result.message);
            setIsRiskVoiceProcessing(false);
            const validRiskOrders = result.action === 'focus' && riskQuestion
              ? validateVoiceRiskFocus(result, odooOrdersRef.current)
              : null;
            if (result.action === 'focus' && !validRiskOrders) {
              throw new AIError('invalid_response');
            }

            if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
            setVoiceTranscript(result.transcript || finalTranscript);
            transcriptTimerRef.current = setTimeout(() => setVoiceTranscript(null), 10000);

            setVoiceResponse(validRiskOrders ? { ...result, risk_orders: validRiskOrders } : result);
            if (voiceResponseTimerRef.current) clearTimeout(voiceResponseTimerRef.current);
            voiceResponseTimerRef.current = setTimeout(() => setVoiceResponse(null), 12000);

            if (result.transcript && result.message) {
              lastVoiceTurnRef.current = { transcript: result.transcript, message: result.message };
            }

            if (result.message) {
              showToast(result.message, result.action === 'answer' ? 'info' : 'success');
            }

            if (result.message && voiceResolution.includes('startFinalStream')) {
              setIsSpeaking(true);
              let fallbackStarted = false;
              const startFallbackOnce = () => {
                if (fallbackStarted || turnId !== voiceTurnRef.current) return;
                fallbackStarted = true;
                const fallbackDidStart = speakFastLocal(result.message, () => {
                  if (turnId === voiceTurnRef.current) setIsSpeaking(false);
                });
                if (!fallbackDidStart) setIsSpeaking(false);
              };

              let playback: SpeechStreamPlayback;
              try {
                const audioContext = getAudioContext();
                if (!audioContext) throw new Error('AudioContext no disponible');
                playback = playGeminiSpeechStream(result.message, {
                  audioContext,
                  onFirstAudio: () => {
                    if (
                      turnId !== voiceTurnRef.current
                      || riskHudSetAt === undefined
                      || recognitionEndToHudMs === undefined
                    ) {
                      return;
                    }
                    const hudToFirstAudioMs = performance.now() - riskHudSetAt;
                    if (import.meta.env.DEV) {
                      console.debug('[voice timing]', { recognitionEndToHudMs, hudToFirstAudioMs });
                    }
                  },
                  onEnded: () => {
                    if (turnId !== voiceTurnRef.current) return;
                    if (streamPlaybackRef.current === playback) streamPlaybackRef.current = null;
                    setIsSpeaking(false);
                  },
                });
                streamPlaybackRef.current = playback;
                void playback.promise.catch(() => {
                  if (turnId !== voiceTurnRef.current) return;
                  if (streamPlaybackRef.current === playback) streamPlaybackRef.current = null;
                  startFallbackOnce();
                });
              } catch {
                startFallbackOnce();
              }
            }

            if (result.action === 'filter') {
              setVoiceRiskFocusPOs([]);
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

            if (validRiskOrders) {
              setVoiceRiskFocusPOs(validRiskOrders.map(order => order.po_number));
              setCurrentPageIndex(0);
              setRotationPaused(true);
            } else if (result.action !== 'focus') {
              setVoiceRiskFocusPOs([]);
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
            if (turnId !== voiceTurnRef.current) return;
            resolveAcknowledgementForTurn(turnId, '');
            setIsRiskVoiceProcessing(false);
            console.error('Error en el procesamiento de voz');
            const msg = e instanceof AIError ? e.userMessage : 'Hubo un error al procesar el comando de voz.';
            showToast(msg, 'error');
            await playErrorSound();
          } finally {
            if (turnId === voiceTurnRef.current) {
              setIsProcessingVoice(false);
              setIsRiskVoiceProcessing(false);
            }
          }
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (turnId !== voiceTurnRef.current) return;
        resolveAcknowledgementForTurn(turnId, '');
        console.error('Error en el reconocimiento de voz');
        if (event.error === 'not-allowed') {
          showToast('Permiso de micrófono denegado. Habilítalo en el navegador.', 'error');
        } else if (event.error !== 'aborted') {
          showToast(`Error al escuchar: ${event.error}`, 'error');
        }
        setIsRecording(false);
        setIsProcessingVoice(false);
        setIsRiskVoiceProcessing(false);
      };

      recognition.onend = () => {
        if (turnId === voiceTurnRef.current) setIsRecording(false);
      };

      recognition.start();
    } catch {
      resolveAcknowledgementForTurn(turnId, '');
      console.error('Error al iniciar el reconocimiento de voz');
      showToast('No se pudo acceder al micrófono para los comandos de voz.', 'error');
      setIsRecording(false);
      setIsRiskVoiceProcessing(false);
    }
  };

  const handleClearControls = () => {
    setClientFilter(null);
    setTextFilter('');
    setRotationPaused(false);
    setVoiceFilter('all');
    setVoiceRiskFocusPOs([]);
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
      {/* Fondo degradado — decorativo, alternable desde el header. */}
      <AnimatePresence>
        {showGradient && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-0"
            aria-hidden="true"
          >
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/8 blur-[130px] rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <DashboardHeader
        currentTime={currentTime}
        currentCompany={currentHeaderCompany}
        currentCompanyLogo={currentHeaderCompanyLogo}
        currentCompanyDeliverySchedule={currentCompanyDeliverySchedule}
        currentPageNum={currentPage?.type === 'company' ? currentPage.current : undefined}
        totalPages={currentPage?.type === 'company' ? currentPage.total : undefined}
        screenOrderCount={currentPageOrders.length}
        screenOverdueCount={currentPageOverdueCount}
        screenCriticalCount={currentPageCriticalCount}
        onShowOverdue={() => {
          if (currentPageOverdueCount === 0) return;
          setVoiceFilter('overdue');
          setRotationPaused(true);
          setCurrentPageIndex(0);
        }}
        odooStatus={odooStatus}
        odooLastUpdated={odooLastUpdated}
        isRefreshing={isRefreshing}
        onRefresh={loadOdooOrders}
        viewMode={effectiveViewMode}
        onViewModeChange={setViewMode}
        showGradient={showGradient}
        onToggleGradient={() => setShowGradient(v => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        voiceFilter={voiceFilter}
        clientFilter={clientFilter}
        textFilter={textFilter}
        onClearFilter={handleClearControls}
        isSpeaking={isSpeaking}
        isRotationPaused={rotationPaused}
        onResumeRotation={() => setRotationPaused(false)}
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
                      {getEffectiveDeliverySchedule(pageData.company, pageData.orders, companyConfigs) && (
                        <div className="flex items-center gap-1.5 mt-1 text-cyan-300 font-mono-data text-xs lg:text-sm font-semibold tracking-wide">
                          <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
                          <span>
                            Horario: {getEffectiveDeliverySchedule(pageData.company, pageData.orders, companyConfigs)}
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
        isRiskProcessing={isRiskVoiceProcessing}
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
        totalOrders={filteredOdooOrders.length}
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
