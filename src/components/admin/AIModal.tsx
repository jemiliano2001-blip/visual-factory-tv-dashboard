/**
 * Modal para mostrar resultados de IA (reportes, análisis) en markdown.
 * content === null significa "cargando".
 */
import ReactMarkdown from 'react-markdown';
import { X, Loader2 } from 'lucide-react';

interface AIModalProps {
  title: string;
  content: string | null;
  onClose: () => void;
}

export default function AIModal({ title, content, onClose }: AIModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        {content === null ? (
          <div className="flex items-center justify-center gap-3 text-zinc-400 py-10">
            <Loader2 className="w-5 h-5 animate-spin" /> Generando…
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
