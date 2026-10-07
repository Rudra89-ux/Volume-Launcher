import React from 'react';
import { X, Terminal } from 'lucide-react';
import { MinecraftVersion, LaunchState } from '../types/launcher';

interface LaunchConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: string[];
  launchState: LaunchState;
  activeVersion: MinecraftVersion;
  activeInstanceName?: string;
  onClearLogs: () => void;
}

export const LaunchConsoleModal: React.FC<LaunchConsoleModalProps> = ({
  isOpen,
  onClose,
  logs,
  launchState,
  activeVersion,
  activeInstanceName,
  onClearLogs,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-journal-dialog"
        style={{ maxWidth: '640px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-journal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Terminal size={18} color="#C8A878" />
            <h3 className="modal-journal-title">Minecraft Launch Console</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#DCCCB0', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-journal-body">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#EAE0CD',
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #B8A58A',
              fontSize: '12px',
            }}
          >
            <span>
              Target: <strong>{activeVersion.name}</strong> • Instance: <strong>{activeInstanceName || 'Default Instance'}</strong>
            </span>
            <span style={{ color: '#526B45', fontWeight: 700 }}>
              Status: {launchState.toUpperCase()}
            </span>
          </div>

          <div className="launch-log-box">
            {logs.length === 0 ? (
              <div style={{ color: '#746454', fontStyle: 'italic', padding: '8px' }}>
                No active execution entries recorded yet. Hit [ PLAY ] to launch Minecraft.
              </div>
            ) : (
              logs.map((log, index) => {
                const isSuccess = log.includes('[SUCCESS]') || log.includes('Ready');
                const isWarn = log.includes('[WARN]');
                const className = isSuccess
                  ? 'log-line-success'
                  : isWarn
                  ? 'log-line-warn'
                  : 'log-line-info';
                return (
                  <div key={index} className={className}>
                    {log}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-journal-footer">
          <button onClick={onClearLogs} className="btn-secondary-wood" style={{ marginRight: 'auto' }}>
            Clear Log
          </button>
          <button onClick={onClose} className="btn-primary-forest" style={{ padding: '8px 18px' }}>
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
