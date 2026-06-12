import React, { useEffect, useState, useRef } from 'react';
import { WorkOrder, Priority, Status } from '../types';
import { subscribeToWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder, getWorkOrderHistory } from '../services/workOrders';
import { filterOrdersByNaturalLanguage, generateClientReport, analyzeOrderAnomalies, extractOrdersFromFile, predictOrderRisk } from '../services/ai';
import { Plus, Search, Edit2, Trash2, X, Save, Download, Sparkles, Mail, Activity, Upload, Camera, Image as ImageIcon, Loader2, GripVertical, Clock, Check, ChevronDown, CheckSquare, Package } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx-js-style';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { analyzeImage, generateVisualAid } from '../services/ai';
import { formatPONumber } from '../utils/formatters';
import { 
  useReactTable, 
  getCoreRowModel, 
  flexRender, 
  createColumnHelper,
  ColumnOrderState
} from '@tanstack/react-table';
import { CompanyConfig } from '../types';
import { subscribeToCompanyConfigs, createCompanyConfig, updateCompanyConfig, deleteCompanyConfig } from '../services/companyConfigs';

export default function AdminPanel() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const uniqueCompanies = Array.from(new Set(orders.map(o => o.company_name))).filter(Boolean).sort();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [formData, setFormData] = useState<Partial<WorkOrder>>({});
  
  // AI State
  const [nlQuery, setNlQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [aiFilterIds, setAiFilterIds] = useState<string[] | null>(null);
  const [aiModalContent, setAiModalContent] = useState<{title: string, content: string} | null>(null);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Image Analysis & Generation State
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showGeneration, setShowGeneration] = useState(false);
  const [analysisImage, setAnalysisImage] = useState<string | null>(null);
  const [analysisFile, setAnalysisFile] = useState<{name: string, content: string} | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genAspectRatio, setGenAspectRatio] = useState("16:9");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPredictingRisk, setIsPredictingRisk] = useState(false);

  const [activeTab, setActiveTab] = useState<'orders' | 'config'>('orders');

  // Bulk Edit State
  const [rowSelection, setRowSelection] = useState({});
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<{ type: 'status' | 'priority', value: string } | null>(null);

  // Company Config State
  const [companyConfigs, setCompanyConfigs] = useState<CompanyConfig[]>([]);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CompanyConfig | null>(null);
  const [configFormData, setConfigFormData] = useState<Partial<CompanyConfig>>({});

  const filteredOrders = React.useMemo(() => {
    return orders.filter(o => {
      if (aiFilterIds) return aiFilterIds.includes(o.id!);
      return o.po_number.toLowerCase().includes(search.toLowerCase()) ||
             o.company_name.toLowerCase().includes(search.toLowerCase()) ||
             o.part_name.toLowerCase().includes(search.toLowerCase());
    });
  }, [orders, aiFilterIds, search]);

  // Table State
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([
    'select',
    'createdAt',
    'delivery_date',
    'po_number',
    'company_name',
    'part_name',
    'progress',
    'status',
    'priority',
    'actions'
  ]);

  const columnHelper = createColumnHelper<WorkOrder>();

  const columns = React.useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <div className="px-1">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        </div>
      ),
    }),
    columnHelper.accessor('createdAt', {
      id: 'createdAt',
      header: 'Fecha Orden',
      cell: info => <span className="text-zinc-400 text-xs">{format(info.getValue(), 'dd/MM/yyyy')}</span>,
    }),
    columnHelper.accessor('delivery_date', {
      id: 'delivery_date',
      header: 'Fecha Entrega',
      cell: info => {
        const date = info.getValue();
        if (!date) return <span className="text-zinc-600 italic text-xs">No asignada</span>;
        const isOverdue = date < new Date() && info.row.original.status !== 'quality';
        return (
          <span className={`text-xs font-bold ${isOverdue ? 'text-red-400' : 'text-zinc-400'}`}>
            {format(date, 'dd/MM/yyyy')}
          </span>
        );
      },
    }),
    columnHelper.accessor('po_number', {
      id: 'po_number',
      header: 'Número de PO',
      cell: info => <span className="font-bold text-white">{formatPONumber(info.getValue())}</span>,
    }),
    columnHelper.accessor('company_name', {
      id: 'company_name',
      header: 'Cliente',
      cell: info => <span className="text-zinc-300">{info.getValue()}</span>,
    }),
    columnHelper.accessor('part_name', {
      id: 'part_name',
      header: 'Pieza',
      cell: info => <span className="text-zinc-300">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'progress',
      header: 'Progreso',
      cell: ({ row }) => {
        const order = row.original;
        const progress = Math.min(100, (order.quantity_completed / order.quantity_total) * 100);
        return (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden w-28 border border-white/5">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400 font-bold w-12">
              {order.quantity_completed}/{order.quantity_total}
            </span>
          </div>
        );
      },
    }),
    columnHelper.accessor('status', {
      id: 'status',
      header: 'Estado',
      cell: info => {
        const status = info.getValue();
        return (
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border
            ${status === 'production' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
              status === 'hold' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
              status === 'quality' ? 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20' : 
              'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}
          >
            {status === 'production' ? 'Producción' :
             status === 'hold' ? 'Pausa' :
             status === 'quality' ? 'Calidad' : 'Programado'}
          </span>
        );
      },
    }),
    columnHelper.accessor('priority', {
      id: 'priority',
      header: 'Prioridad',
      cell: info => {
        const priority = info.getValue();
        return (
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border
            ${priority === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)] animate-pulse' : 
              priority === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 
              priority === 'normal' ? 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20' : 
              'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
          >
            {priority === 'low' ? 'Baja' :
             priority === 'normal' ? 'Normal' :
             priority === 'high' ? 'Alta' : 'Crítica'}
          </span>
        );
      },
    }),
    columnHelper.display({
      id: 'actions',
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => {
        const order = row.original;
        return (
          <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => handleClientReport(order)}
              title="Redactar Actualización para Cliente"
              className="p-2.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-all"
            >
              <Mail className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleAnomalyDetection(order)}
              title="Analizar Historial"
              className="p-2.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all"
            >
              <Activity className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleOpenModal(order)}
              title="Editar Orden"
              className="p-2.5 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-xl transition-all"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => handleDelete(order.id!)}
              title="Eliminar Orden"
              className="p-2.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    }),
  ], []);

  const table = useReactTable({
    data: filteredOrders,
    columns,
    state: {
      columnOrder,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const hasSelection = selectedRows.length > 0;

  const handleBulkUpdate = async () => {
    if (!bulkAction || selectedRows.length === 0) return;

    try {
      const updates = selectedRows.map(row => {
        const orderId = row.original.id!;
        const updateData = bulkAction.type === 'status' 
          ? { status: bulkAction.value as Status }
          : { priority: bulkAction.value as Priority };
        return updateWorkOrder(orderId, updateData);
      });

      await Promise.all(updates);
      setRowSelection({});
      setIsBulkModalOpen(false);
      setBulkAction(null);
    } catch (error) {
      console.error("Error in bulk update:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToWorkOrders(setOrders);
    const unsubscribeConfigs = subscribeToCompanyConfigs(setCompanyConfigs);
    return () => {
      unsubscribe();
      unsubscribeConfigs();
    };
  }, []);

  const handleConfigSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configFormData.company_name || !configFormData.delivery_schedule) {
      console.warn("Missing required fields for company config");
      return;
    }

    try {
      // Clean data to only include allowed fields for firestore rules
      const cleanData = {
        company_name: configFormData.company_name,
        delivery_schedule: configFormData.delivery_schedule
      };

      if (editingConfig?.id) {
        await updateCompanyConfig(editingConfig.id, cleanData);
      } else {
        await createCompanyConfig(cleanData);
      }
      setIsConfigModalOpen(false);
      setEditingConfig(null);
      setConfigFormData({});
    } catch (error) {
      console.error("Error saving company config", error);
    }
  };

  const handleConfigDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este horario?')) {
      try {
        await deleteCompanyConfig(id);
      } catch (error) {
        console.error("Error deleting company config", error);
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setAiModalContent({ title: 'Analizando Archivo...', content: 'Por favor espere mientras la IA extrae las órdenes de trabajo...' });
    
    try {
      let fileContent = '';
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        fileContent = XLSX.utils.sheet_to_csv(worksheet);
      } else {
        fileContent = await file.text();
      }

      // Limit to first 100 lines to prevent massive payloads and timeouts
      const lines = fileContent.split('\n');
      let wasTruncated = false;
      if (lines.length > 100) {
        fileContent = lines.slice(0, 100).join('\n');
        wasTruncated = true;
      }

      const extractedOrders = await extractOrdersFromFile(fileContent);
      
      if (extractedOrders && extractedOrders.length > 0) {
        let addedCount = 0;
        for (const order of extractedOrders) {
          try {
            await createWorkOrder({
              po_number: order.po_number || `PO-${Math.floor(Math.random() * 10000)}`,
              company_name: order.company_name || 'Desconocido',
              part_name: order.part_name || 'Pieza Desconocida',
              quantity_total: Number(order.quantity_total) || 100,
              quantity_completed: Number(order.quantity_completed) || 0,
              priority: ['low', 'normal', 'high', 'critical'].includes(order.priority) ? order.priority : 'normal',
              status: ['scheduled', 'production', 'quality', 'hold'].includes(order.status) ? order.status : 'scheduled',
              createdAt: order.createdAt ? new Date(order.createdAt) : undefined,
              delivery_date: order.delivery_date ? new Date(order.delivery_date) : undefined
            });
            addedCount++;
          } catch (err) {
            console.error("Error adding extracted order", err);
          }
        }
        
        let successMessage = `Se han importado ${addedCount} órdenes de trabajo correctamente.`;
        if (wasTruncated) {
          successMessage += `\n\nNota: El archivo era muy grande. Solo se procesaron las primeras 100 filas para garantizar la velocidad.`;
        }
        setAiModalContent({ title: 'Éxito', content: successMessage });
      } else {
        setAiModalContent({ title: 'Advertencia', content: 'No se encontraron órdenes de trabajo válidas en el archivo.' });
      }
    } catch (error) {
      console.error("Error procesando archivo", error);
      setAiModalContent({ title: 'Error', content: 'Hubo un error al procesar el archivo.' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleNLSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery) {
      setAiFilterIds(null);
      return;
    }
    setIsSearching(true);
    try {
      const ids = await filterOrdersByNaturalLanguage(nlQuery, orders);
      setAiFilterIds(ids);
    } catch (error) {
      console.error("Error en la búsqueda con IA", error);
    }
    setIsSearching(false);
  };

  const handleClearNLSearch = () => {
    setNlQuery('');
    setAiFilterIds(null);
  };

  const handleClientReport = async (order: WorkOrder) => {
    setAiModalContent({ title: 'Generando...', content: 'Por favor espere mientras la IA redacta el informe...' });
    try {
      const report = await generateClientReport(order);
      setAiModalContent({ title: `Actualización para Cliente: ${order.company_name}`, content: report });
    } catch (e) {
      setAiModalContent({ title: 'Error', content: 'Error al generar el informe.' });
    }
  };

  const handleAnomalyDetection = async (order: WorkOrder) => {
    setAiModalContent({ title: 'Analizando...', content: 'Por favor espere mientras la IA analiza el historial...' });
    try {
      const history = await getWorkOrderHistory(order.id!);
      const analysis = await analyzeOrderAnomalies(order, history);
      setAiModalContent({ title: `Análisis de IA: ${order.po_number}`, content: analysis });
    } catch (e) {
      setAiModalContent({ title: 'Error', content: 'Error al analizar anomalías.' });
    }
  };

  const handleExport = () => {
    const exportData = filteredOrders.map(order => ({
      'Número de PO': order.po_number,
      'Cliente': order.company_name,
      'Pieza': order.part_name,
      'Cantidad Objetivo': order.quantity_total,
      'Cantidad Completada': order.quantity_completed,
      'Progreso %': Math.round((order.quantity_completed / order.quantity_total) * 100) + '%',
      'Estado': order.status === 'production' ? 'Producción' :
                order.status === 'hold' ? 'Pausa' :
                order.status === 'quality' ? 'Calidad' : 'Programado',
      'Prioridad': order.priority === 'low' ? 'Baja' :
                   order.priority === 'normal' ? 'Normal' :
                   order.priority === 'high' ? 'Alta' : 'Crítica',
      'Creado En': format(order.createdAt, 'yyyy-MM-dd HH:mm'),
      'Actualizado En': format(order.updatedAt, 'yyyy-MM-dd HH:mm')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Style the header row
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_cell({ r: 0, c: C });
      if (!ws[address]) continue;
      ws[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F46E5" } }
      };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Órdenes de Trabajo");
    XLSX.writeFile(wb, `OrdenesDeTrabajo_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleOpenModal = (order?: WorkOrder) => {
    if (order) {
      setEditingOrder(order);
      setFormData(order);
    } else {
      setEditingOrder(null);
      setFormData({
        company_name: '',
        po_number: '',
        part_name: '',
        quantity_total: 100,
        quantity_completed: 0,
        priority: 'normal',
        status: 'scheduled'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedData = {
        ...formData,
        po_number: formData.po_number ? formatPONumber(formData.po_number) : '',
      };

      if (editingOrder && editingOrder.id) {
        await updateWorkOrder(editingOrder.id, formattedData);
      } else {
        await createWorkOrder(formattedData as any);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error al guardar la orden:", error);
      alert("Error al guardar la orden. Revise la consola para más detalles.");
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Está seguro de que desea eliminar esta orden de trabajo?")) {
      try {
        await deleteWorkOrder(id);
      } catch (error) {
        console.error("Error al eliminar la orden:", error);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setAnalysisImage(reader.result as string);
          setAnalysisFile(null);
          setAnalysisResult(null);
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setAnalysisFile({ name: file.name, content: reader.result as string });
          setAnalysisImage(null);
          setAnalysisResult(null);
        };
        reader.readAsText(file);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!analysisImage && !analysisFile) return;
    setIsAnalyzing(true);
    try {
      if (analysisImage) {
        const base64 = analysisImage.split(',')[1];
        const mimeType = analysisImage.split(';')[0].split(':')[1];
        const result = await analyzeImage(base64, mimeType, "Analiza esta pieza o situación en la fábrica.");
        setAnalysisResult(result);
      } else if (analysisFile) {
        const result = await extractOrdersFromFile(analysisFile.content);
        setAnalysisResult(`Archivo "${analysisFile.name}" analizado. Se encontraron ${result.length} órdenes potenciales.`);
      }
    } catch (e) {
      console.error("Error al analizar", e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateVisualAid = async () => {
    if (!genPrompt) return;
    setIsGenerating(true);
    try {
      const img = await generateVisualAid(genPrompt, genAspectRatio);
      setGeneratedImage(img);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePredictRisk = async () => {
    if (!editingOrder?.id) return;
    setIsPredictingRisk(true);
    try {
      const history = await getWorkOrderHistory(editingOrder.id);
      const risk = await predictOrderRisk(editingOrder, history);
      setAiModalContent({
        title: 'Análisis Predictivo de Riesgo',
        content: `**Nivel de Riesgo:** ${risk.risk_level.toUpperCase()}\n\n**Problema Detectado:** ${risk.issue}\n\n**Sugerencia:** ${risk.suggestion}`
      });
    } catch (e) {
      console.error("Error al predecir riesgo", e);
    } finally {
      setIsPredictingRisk(false);
    }
  };

  const handleBulkStatusChange = async (newStatus: Status) => {
    setIsUploading(true);
    // ...
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative overflow-hidden font-sans">
      {/* Vibrant Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="p-8 max-w-7xl mx-auto relative z-10">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight">
              Panel de Administración
            </h1>
            <p className="text-zinc-400 mt-2 font-medium">Gestionar el cronograma y las operaciones de producción.</p>
          </div>
          <div className="flex gap-4 items-center">
            <AnimatePresence>
              {hasSelection && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-4 py-2"
                >
                  <span className="text-sm font-bold text-indigo-400">
                    {selectedRows.length} seleccionados
                  </span>
                  <div className="w-px h-4 bg-indigo-500/20 mx-2" />
                  <button
                    onClick={() => setIsBulkModalOpen(true)}
                    className="flex items-center gap-2 text-sm font-bold text-white hover:text-indigo-300 transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Acciones Masivas
                  </button>
                  <button
                    onClick={() => setRowSelection({})}
                    className="p-1 hover:bg-indigo-500/20 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-indigo-400" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <button 
              onClick={() => handleOpenModal()}
              className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)]"
            >
              <Plus className="w-5 h-5" />
              Nueva Orden
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-zinc-900/40 p-1.5 rounded-2xl border border-white/5 w-fit">
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'orders' 
                ? 'bg-white/10 text-white shadow-lg' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            Órdenes de Trabajo
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'config' 
                ? 'bg-white/10 text-white shadow-lg' 
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            Configuración & IA
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'orders' ? (
            <motion.div
              key="orders-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-zinc-900/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 overflow-hidden">
                <div className="p-5 border-b border-white/10 bg-zinc-950/30 flex gap-4 flex-col md:flex-row">
                  <div className="relative flex-1">
                    <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input 
                      type="text"
                      placeholder="Buscar PO, Cliente o Pieza..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 rounded-2xl bg-zinc-950/50 border border-white/5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 transition-all"
                    />
                  </div>
                  <form onSubmit={handleNLSearch} className="relative flex-1 flex gap-3">
                    <div className="relative flex-1">
                      <Sparkles className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-indigo-400" />
                      <input 
                        type="text"
                        placeholder="Pedir a la IA que filtre (ej. 'órdenes críticas')"
                        value={nlQuery}
                        onChange={(e) => setNlQuery(e.target.value)}
                        className="w-full pl-12 pr-12 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-100 placeholder-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                      />
                      {aiFilterIds && (
                        <button 
                          type="button"
                          onClick={handleClearNLSearch}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-300 bg-indigo-500/20 p-1 rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button 
                      type="submit"
                      disabled={isSearching || !nlQuery}
                      className="px-6 py-3 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-2xl font-bold hover:bg-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSearching ? '...' : 'Filtrar'}
                    </button>
                  </form>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-separate border-spacing-0">
                    <thead className="bg-zinc-950/50 text-zinc-400 font-semibold border-b border-white/10">
                      {table.getHeaderGroups().map(headerGroup => (
                        <Reorder.Group
                          as="tr"
                          key={headerGroup.id}
                          axis="x"
                          values={columnOrder}
                          onReorder={setColumnOrder}
                          className="contents"
                        >
                          {headerGroup.headers.map(header => (
                            <Reorder.Item
                              as="th"
                              key={header.id}
                              value={header.id}
                              className="px-6 py-5 cursor-grab active:cursor-grabbing select-none hover:bg-white/5 transition-colors first:rounded-tl-2xl last:rounded-tr-2xl"
                            >
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-3 h-3 text-zinc-600" />
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext()
                                )}
                              </div>
                            </Reorder.Item>
                          ))}
                        </Reorder.Group>
                      ))}
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      <AnimatePresence>
                        {table.getRowModel().rows.length === 0 ? (
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <td colSpan={table.getVisibleFlatColumns().length} className="px-6 py-24 text-center">
                              <div className="flex flex-col items-center justify-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-zinc-900/50 flex items-center justify-center border border-white/5">
                                  <Package className="w-8 h-8 text-zinc-600" />
                                </div>
                                <div>
                                  <h3 className="text-lg font-bold text-zinc-300">No hay órdenes</h3>
                                  <p className="text-zinc-500 text-sm mt-1">No se encontraron órdenes de trabajo que coincidan con tu búsqueda.</p>
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        ) : (
                          table.getRowModel().rows.map(row => {
                            const order = row.original;
                            const isOverdue = order.delivery_date && 
                                             order.delivery_date < new Date() && 
                                             order.status !== 'quality';

                            return (
                              <motion.tr 
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                key={row.id} 
                                className={`hover:bg-white/[0.02] transition-all duration-300 group relative ${
                                  isOverdue ? 'bg-red-500/5' : ''
                                }`}
                              >
                                {row.getVisibleCells().map(cell => (
                                  <td 
                                    key={cell.id} 
                                    className={`px-6 py-5 transition-all duration-300 ${
                                      isOverdue 
                                        ? 'border-y border-red-500/20 first:border-l first:rounded-l-2xl last:border-r last:rounded-r-2xl shadow-[0_0_15px_rgba(239,68,68,0.05)]' 
                                        : 'border-y border-transparent'
                                    }`}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                ))}
                              </motion.tr>
                            );
                          })
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="config-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {/* AI Tools Section */}
              <div className="bg-zinc-900/60 backdrop-blur-xl rounded-3xl p-8 border border-white/10 flex flex-col gap-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="p-3 bg-indigo-500/20 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Herramientas de IA</h3>
                    <p className="text-zinc-500 text-sm">Potencia tu productividad con IA</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => setShowAnalysis(true)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 p-6 rounded-2xl font-medium flex items-center gap-4 transition-all group"
                >
                  <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
                    <Camera className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Análisis de Fábrica</div>
                    <div className="text-zinc-500 text-xs">Analiza fotos o archivos de control</div>
                  </div>
                </button>

                <button 
                  onClick={() => setShowGeneration(true)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 p-6 rounded-2xl font-medium flex items-center gap-4 transition-all group"
                >
                  <div className="p-3 bg-fuchsia-500/20 rounded-xl group-hover:bg-fuchsia-500/30 transition-colors">
                    <ImageIcon className="w-6 h-6 text-fuchsia-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Generar Ayuda Visual</div>
                    <div className="text-zinc-500 text-xs">Crea carteles y guías con IA</div>
                  </div>
                </button>
              </div>

              {/* Data Tools Section */}
              <div className="bg-zinc-900/60 backdrop-blur-xl rounded-3xl p-8 border border-white/10 flex flex-col gap-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="p-3 bg-emerald-500/20 rounded-2xl">
                    <Activity className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Gestión de Datos</h3>
                    <p className="text-zinc-500 text-sm">Importar y exportar información</p>
                  </div>
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".csv, .xlsx, .xls, .txt" 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 p-6 rounded-2xl font-medium flex items-center gap-4 transition-all group disabled:opacity-50"
                >
                  <div className="p-3 bg-emerald-500/20 rounded-xl group-hover:bg-emerald-500/30 transition-colors">
                    <Upload className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">{isUploading ? 'Procesando...' : 'Importar Órdenes'}</div>
                    <div className="text-zinc-500 text-xs">Cargar desde Excel, CSV o TXT</div>
                  </div>
                </button>

                <button 
                  onClick={handleExport}
                  className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 p-6 rounded-2xl font-medium flex items-center gap-4 transition-all group"
                >
                  <div className="p-3 bg-white/10 rounded-xl group-hover:bg-white/20 transition-colors">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold">Exportar a Excel</div>
                    <div className="text-zinc-500 text-xs">Descargar base de datos actual</div>
                  </div>
                </button>
              </div>

              {/* Delivery Schedules Section */}
              <div className="bg-zinc-900/60 backdrop-blur-xl rounded-3xl p-8 border border-white/10 flex flex-col gap-6 lg:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-2xl">
                      <Clock className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Horarios de Entrega</h3>
                      <p className="text-zinc-500 text-sm">Configuración por empresa</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingConfig(null);
                      setConfigFormData({});
                      setIsConfigModalOpen(true);
                    }}
                    className="p-2 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition-all"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {companyConfigs.length === 0 ? (
                    <div className="text-center py-8 text-zinc-600 italic">
                      No hay horarios configurados
                    </div>
                  ) : (
                    companyConfigs.map(config => (
                      <div key={config.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 group hover:border-blue-500/30 transition-all">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-bold text-white">{config.company_name}</h4>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                setEditingConfig(config);
                                setConfigFormData(config);
                                setIsConfigModalOpen(true);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-blue-400 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => handleConfigDelete(config.id!)}
                              className="p-1.5 text-zinc-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-400">{config.delivery_schedule}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Company Config Modal */}
        <AnimatePresence>
          {isConfigModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsConfigModalOpen(false)}
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold text-white">
                      {editingConfig ? 'Editar Horario' : 'Nuevo Horario'}
                    </h2>
                    <button onClick={() => setIsConfigModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                      <X className="w-6 h-6 text-zinc-400" />
                    </button>
                  </div>

                  <form onSubmit={handleConfigSave} className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2">Empresa</label>
                      <select 
                        required
                        value={configFormData.company_name || ''}
                        onChange={e => setConfigFormData({...configFormData, company_name: e.target.value})}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all appearance-none cursor-pointer"
                      >
                        <option value="" disabled>Seleccionar empresa...</option>
                        {uniqueCompanies.map(company => (
                          <option key={company} value={company}>{company}</option>
                        ))}
                        {editingConfig && !uniqueCompanies.includes(editingConfig.company_name) && (
                          <option value={editingConfig.company_name}>{editingConfig.company_name}</option>
                        )}
                      </select>
                      {uniqueCompanies.length === 0 && (
                        <p className="mt-2 text-xs text-amber-400/70 italic">
                          * No hay empresas registradas en las órdenes de trabajo.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-2">Horario de Entrega</label>
                      <textarea 
                        required
                        value={configFormData.delivery_schedule || ''}
                        onChange={e => setConfigFormData({...configFormData, delivery_schedule: e.target.value})}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all min-h-[100px]"
                        placeholder="Ej: Lunes a Viernes: 08:00 - 17:00"
                      />
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button 
                        type="button"
                        onClick={() => setIsConfigModalOpen(false)}
                        className="flex-1 px-6 py-3 border border-white/5 rounded-xl font-bold text-zinc-400 hover:bg-white/5 transition-all"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                      >
                        {editingConfig ? 'Actualizar' : 'Crear'}
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 bg-zinc-950/50">
              <h2 className="text-2xl font-bold text-white">
                {editingOrder ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-8">
              <div className="grid grid-cols-2 gap-6 mb-8">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Número de PO</label>
                  <input 
                    required
                    type="text"
                    value={formData.po_number || ''}
                    onChange={e => setFormData({...formData, po_number: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Empresa Cliente</label>
                  <input 
                    required
                    type="text"
                    value={formData.company_name || ''}
                    onChange={e => setFormData({...formData, company_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Nombre de Pieza</label>
                  <input 
                    required
                    type="text"
                    value={formData.part_name || ''}
                    onChange={e => setFormData({...formData, part_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Cantidad Objetivo</label>
                  <input 
                    required
                    type="number"
                    min="1"
                    value={formData.quantity_total || ''}
                    onChange={e => setFormData({...formData, quantity_total: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Cantidad Completada</label>
                  <input 
                    required
                    type="number"
                    min="0"
                    max={formData.quantity_total}
                    value={formData.quantity_completed || 0}
                    onChange={e => setFormData({...formData, quantity_completed: parseInt(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Estado</label>
                  <select 
                    value={formData.status || 'scheduled'}
                    onChange={e => setFormData({...formData, status: e.target.value as Status})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none"
                  >
                    <option value="scheduled">Programado</option>
                    <option value="production">En Producción</option>
                    <option value="quality">Control de Calidad</option>
                    <option value="hold">En Pausa</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Prioridad</label>
                  <select 
                    value={formData.priority || 'normal'}
                    onChange={e => setFormData({...formData, priority: e.target.value as Priority})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none"
                  >
                    <option value="low">Baja</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="critical">Crítica</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Fecha de la Orden</label>
                  <input 
                    type="datetime-local"
                    value={formData.createdAt ? format(formData.createdAt, "yyyy-MM-dd'T'HH:mm") : ''}
                    onChange={e => setFormData({...formData, createdAt: new Date(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">Fecha de Entrega Prometida</label>
                  <input 
                    type="date"
                    value={formData.delivery_date ? format(formData.delivery_date, "yyyy-MM-dd") : ''}
                    onChange={e => setFormData({...formData, delivery_date: new Date(e.target.value)})}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-4 pt-6 border-t border-white/5">
                {editingOrder && (
                  <button 
                    type="button"
                    onClick={handlePredictRisk}
                    disabled={isPredictingRisk}
                    className="mr-auto px-6 py-3 rounded-xl font-bold text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                  >
                    {isPredictingRisk ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                    Analizar Riesgo
                  </button>
                )}
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="bg-gradient-to-r from-indigo-500 to-fuchsia-500 hover:from-indigo-400 hover:to-fuchsia-400 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                >
                  <Save className="w-5 h-5" />
                  Guardar Orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {aiModalContent && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-900 border border-indigo-500/30 rounded-3xl shadow-[0_0_50px_rgba(99,102,241,0.15)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center p-6 border-b border-white/5 bg-indigo-500/10">
              <h2 className="text-xl font-bold text-indigo-300 flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-indigo-400" />
                {aiModalContent.title}
              </h2>
              <button 
                onClick={() => setAiModalContent(null)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto prose prose-invert prose-indigo max-w-none text-sm text-zinc-300">
              <ReactMarkdown>{aiModalContent.content}</ReactMarkdown>
            </div>
            
            <div className="p-6 border-t border-white/5 bg-zinc-950/50 flex justify-end">
              <button 
                onClick={() => setAiModalContent(null)}
                className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-white hover:bg-white/10 transition-colors shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-bold text-white">Acciones Masivas</h2>
                  <button onClick={() => setIsBulkModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X className="w-6 h-6 text-zinc-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
                      Cambiar Estado a:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['scheduled', 'production', 'hold', 'quality'] as Status[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => setBulkAction({ type: 'status', value: status })}
                          className={`px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider border transition-all ${
                            bulkAction?.type === 'status' && bulkAction.value === status
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                              : 'bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {status === 'production' ? 'Producción' :
                           status === 'hold' ? 'Pausa' :
                           status === 'quality' ? 'Calidad' : 'Programado'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <label className="block text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">
                      Cambiar Prioridad a:
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['low', 'normal', 'high', 'critical'] as Priority[]).map((priority) => (
                        <button
                          key={priority}
                          onClick={() => setBulkAction({ type: 'priority', value: priority })}
                          className={`px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider border transition-all ${
                            bulkAction?.type === 'priority' && bulkAction.value === priority
                              ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                              : 'bg-zinc-800 border-white/5 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {priority === 'low' ? 'Baja' :
                           priority === 'normal' ? 'Normal' :
                           priority === 'high' ? 'Alta' : 'Crítica'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 flex gap-3">
                    <button
                      onClick={() => setIsBulkModalOpen(false)}
                      className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleBulkUpdate}
                      disabled={!bulkAction}
                      className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20"
                    >
                      Aplicar a {selectedRows.length}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Analysis Modal */}
      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-zinc-900/50">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                  <Camera className="w-6 h-6 text-emerald-400" />
                  Análisis de Fábrica por IA
                </h2>
                <button onClick={() => setShowAnalysis(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5 space-y-6">
                  <div className="aspect-video bg-black/40 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center relative overflow-hidden group">
                    {analysisImage ? (
                      <>
                        <img src={analysisImage} className="w-full h-full object-contain" />
                        <button 
                          onClick={() => setAnalysisImage(null)}
                          className="absolute top-4 right-4 p-2 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : analysisFile ? (
                      <div className="flex flex-col items-center gap-4 p-8 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                          <Upload className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-white font-bold">{analysisFile.name}</p>
                          <p className="text-zinc-500 text-xs mt-1">Archivo de texto/datos listo para análisis</p>
                        </div>
                        <button 
                          onClick={() => setAnalysisFile(null)}
                          className="text-red-400 text-xs font-bold hover:underline"
                        >
                          Quitar Archivo
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-4 p-8 text-center">
                        <Upload className="w-12 h-12 text-zinc-600" />
                        <div>
                          <p className="text-zinc-400 font-bold">Sube una foto o archivo para analizar</p>
                          <p className="text-zinc-600 text-sm mt-1">Control de calidad, piezas o datos de órdenes</p>
                        </div>
                        <input type="file" accept="image/*,.txt,.csv" className="hidden" onChange={handleImageUpload} />
                      </label>
                    )}
                  </div>
                  
                  <button
                    onClick={handleAnalyze}
                    disabled={(!analysisImage && !analysisFile) || isAnalyzing}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3"
                  >
                    {isAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
                    {isAnalyzing ? 'Analizando...' : 'Iniciar Análisis'}
                  </button>
                </div>
                
                <div className="lg:col-span-7 bg-black/20 rounded-2xl p-6 border border-white/5 overflow-y-auto min-h-[300px]">
                  {analysisResult ? (
                    <div className="prose prose-invert prose-emerald max-w-none">
                      <ReactMarkdown>{analysisResult}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center italic">
                      <Sparkles className="w-12 h-12 opacity-20 mb-4" />
                      <p>Sube contenido y presiona analizar para ver los resultados de la IA</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generation Modal */}
      <AnimatePresence>
        {showGeneration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-zinc-900/50">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                  <ImageIcon className="w-6 h-6 text-indigo-400" />
                  Generador de Ayudas Visuales
                </h2>
                <button onClick={() => setShowGeneration(false)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                  <div>
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-2 block">Descripción de la Ayuda</label>
                    <textarea
                      value={genPrompt}
                      onChange={(e) => setGenPrompt(e.target.value)}
                      placeholder="Ej: Cartel de seguridad para uso de montacargas en zona de carga..."
                      className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-4 text-white placeholder:text-zinc-700 focus:border-indigo-500/50 outline-none transition-all resize-none"
                    />
                  </div>
                  
                  <div>
                    <label className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3 block">Relación de Aspecto</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"].map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setGenAspectRatio(ratio)}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            genAspectRatio === ratio 
                              ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' 
                              : 'bg-black/40 border-white/5 text-zinc-500 hover:border-white/20'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <button
                    onClick={handleGenerateVisualAid}
                    disabled={isGenerating || !genPrompt.trim()}
                    className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-3"
                  >
                    {isGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
                    {isGenerating ? 'Generando...' : 'Generar Imagen'}
                  </button>
                </div>
                
                <div className="lg:col-span-8 bg-black/20 rounded-2xl border border-white/5 flex items-center justify-center relative overflow-hidden min-h-[400px]">
                  {generatedImage ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4">
                      <img src={generatedImage} className="max-w-full max-h-full rounded-xl shadow-2xl" />
                      <a 
                        href={generatedImage} 
                        download="visual-aid.png"
                        className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-all"
                      >
                        Descargar Imagen
                      </a>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 text-zinc-600 text-center italic">
                      <ImageIcon className="w-16 h-16 opacity-20" />
                      <p>Describe una ayuda visual y presiona generar</p>
                    </div>
                  )}
                  {isGenerating && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                      <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
                      <p className="text-indigo-400 font-black uppercase tracking-widest animate-pulse">Creando Visual...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
