import React from 'react';
import { Compass, Layers, Users, ScrollText, Settings } from 'lucide-react';
import { NavigationTab } from '../types/launcher';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const primaryNav: { id: NavigationTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'HOME', icon: <Compass className="nav-icon" size={17} /> },
    { id: 'instances', label: 'INSTANCES', icon: <Layers className="nav-icon" size={17} /> },
    { id: 'mods', label: 'MODS', icon: <ScrollText className="nav-icon" size={17} /> },
    { id: 'accounts', label: 'ACCOUNTS', icon: <Users className="nav-icon" size={17} /> },
  ];

  return (
    <aside className="app-sidebar">
      {/* Brand Header: Emblem & VOLUME title */}
      <div className="sidebar-brand-block">
        <div className="sidebar-emblem-frame">
          <Compass size={22} strokeWidth={2.4} />
        </div>
        <div className="sidebar-brand-text">
          <span className="brand-title">VOLUME</span>
          <span className="brand-sub">LAUNCHER</span>
        </div>
      </div>

      {/* Carved Wood Divider */}
      <div className="sidebar-carved-divider"></div>

      {/* Primary Navigation Items */}
      <nav className="sidebar-nav-group">
        {primaryNav.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`sidebar-nav-tab ${isActive ? 'active' : ''}`}
              title={item.label}
              aria-label={item.label}
            >
              <span className="nav-tab-indicator"></span>
              {item.icon}
              <span className="nav-tab-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer pushing settings to bottom */}
      <div className="sidebar-nav-spacer"></div>

      {/* Carved Wood Divider before Settings */}
      <div className="sidebar-carved-divider"></div>

      {/* Settings Tab */}
      <div className="sidebar-bottom-group">
        <button
          onClick={() => onSelectTab('settings')}
          className={`sidebar-nav-tab ${currentTab === 'settings' ? 'active' : ''}`}
          title="SETTINGS"
          aria-label="SETTINGS"
        >
          <span className="nav-tab-indicator"></span>
          <Settings className="nav-icon" size={17} />
          <span className="nav-tab-label">SETTINGS</span>
        </button>
      </div>
    </aside>
  );
};
