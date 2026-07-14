/**
 * TabErrorBoundary — isolates a runtime error in one tab so the rest of the
 * workspace (header, mini-player, other tabs) keeps working. Shows a plain
 * French message with a retry button; never leaks stack traces to the UI.
 */

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

interface Props {
  /** Changing this key forces the boundary to remount fresh state. */
  resetKey?: string;
  children: ReactNode;
}
interface State { error: Error | null }

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    try {
      reportLovableError(error, { boundary: "mixorder_tab" });
    } catch { /* ignore */ }
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated/40 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-primary/80" />
        <p className="mb-1 font-display text-sm font-semibold">
          Cet écran n'a pas pu s'afficher
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          Vos données restent intactes. Réessayez ou changez d'onglet.
        </p>
        <button
          onClick={this.handleRetry}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
        >
          <RotateCw className="h-3.5 w-3.5" /> Réessayer
        </button>
      </div>
    );
  }
}
