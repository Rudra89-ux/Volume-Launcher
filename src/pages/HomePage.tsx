import React from 'react';
import { Play, Sparkles, Box, Compass, Cpu, ArrowUpRight, BookOpen, User, Layers } from 'lucide-react';
import { MinecraftVersion, Instance, LaunchState, OfflineAccount } from '../types/launcher';
import { EXPEDITION_NEWS } from '../data/mockData';

interface HomePageProps {
  selectedVersion: MinecraftVersion;
  instances: Instance[];
  selectedInstance: Instance | null;
  onSelectInstance: (instanceId: string) => void;
  onLaunch: () => void;
  launchState: LaunchState;
  onNavigateToVersions: () => void;
  detectedJavaLabel?: string;
  selectedAccount?: OfflineAccount | null;
  onNavigateToAccounts?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  selectedVersion,
  instances = [],
  selectedInstance = null,
  onSelectInstance,
  onLaunch,
  launchState = 'idle',
  onNavigateToVersions,
  detectedJavaLabel,
  selectedAccount,
  onNavigateToAccounts,
}) => {
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
  return (
    <div className="home-workspace">
      {/* ====================================================================
          IMMERSIVE HERO SCENE (PRIMARY DESKTOP VISUAL ANCHOR: 55-65% HEIGHT)
          ==================================================================== */}
      <section className="home-hero-scene">
        {/* Full-bleed Minecraft Landscape */}
        <img
          src="/hero-landscape.jpg"
          alt="Cinematic Minecraft Mountain Forest Landscape"
          className="hero-scene-image"
        />

        {/* Environmental sunlight and valley fog gradient */}
        <div className="hero-scene-gradient"></div>

        {/* Subtle Handcrafted Parchment Command Panel */}
        <div className="hero-parchment-plaque">
          <div className="plaque-badge">
            <Sparkles size={11} />
            <span>MINECRAFT CLIENT</span>
          </div>

          <h1 className="plaque-title">VOLUME LAUNCHER</h1>
          <p className="plaque-subtitle">"Your Minecraft adventure starts here."</p>

          <div className="plaque-specs-grid">
            <div
              className="plaque-spec-item"
              onClick={onNavigateToAccounts}
              style={{ cursor: onNavigateToAccounts ? 'pointer' : 'default' }}
              title="Click to manage accounts"
            >
              <User size={13} color="#B86F52" />
              <span>Account: <strong>{selectedAccount?.username || 'OfflinePlayer'}</strong> <small style={{ opacity: 0.75 }}>(Offline)</small></span>
            </div>
            <div className="plaque-spec-item">
              <Compass size={13} color="#526B45" />
              <span>Version: <strong>{version.name}</strong></span>
            </div>
            <div className="plaque-spec-item">
              <Layers size={13} color="#788B55" />
              <span>Instance: <strong>{selectedInstance?.name || 'Default Instance'}</strong></span>
            </div>
            <div className="plaque-spec-item">
              <Cpu size={13} color="#C8A878" />
              <span>Runtime: <strong>{detectedJavaLabel || 'Java 21'}</strong></span>
            </div>
          </div>

          <div className="plaque-actions-row">
            <button
              onClick={onLaunch}
              className={`plaque-play-btn ${launchState === 'running' ? 'running' : ''}`}
              title="Launch Minecraft"
            >
              <Play size={16} fill="#FAF4E8" strokeWidth={1.5} />
              <span>
                {launchState === 'idle'
                  ? (version.installed ? 'PLAY' : 'INSTALL & PLAY')
                  : launchState === 'running'
                  ? 'RUNNING'
                  : 'PREPARING...'}
              </span>
            </button>

            <button
              onClick={onNavigateToVersions}
              className="plaque-secondary-btn"
              title="Browse official Minecraft versions"
            >
              <span>Versions</span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================================
          UNIFIED APPLICATION WORKSPACE ZONE: INSTANCES & NEWS
          ==================================================================== */}
      <section className="home-lower-strip">
        {/* LEFT ZONE: Instances Horizontal Ledger */}
        <div className="home-ledger-zone">
          <div className="zone-header">
            <div className="zone-title-group">
              <Box size={14} color="#526B45" />
              <h3 className="zone-title">INSTANCES & PROFILES</h3>
            </div>
            <span className="zone-subtitle">{instances.length || 1} Configured</span>
          </div>

          <div className="home-expeditions-row">
            {instances.length === 0 ? (
              <div className="home-camp-card active-camp">
                <div className="camp-card-header">
                  <span className="camp-name">Default Vanilla</span>
                  <span className="camp-mode">VANILLA</span>
                </div>
                <div className="camp-biome">Standard Minecraft Profile</div>
                <div className="camp-meta">
                  <span>{version.name}</span>
                  <span>•</span>
                  <span>Ready to Play</span>
                </div>
              </div>
            ) : (
              instances.slice(0, 3).map((inst) => {
                const isSelected = selectedInstance?.id === inst.id;
                return (
                  <div
                    key={inst.id}
                    onClick={() => onSelectInstance(inst.id)}
                    className={`home-camp-card ${isSelected ? 'active-camp' : ''}`}
                    title={`Click to select instance "${inst.name}"`}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="camp-card-header">
                      <span className="camp-name">{inst.name}</span>
                      <span className="camp-mode">{inst.loader.toUpperCase()}</span>
                    </div>
                    <div className="camp-biome">Version: {inst.versionId}</div>
                    <div className="camp-meta">
                      <span>{inst.fabricVersion ? `Fabric ${inst.fabricVersion}` : 'Vanilla Profile'}</span>
                      <span>•</span>
                      <span>{isSelected ? 'Active' : 'Select'}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT ZONE: News & Updates Ticker */}
        <div className="home-chronicle-zone">
          <div className="zone-header">
            <div className="zone-title-group">
              <BookOpen size={14} color="#788B55" />
              <h3 className="zone-title">NEWS & UPDATES</h3>
            </div>
            <span className="zone-subtitle">Mojang & Community</span>
          </div>

          <div className="home-notes-list">
            {EXPEDITION_NEWS.slice(0, 2).map((item) => (
              <div key={item.id} className="home-note-item">
                <div className="note-item-top">
                  <span className="note-tag">{item.tag}</span>
                  <span className="note-date">{item.date}</span>
                </div>
                <h4 className="note-title">{item.title}</h4>
                <p className="note-summary">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
