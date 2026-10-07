import React, { useState, useEffect, useRef } from 'react';
import { 
  Compass, 
  Minus, 
  Square, 
  Copy, 
  X, 
  ChevronDown, 
  Check, 
  UserPlus, 
  Users 
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../services/tauri';
import { OfflineAccount } from '../types/launcher';
import { ExplorerAvatar } from './ExplorerAvatar';

interface HeaderProps {
  selectedAccount?: OfflineAccount | null;
  accounts?: OfflineAccount[];
  onSelectAccount?: (accountId: string) => Promise<void> | void;
  onNavigateToAccounts?: () => void;
  isMinecraftRunning?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  selectedAccount,
  accounts = [],
  onSelectAccount,
  onNavigateToAccounts,
  isMinecraftRunning = false,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});

    // Listen to resize events to update maximized state icon
    const unlistenPromise = appWindow.onResized(async () => {
      try {
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      } catch {}
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleMinimize = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTauri()) {
      try {
        await getCurrentWindow().minimize();
      } catch (err) {
        console.error('Failed to minimize window:', err);
      }
    }
  };

  const handleMaximize = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTauri()) {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.toggleMaximize();
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      } catch (err) {
        console.error('Failed to toggle maximize window:', err);
      }
    }
  };

  const handleClose = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTauri()) {
      try {
        await getCurrentWindow().close();
      } catch (err) {
        console.error('Failed to close window:', err);
      }
    }
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail > 1) return;
    if (isTauri()) {
      try {
        await getCurrentWindow().startDragging();
      } catch (err) {
        console.debug('Failed to start dragging window:', err);
      }
    }
  };

  const handleTitleBarDoubleClick = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.win-btn, .titlebar-account-wrapper, button, input, a')) {
      return;
    }
    await handleMaximize(e);
  };

  const activeUsername = selectedAccount?.username || 'DevExplorer';

  return (
    <header className="app-titlebar" onDoubleClick={handleTitleBarDoubleClick}>
      {/* Left: Brand / Emblem & Title */}
      <div className="titlebar-left" data-tauri-drag-region onMouseDown={handleDragStart}>
        <div className="titlebar-emblem" title="Volume Launcher Navigation Compass">
          <Compass size={13} strokeWidth={2.4} />
        </div>
        <span className="titlebar-title">VOLUME</span>
        <span className="titlebar-separator">•</span>
        <span className="titlebar-subtitle">Minecraft Launcher</span>
      </div>

      {/* Center Draggable Spacer */}
      <div className="titlebar-center-drag" data-tauri-drag-region onMouseDown={handleDragStart}></div>

      {/* Right: User Indicator & Native Window Controls */}
      <div className="titlebar-right" onMouseDown={(e) => e.stopPropagation()}>
        {/* Quick Account Switcher Dropdown */}
        <div className="titlebar-account-wrapper" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            onMouseDown={(e) => e.stopPropagation()}
            className="titlebar-profile-chip"
            title={`Active Account: ${activeUsername} (Offline). Click to switch account.`}
          >
            <ExplorerAvatar
              username={activeUsername}
              uuid={selectedAccount?.uuid}
              avatarType={selectedAccount?.avatarType}
              avatarPath={selectedAccount?.avatarPath}
              profileIcon={selectedAccount?.profileIcon}
              size={18}
            />
            <span className="user-status-dot"></span>
            <span className="user-name">{activeUsername}</span>
            <ChevronDown size={11} className={`profile-chevron ${isDropdownOpen ? 'rotated' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="titlebar-account-dropdown">
              <div className="dropdown-account-header">
                <span className="dropdown-header-title">ACCOUNTS</span>
                <span className="dropdown-header-mode">Offline Mode</span>
              </div>

              <div className="dropdown-account-list">
                {accounts.map((acc) => {
                  const isSelected = selectedAccount?.id === acc.id;
                  return (
                    <button
                      key={acc.id}
                      onClick={() => {
                        if (!isSelected && onSelectAccount && !isMinecraftRunning) {
                          onSelectAccount(acc.id);
                        }
                        setIsDropdownOpen(false);
                      }}
                      disabled={isMinecraftRunning}
                      className={`dropdown-account-item ${isSelected ? 'active' : ''}`}
                      title={
                        isMinecraftRunning
                          ? 'Cannot switch while Minecraft is running'
                          : `Switch to ${acc.username}`
                      }
                    >
                      <ExplorerAvatar
                        username={acc.username}
                        uuid={acc.uuid}
                        avatarType={acc.avatarType}
                        avatarPath={acc.avatarPath}
                        profileIcon={acc.profileIcon}
                        size={22}
                      />
                      <div className="dropdown-account-meta">
                        <span className="dropdown-account-name">{acc.username}</span>
                        <span className="dropdown-account-uuid">
                          {acc.uuid.slice(0, 8)}...{acc.uuid.slice(-4)}
                        </span>
                      </div>
                      {isSelected && (
                        <Check size={14} className="dropdown-account-check" color="#788B55" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="dropdown-account-footer">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onNavigateToAccounts?.();
                  }}
                  className="dropdown-footer-action"
                >
                  <UserPlus size={13} />
                  <span>Add Account</span>
                </button>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    onNavigateToAccounts?.();
                  }}
                  className="dropdown-footer-action secondary"
                >
                  <Users size={13} />
                  <span>Manage Accounts...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Window Control Buttons */}
        <div className="titlebar-window-controls" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={handleMinimize}
            onMouseDown={(e) => e.stopPropagation()}
            className="win-btn win-btn-minimize"
            title="Minimize"
            aria-label="Minimize"
          >
            <Minus size={13} strokeWidth={2} />
          </button>

          <button
            onClick={handleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            className="win-btn win-btn-maximize"
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Copy size={11} strokeWidth={2} /> : <Square size={11} strokeWidth={2} />}
          </button>

          <button
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="win-btn win-btn-close"
            title="Close"
            aria-label="Close"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
};
