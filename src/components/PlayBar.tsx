import React, { useState } from 'react';
import { Play, Square, Terminal, ChevronDown, Loader2, AlertCircle, Cpu, HardDrive } from 'lucide-react';
import { LaunchState, MinecraftVersion, Instance, OfflineAccount } from '../types/launcher';
import { ExplorerAvatar } from './ExplorerAvatar';

interface PlayBarProps {
  selectedVersion: MinecraftVersion;
  instances: Instance[];
  selectedInstance: Instance | null;
  onSelectInstance: (instanceId: string) => void;
  launchState: LaunchState;
  detectedJavaLabel: string;
  allocatedRamGb: number;
  onLaunch: () => void;
  onStop: () => void;
  onOpenLogs: () => void;
  selectedAccount?: OfflineAccount | null;
  onNavigateToAccounts?: () => void;
}

export const PlayBar: React.FC<PlayBarProps> = ({
  selectedVersion,
  instances = [],
  selectedInstance = null,
  onSelectInstance,
  launchState = 'idle',
  detectedJavaLabel = 'Java 21',
  allocatedRamGb = 4,
  onLaunch,
  onStop,
  onOpenLogs,
  selectedAccount,
  onNavigateToAccounts,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const version = selectedVersion || {
    id: '1.21.1',
    name: 'Minecraft 1.21.1',
    type: 'release',
    typeLabel: 'Vanilla',
    installed: true,
    releaseDate: 'August 2024',
    size: '~500 MB',
    description: 'Official Minecraft release',
  };

  const isBusy =
    launchState === 'checking' ||
    launchState === 'downloading' ||
    launchState === 'verifying' ||
    launchState === 'preparing' ||
    launchState === 'launching' ||
    launchState === 'stopping';

  const isRunning = launchState === 'running';

  // Format status tag label
  const getStatusLabel = () => {
    switch (launchState) {
      case 'downloading':
        return 'DOWNLOADING';
      case 'verifying':
        return 'VERIFYING';
      case 'preparing':
        return 'PREPARING';
      case 'launching':
        return 'LAUNCHING';
      case 'running':
        return 'RUNNING';
      case 'stopping':
        return 'STOPPING';
      case 'error':
        return 'ERROR';
      default:
        return version.installed ? 'READY' : 'NEEDS INSTALL';
    }
  };

  const statusLabel = getStatusLabel();

  return (
    <footer className="launch-dock">
      {/* LEFT: Minecraft Engine Icon, Version & Instance Selector */}
      <div className="dock-left-cluster">
        {/* Version Badge */}
        <div className="dock-version-chip" title={`Selected version: ${version.name}${selectedInstance ? ` (${selectedInstance.name})` : ''}`}>
          <div className="dock-cube-icon">◈</div>
          <div className="dock-version-meta">
            <span className="dock-version-name">{version.name}</span>
            <span className="dock-version-type">{selectedInstance ? selectedInstance.name : (version.typeLabel || version.type)}</span>
          </div>
        </div>

        {/* Instance Selector Dropdown */}
        <div className="dock-expedition-dropdown-wrap">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="dock-expedition-btn"
            title="Click to select active instance"
          >
            <div className="dock-expedition-text">
              <span className="dock-expedition-label">Instance</span>
              <span className="dock-expedition-name">{selectedInstance ? selectedInstance.name : 'Default Instance'}</span>
            </div>
            <ChevronDown size={14} className="dock-dropdown-chevron" />
          </button>

          {dropdownOpen && (
            <div className="dock-dropdown-menu">
              <div className="dock-dropdown-header">Select Instance</div>
              <div className="dock-dropdown-list">
                {instances.length === 0 ? (
                  <div className="dock-dropdown-item active">
                    <div className="dropdown-item-top">
                      <span className="dropdown-item-name">Default Instance</span>
                      <span className="dropdown-item-badge">Vanilla</span>
                    </div>
                    <span className="dropdown-item-sub">Standard Minecraft</span>
                  </div>
                ) : (
                  instances.map((inst) => (
                    <div
                      key={inst.id}
                      onClick={() => {
                        onSelectInstance(inst.id);
                        setDropdownOpen(false);
                      }}
                      className={`dock-dropdown-item ${selectedInstance?.id === inst.id ? 'active' : ''}`}
                    >
                      <div className="dropdown-item-top">
                        <span className="dropdown-item-name">{inst.name}</span>
                        <span className="dropdown-item-badge">{inst.loader.toUpperCase()}</span>
                      </div>
                      <span className="dropdown-item-sub">Target Version: {inst.versionId}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Active Account Chip */}
        <div
          className="dock-account-chip"
          onClick={onNavigateToAccounts}
          title={`Active Account: ${selectedAccount?.username || 'DevExplorer'} (Offline Mode). Click to manage accounts.`}
          style={{ cursor: onNavigateToAccounts ? 'pointer' : 'default' }}
        >
          <ExplorerAvatar
            username={selectedAccount?.username || 'DevExplorer'}
            uuid={selectedAccount?.uuid}
            avatarType={selectedAccount?.avatarType}
            avatarPath={selectedAccount?.avatarPath}
            size={22}
          />
          <div className="dock-account-info">
            <span className="dock-account-label">Account</span>
            <span className="dock-account-name">{selectedAccount?.username || 'DevExplorer'}</span>
          </div>
        </div>
      </div>

      {/* MIDDLE: Hardware & Runtime Telemetry Cluster */}
      <div className="dock-middle-cluster">
        {/* Java Badge */}
        <div className="dock-telemetry-badge" title="Java Runtime">
          <Cpu size={13} color="#788B55" />
          <span>{detectedJavaLabel || 'Java 21'}</span>
        </div>

        {/* RAM Badge */}
        <div className="dock-telemetry-badge" title="Dedicated Memory">
          <HardDrive size={13} color="#C8A878" />
          <span>{allocatedRamGb} GB RAM</span>
        </div>

        {/* Engine Status Badge */}
        <div
          className={`dock-status-pill status-${launchState}`}
          title="Current Engine State"
        >
          <span className="dock-status-dot"></span>
          <span>{statusLabel}</span>
        </div>
      </div>

      {/* RIGHT: Console Log & Large PLAY CTA */}
      <div className="dock-right-cluster">
        {/* Game Log Button */}
        <button
          onClick={onOpenLogs}
          className="dock-btn-journal"
          title="Open Game Console Logs"
        >
          <Terminal size={14} />
          <span>GAME LOGS</span>
        </button>

        {/* Prominent Play / Stop Button */}
        {isRunning ? (
          <button
            onClick={onStop}
            className="dock-play-btn dock-btn-stop"
            title="Stop running Minecraft process"
          >
            <Square size={16} fill="#FAF4E8" strokeWidth={1} />
            <span>STOP</span>
          </button>
        ) : (
          <button
            onClick={onLaunch}
            disabled={isBusy}
            className={`dock-play-btn ${isBusy ? 'busy' : ''} ${launchState === 'error' ? 'error' : ''}`}
            title="Launch Minecraft"
          >
            {isBusy ? (
              <>
                <Loader2 size={18} className="spinning-icon" />
                <span>
                  {launchState === 'checking' && 'CHECKING...'}
                  {launchState === 'downloading' && 'DOWNLOADING...'}
                  {launchState === 'verifying' && 'VERIFYING...'}
                  {launchState === 'preparing' && 'PREPARING...'}
                  {launchState === 'launching' && 'LAUNCHING...'}
                  {launchState === 'stopping' && 'STOPPING...'}
                </span>
              </>
            ) : launchState === 'error' ? (
              <>
                <AlertCircle size={18} color="#CA7F62" />
                <span>RETRY PLAY</span>
              </>
            ) : (
              <>
                <Play size={18} fill="#FAF4E8" strokeWidth={1.5} />
                <span>{version.installed ? 'PLAY' : 'INSTALL & PLAY'}</span>
              </>
            )}
          </button>
        )}
      </div>
    </footer>
  );
};
