import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Wraps the app and offers a one-tap reset that wipes the news cache and
// reloads. Anything else the boundary catches surfaces as a friendly
// message instead of the white-screen-of-death the legacy app used to show.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      console.error('VGL error caught:', error, info);
    } catch {
      /* logging itself shouldn't crash the boundary */
    }
  }

  reset = (): void => {
    try {
      localStorage.removeItem('vgl.news.v1');
      localStorage.removeItem('vgl.news.v2');
    } catch {
      /* storage might be disabled — reload anyway */
    }
    location.reload();
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-ink-950 text-zinc-100">
          <div className="max-w-sm text-center">
            <div className="text-4xl mb-3">🎮</div>
            <h2 className="serif text-[26px] mb-2">Something went wrong</h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-5">
              {String(this.state.error.message || this.state.error).slice(0, 220)}
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="px-4 py-2 rounded-full bg-white text-ink-950 text-sm font-medium"
            >
              Reset news cache &amp; reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
