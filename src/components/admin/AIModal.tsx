/**
 * Modal para mostrar resultados de IA (reportes, análisis) en markdown.
 * content === null significa "cargando".
 */
import ReactMarkdown from 'react-markdown';
import { Copy, Loader2, Mail } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

interface AIModalProps {
  title: string;
  content: string | null;
  isEmailDraft?: boolean;
  onClose: () => void;
}

export default function AIModal({ title, content, isEmailDraft = false, onClose }: AIModalProps) {
  const copyDraft = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
  };

  const mailto = content ? `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(content)}` : undefined;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="custom-scrollbar max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
        </DialogHeader>
        {content === null ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" /> Generando…
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
        {isEmailDraft && content && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={() => { void copyDraft(); }}><Copy /> Copiar</Button>
            <Button asChild><a href={mailto}><Mail /> Abrir correo</a></Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
