import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Si cambia mientras hay error, el boundary se reinicia y vuelve a intentar pintar. */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      let errorMessage = "Algo salió mal.";
      let details = "";

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = `Error de Firestore: ${parsed.error}`;
            details = `Operación: ${parsed.operationType} en ${parsed.path}`;
          }
        }
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-dvh bg-background flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-card border border-destructive/30 p-8 rounded-3xl shadow-overlay">
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-destructive" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Error del Sistema</h1>
            <p className="text-muted-foreground mb-4">{errorMessage}</p>
            {details && <p className="text-xs text-muted-foreground mb-6 font-mono">{details}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full cursor-pointer py-3 bg-secondary hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 text-foreground font-bold rounded-xl transition-all"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
