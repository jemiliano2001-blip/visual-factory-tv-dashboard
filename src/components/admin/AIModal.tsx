/**
 * Modal para mostrar resultados de IA (reportes, análisis) en markdown.
 * content === null significa "cargando".
 */
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface AIModalProps {
  title: string;
  content: string | null;
  onClose: () => void;
}

export default function AIModal({ title, content, onClose }: AIModalProps) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="custom-scrollbar max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
        </DialogHeader>
        {content === null ? (
          <div className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Generando…
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
