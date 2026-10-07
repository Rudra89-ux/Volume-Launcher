import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[VolumeLauncher ErrorBoundary] Uncaught React exception:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100%',
            height: '100%',
            width: '100%',
            padding: '32px',
            boxSizing: 'border-box',
            background: 'radial-gradient(ellipse at center, rgba(42, 26, 15, 0.85) 0%, rgba(20, 12, 6, 0.96) 100%)',
            color: '#FAF4E8',
            fontFamily: 'var(--font-body, system-ui, sans-serif)',
          }}
        >
          <div
            style={{
              maxWidth: '560px',
              width: '100%',
              background: '#FAF4E8',
              border: '2px solid #5C3A21',
              borderRadius: '8px',
              padding: '28px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
              color: '#2A1A0F',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '6px',
                  background: '#B86F52',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FAF4E8',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-heading, Cinzel, serif)',
                    fontSize: '18px',
                    fontWeight: 800,
                    letterSpacing: '1px',
                    color: '#2A1A0F',
                  }}
                >
                  VOLUME LAUNCHER
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#746454', fontWeight: 600 }}>
                  {this.props.fallbackTitle || 'Something went wrong while loading this section.'}
                </p>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: '#5E4E3D', lineHeight: 1.5 }}>
              An unexpected interface error occurred. Volume Launcher's safety boundary prevented an application crash.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: '#2A1A0F',
                  border: '1px solid #7C5C36',
                  borderRadius: '4px',
                  padding: '12px',
                  fontSize: '11px',
                  fontFamily: 'Consolas, monospace',
                  color: '#CA7F62',
                  overflowX: 'auto',
                  maxHeight: '120px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                <strong>Error:</strong> {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  background: '#526B45',
                  color: '#FAF4E8',
                  border: '1.5px solid #788B55',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={14} />
                <span>RETRY</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  background: '#4A3319',
                  color: '#FAF4E8',
                  border: '1.5px solid #7C5C36',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={14} />
                <span>RELOAD LAUNCHER</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
