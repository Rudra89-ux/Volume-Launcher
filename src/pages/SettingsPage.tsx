import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Gamepad2, 
  Cpu, 
  Palette, 
  Info, 
  FolderOpen, 
  Check, 
  Layers,
  RefreshCw,
  Archive,
  Heart,
} from 'lucide-react';
import { LauncherSettings } from '../types/launcher';
import { JavaInfo, tauriService } from '../services/tauri';

interface SettingsPageProps {
  settings: LauncherSettings;
  onUpdateSettings: (newSettings: LauncherSettings) => void;
  detectedJava?: JavaInfo | null;
  onRescanJava?: () => void;
}

type SettingsSection = 'GENERAL' | 'MINECRAFT' | 'JAVA' | 'APPEARANCE' | 'BACKUPS' | 'ABOUT';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  onUpdateSettings,
  detectedJava,
  onRescanJava,
}) => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('JAVA');
  const [savedNotice, setSavedNotice] = useState(false);

  const update = <K extends keyof LauncherSettings>(key: K, value: LauncherSettings[K]) => {
    const updated = { ...settings, [key]: value };
    onUpdateSettings(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="desktop-page-container">
      {/* Header Row */}
      <div className="archive-toolbar">
        <div className="archive-title-block">
          <h2 className="archive-main-title">CONFIGURATION JOURNAL</h2>
          <span className="archive-main-desc">
            Fine-tune Java memory allocation, game launch parameters, and launcher acoustics.
          </span>
        </div>

        {savedNotice && (
          <div className="journal-saved-pill">
            <Check size={13} strokeWidth={2.5} />
            <span>Journal Saved</span>
          </div>
        )}
      </div>

      {/* Settings Desktop Layout */}
      <div className="settings-journal-split">
        {/* Left: Section Selection Rail */}
        <div className="settings-section-rail">
          <button
            onClick={() => setActiveSection('JAVA')}
            className={`settings-rail-tab ${activeSection === 'JAVA' ? 'active' : ''}`}
          >
            <Cpu size={15} />
            <span>JAVA RUNTIME</span>
          </button>

          <button
            onClick={() => setActiveSection('MINECRAFT')}
            className={`settings-rail-tab ${activeSection === 'MINECRAFT' ? 'active' : ''}`}
          >
            <Gamepad2 size={15} />
            <span>MINECRAFT</span>
          </button>

          <button
            onClick={() => setActiveSection('GENERAL')}
            className={`settings-rail-tab ${activeSection === 'GENERAL' ? 'active' : ''}`}
          >
            <SettingsIcon size={15} />
            <span>GENERAL</span>
          </button>

          <button
            onClick={() => setActiveSection('APPEARANCE')}
            className={`settings-rail-tab ${activeSection === 'APPEARANCE' ? 'active' : ''}`}
          >
            <Palette size={15} />
            <span>APPEARANCE</span>
          </button>

          <button
            onClick={() => setActiveSection('BACKUPS')}
            className={`settings-rail-tab ${activeSection === 'BACKUPS' ? 'active' : ''}`}
          >
            <Archive size={15} />
            <span>LOCAL BACKUPS</span>
          </button>

          <button
            onClick={() => setActiveSection('ABOUT')}
            className={`settings-rail-tab ${activeSection === 'ABOUT' ? 'active' : ''}`}
          >
            <Info size={15} />
            <span>ABOUT</span>
          </button>
        </div>

        {/* Right: Horizontal Settings Ledger Panel (NO floating card grids!) */}
        <div className="settings-ledger-panel">
          {/* ====================================================================
              SECTION: JAVA & MEMORY ALLOCATION
              ==================================================================== */}
          {activeSection === 'JAVA' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">JAVA RUNTIME ENVIRONMENT</span>
              </div>
              <div className="ledger-divider"></div>

              {/* Row 1: Java Runtime Version */}
              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Java Runtime</span>
                  <span className="row-desc">JVM binary verified for Minecraft 1.20+ and 1.21+ compatibility.</span>
                </div>
                <div className="ledger-row-value">
                  <span className="ledger-val-highlight">
                    {detectedJava ? `Java ${detectedJava.major_version} (${detectedJava.version})` : settings.javaVersion}
                  </span>
                </div>
              </div>
              <div className="ledger-divider"></div>

              {/* Row 2: Executable Path */}
              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Executable Path</span>
                  <span className="row-desc">Location of the javaw.exe binary invoked on launch.</span>
                </div>
                <div className="ledger-row-value">
                  <span className="ledger-mono-path">
                    {detectedJava?.path || settings.javaExecutablePath || 'No JVM detected'}
                  </span>
                </div>
              </div>
              <div className="ledger-divider"></div>

              {/* Row 3: Status & Rescan */}
              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Verification Status</span>
                  <span className="row-desc">Evaluates system PATH, Program Files, Adoptium, and Zulu runtimes.</span>
                </div>
                <div className="ledger-row-value row-action-cluster">
                  <span className={`ledger-status-tag ${detectedJava?.is_valid !== false ? 'valid' : 'invalid'}`}>
                    {detectedJava?.is_valid !== false ? '✓ Verified Compatible' : '✕ Incompatible JVM'}
                  </span>
                  {onRescanJava && (
                    <button onClick={onRescanJava} className="btn-secondary-wood ledger-btn-sm" title="Rescan system Java">
                      <RefreshCw size={12} />
                      <span>Rescan</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="ledger-divider"></div>

              {/* SECTION: RAM ALLOCATION */}
              <div className="ledger-section-header" style={{ marginTop: '28px' }}>
                <span className="ledger-header-title">MEMORY ALLOCATION (RAM)</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Dedicated RAM</span>
                  <span className="row-desc">Dedicated heap for chunk meshing, entity processing, and survival shaders.</span>
                </div>
                <div className="ledger-row-value ledger-slider-cluster">
                  <input
                    type="range"
                    min="2"
                    max={settings.maxRamGb}
                    step="1"
                    value={settings.allocatedRamGb}
                    onChange={(e) => update('allocatedRamGb', Number(e.target.value))}
                    className="ledger-range-slider"
                  />
                  <span className="ledger-slider-badge">{settings.allocatedRamGb} GB</span>
                </div>
              </div>
              <div className="ledger-divider"></div>

              {/* Row 5: GC Flags */}
              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">JVM Garbage Collection Flags</span>
                  <span className="row-desc">Aikar's optimized G1GC parameters are injected automatically.</span>
                </div>
                <div className="ledger-row-value">
                  <span className="ledger-flag-badge">G1GC Optimized</span>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              SECTION: MINECRAFT
              ==================================================================== */}
          {activeSection === 'MINECRAFT' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">MINECRAFT GAME CONFIGURATION</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Game Directory</span>
                  <span className="row-desc">Primary storage location for saves, screenshots, and game assets.</span>
                </div>
                <div className="ledger-row-value row-action-cluster">
                  <span className="ledger-mono-path" style={{ maxWidth: '300px' }}>
                    {settings.gameDirectory}
                  </span>
                  <button
                    onClick={async () => {
                      const selected = await tauriService.pickDirectory(settings.gameDirectory);
                      if (selected) {
                        update('gameDirectory', selected);
                      }
                    }}
                    className="btn-secondary-wood ledger-btn-sm"
                    title="Browse and select game directory"
                  >
                    <FolderOpen size={13} />
                    <span>Browse</span>
                  </button>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Window Resolution</span>
                  <span className="row-desc">Default window dimensions when starting a new game session.</span>
                </div>
                <div className="ledger-row-value">
                  <select
                    className="parchment-select"
                    value={`${settings.resolutionWidth}x${settings.resolutionHeight}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      update('resolutionWidth', w);
                      update('resolutionHeight', h);
                    }}
                  >
                    <option value="1280x720">1280 × 720 (720p - Recommended Default)</option>
                    <option value="1920x1080">1920 × 1080 (1080p Standard)</option>
                    <option value="1600x900">1600 × 900 (HD+)</option>
                    <option value="1024x768">1024 × 768 (XGA 4:3)</option>
                    <option value="854x480">854 × 480 (480p Compact)</option>
                    <option value="2560x1440">2560 × 1440 (2K QHD)</option>
                  </select>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">In-Game GUI Scale</span>
                  <span className="row-desc">Controls Minecraft in-game HUD scale written to options.txt (prevents extreme zoom).</span>
                </div>
                <div className="ledger-row-value">
                  <select
                    className="parchment-select"
                    value={settings.guiScale ?? 3}
                    onChange={(e) => update('guiScale', Number(e.target.value))}
                  >
                    <option value={3}>Large (Scale 3 - Recommended Default)</option>
                    <option value={2}>Normal (Scale 2)</option>
                    <option value={1}>Small (Scale 1)</option>
                    <option value={4}>Very Large (Scale 4)</option>
                    <option value={0}>Auto (Dynamic Minecraft Calculation)</option>
                  </select>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Launch in Fullscreen</span>
                  <span className="row-desc">Engage borderless exclusive fullscreen mode immediately on launch.</span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.fullscreen}
                      onChange={(e) => update('fullscreen', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Volume Profile Integration</span>
                  <span className="row-desc">
                    Enable Volume Companion mod to render custom offline skins and nameplate badges in-game. Disable for pure vanilla/Fabric launches.
                  </span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.enableVolumeProfileIntegration ?? true}
                      onChange={(e) => update('enableVolumeProfileIntegration', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              SECTION: GENERAL
              ==================================================================== */}
          {activeSection === 'GENERAL' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">GENERAL EXPLORER PREFERENCES</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Check for Launcher Updates</span>
                  <span className="row-desc">Verify journal patches and Mojang engine manifests on startup.</span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.checkUpdates}
                      onChange={(e) => update('checkUpdates', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Close Launcher on Game Start</span>
                  <span className="row-desc">Conserve system memory by gracefully closing the launcher once Minecraft boots.</span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.closeLauncherOnStart}
                      onChange={(e) => update('closeLauncherOnStart', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Explorer Sound Effects</span>
                  <span className="row-desc">Play tactile wood clicks when switching tabs and interacting with controls.</span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.soundEffects}
                      onChange={(e) => update('soundEffects', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Discord Rich Presence</span>
                  <span className="row-desc">Broadcast your current Minecraft version and gameplay to friends.</span>
                </div>
                <div className="ledger-row-value">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.enableDiscordRPC}
                      onChange={(e) => update('enableDiscordRPC', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              SECTION: APPEARANCE
              ==================================================================== */}
          {activeSection === 'APPEARANCE' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">JOURNAL VISUAL IDENTITY</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Visual Identity</span>
                  <span className="row-desc">Warm sandstone base, weathered wood rails, and forest green indicators.</span>
                </div>
                <div className="ledger-row-value">
                  <div className="ledger-theme-chip">
                    <span className="theme-color-dot"></span>
                    <span>Earthy Minecraft Journal</span>
                  </div>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Interface Scale</span>
                  <span className="row-desc">Adjust parchment typography scale and control padding density.</span>
                </div>
                <div className="ledger-row-value">
                  <select
                    className="parchment-select"
                    value={settings.uiScale}
                    onChange={(e) => update('uiScale', e.target.value as any)}
                  >
                    <option value="auto">Auto (Native DPI)</option>
                    <option value="small">Compact (Small)</option>
                    <option value="medium">Standard (Medium)</option>
                    <option value="large">Spacious (Large)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              SECTION: LOCAL BACKUPS & DATA INTEGRITY (100% LOCAL-FIRST)
              ==================================================================== */}
          {activeSection === 'BACKUPS' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">LOCAL WORLD ARCHIVES & DATA INTEGRITY</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Storage Architecture</span>
                  <span className="row-desc">
                    Volume Launcher operates on a strict 100% local-first paradigm. Zero cloud servers, zero telemetry, and complete data sovereignty.
                  </span>
                </div>
                <div className="ledger-row-value">
                  <div
                    className="ledger-theme-chip"
                    style={{
                      background: '#E0E8DC',
                      borderColor: '#526B45',
                    }}
                  >
                    <span
                      className="theme-color-dot"
                      style={{ background: '#526B45' }}
                    ></span>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '11px',
                        color: '#3F5938',
                      }}
                    >
                      100% LOCAL-FIRST
                    </span>
                  </div>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Account Identity Format</span>
                  <span className="row-desc">
                    Offline accounts use deterministic UUID keys (<code>offline:&lt;uuid&gt;</code>) matching Mojang offline specifications.
                  </span>
                </div>
                <div className="ledger-row-value">
                  <span className="spec-badge">Deterministic Offline UUID</span>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">World Archive & Integrity</span>
                  <span className="row-desc">
                    Instance saves are packaged into portable <code>.vworld</code> ZIP archives with SHA-256 integrity checksums and path-traversal safety checks.
                  </span>
                </div>
                <div className="ledger-row-value">
                  <span className="spec-badge">SHA-256 Verified .vworld</span>
                </div>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-row">
                <div className="ledger-row-label">
                  <span className="row-title">Save Corruption Protection</span>
                  <span className="row-desc">
                    Local worlds are protected with automatic timestamped snapshots (<code>&lt;world&gt;.backup_&lt;timestamp&gt;</code>). File operations are rejected while Minecraft is actively running.
                  </span>
                </div>
                <div className="ledger-row-value">
                  <span className="spec-badge">Automated Timestamped Backups</span>
                </div>
              </div>
            </div>
          )}

          {/* ====================================================================
              SECTION: ABOUT
              ==================================================================== */}
          {activeSection === 'ABOUT' && (
            <div className="ledger-section">
              <div className="ledger-section-header">
                <span className="ledger-header-title">ABOUT VOLUME LAUNCHER</span>
              </div>
              <div className="ledger-divider"></div>

              <div className="ledger-about-block">
                <div className="about-identity-row">
                  <div className="about-emblem-box">
                    <Layers size={22} />
                  </div>
                  <div>
                    <h3 className="about-title">Volume Launcher v1.0.0</h3>
                    <p className="about-tagline">"An old explorer's Minecraft journal redesigned as a modern desktop launcher."</p>
                    <p style={{ marginTop: '4px', fontSize: '12px', fontWeight: 700, color: '#B86F52', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Heart size={13} fill="#B86F52" /> Made with passion by Rudra
                    </p>
                  </div>
                </div>

                <p className="about-description">
                  Built natively on Rust and Tauri v2 with a high-performance streaming download engine,
                  dynamic Mojang version manifest integration, isolated instance environments, and complete local-first data ownership.
                </p>

                <div className="about-specs-grid">
                  <div className="spec-badge">Developer: Rudra</div>
                  <div className="spec-badge">Architecture: x86_64 Windows Tauri v2</div>
                  <div className="spec-badge">Backend Engine: Tokio + Reqwest</div>
                  <div className="spec-badge">UI: React 19 + TypeScript + Vite</div>
                  <div className="spec-badge">Local Persistence: Active (Local JSON & Filesystem)</div>
                  <div className="spec-badge">Integrity: SHA-256 Verified Local Archives</div>
                  <div className="spec-badge">Cloud Dependency: None (100% Local-First)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
