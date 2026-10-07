import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, 
  Search, 
  RefreshCw, 
  Trash2, 
  Box, 
  Download,
  Check,
  Compass,
  Layers,
  ArrowUpCircle,
  Package,
  FolderOpen,
  AlertTriangle,
  RotateCcw,
  UploadCloud
} from 'lucide-react';
import { Instance, LocalMod, ModrinthMod, ResourcePackItem, ModUpdateInfo } from '../types/launcher';
import { tauriService, isTauri } from '../services/tauri';

interface ModsPageProps {
  instances: Instance[];
  selectedInstance: Instance | null;
  onSelectInstance: (instanceId: string) => void;
}

export const ModsPage: React.FC<ModsPageProps> = ({
  instances = [],
  selectedInstance = null,
  onSelectInstance,
}) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'discover' | 'resourcepacks'>('installed');
  const [mods, setMods] = useState<LocalMod[]>([]);
  const [resourcePacks, setResourcePacks] = useState<ResourcePackItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Updates state
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [availableUpdates, setAvailableUpdates] = useState<ModUpdateInfo[]>([]);
  const [updatingProjectIds, setUpdatingProjectIds] = useState<Record<string, boolean>>({});

  // Discover state
  const [discoverSearch, setDiscoverSearch] = useState('');
  const [discoverMods, setDiscoverMods] = useState<ModrinthMod[]>([]);
  const [isSearchingDiscover, setIsSearchingDiscover] = useState(false);
  const [installingModId, setInstallingModId] = useState<string | null>(null);
  const [installedSuccessIds, setInstalledSuccessIds] = useState<Record<string, boolean>>({});

  // Resource Pack Discover state
  const [rpDiscoverSearch, setRpDiscoverSearch] = useState('');
  const [rpDiscoverPacks, setRpDiscoverPacks] = useState<ModrinthMod[]>([]);
  const [isSearchingRpDiscover, setIsSearchingRpDiscover] = useState(false);

  // Local mod drag & drop and browse state
  const [isDragging, setIsDragging] = useState(false);
  const [isInstallingLocal, setIsInstallingLocal] = useState(false);

  // Granular installation state per mod: 'downloading' | 'verifying' | 'installed' | 'error'
  const [modInstallProgress, setModInstallProgress] = useState<Record<string, 'downloading' | 'verifying' | 'installed' | 'error'>>({});
  const [modInstallError, setModInstallError] = useState<Record<string, string>>({});

  const loadMods = useCallback(async () => {
    if (!selectedInstance) return;
    setIsLoading(true);
    try {
      if (isTauri()) {
        const loadedMods = await tauriService.getInstanceMods(selectedInstance.id);
        setMods(loadedMods);
      }
    } catch (err: any) {
      console.warn('Failed to load mods:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedInstance]);

  const loadResourcePacks = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      if (isTauri()) {
        const loaded = await tauriService.listResourcepacks(selectedInstance.id);
        setResourcePacks(loaded);
      }
    } catch (err: any) {
      console.warn('Failed to load resource packs:', err);
    }
  }, [selectedInstance]);

  useEffect(() => {
    loadMods();
    loadResourcePacks();
    setAvailableUpdates([]);
  }, [loadMods, loadResourcePacks]);

  const handleToggle = async (mod: LocalMod) => {
    if (!selectedInstance) return;
    try {
      await tauriService.toggleMod(selectedInstance.id, mod.fileName);
      await loadMods();
    } catch (err: any) {
      setStatusMessage(`Error toggling mod: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleDelete = async (mod: LocalMod) => {
    if (!selectedInstance) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete ${mod.name} (${mod.fileName})?`);
    if (!confirmDelete) return;

    try {
      await tauriService.deleteMod(selectedInstance.id, mod.fileName);
      setMods((prev) => prev.filter((m) => m.fileName !== mod.fileName));
    } catch (err: any) {
      setStatusMessage(`Error deleting mod: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleCheckUpdates = async () => {
    if (!selectedInstance) return;
    setIsCheckingUpdates(true);
    try {
      const updates = await tauriService.checkModUpdates(
        selectedInstance.id,
        selectedInstance.loader === 'fabric' ? 'fabric' : 'vanilla',
        selectedInstance.versionId
      );
      setAvailableUpdates(updates);
      if (updates.length === 0) {
        setStatusMessage('All installed mods are up to date!');
      } else {
        setStatusMessage(`Found ${updates.length} mod update(s) available.`);
      }
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Failed to check updates: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const handleUpdateMod = async (update: ModUpdateInfo) => {
    if (!selectedInstance) return;
    try {
      setUpdatingProjectIds((prev) => ({ ...prev, [update.projectId]: true }));
      await tauriService.updateMod(
        selectedInstance.id,
        update.projectId,
        selectedInstance.loader === 'fabric' ? 'fabric' : 'vanilla',
        selectedInstance.versionId
      );
      setAvailableUpdates((prev) => prev.filter((u) => u.projectId !== update.projectId));
      await loadMods();
      setStatusMessage(`Successfully updated ${update.modName} to ${update.latestVersion}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage(`Failed to update ${update.modName}: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setUpdatingProjectIds((prev) => ({ ...prev, [update.projectId]: false }));
    }
  };

  const handleUpdateAll = async () => {
    if (!selectedInstance || availableUpdates.length === 0) return;
    for (const update of availableUpdates) {
      await handleUpdateMod(update);
    }
  };

  const handleOpenFolder = async () => {
    if (!selectedInstance) return;
    try {
      await tauriService.openModsFolder(selectedInstance.id);
    } catch (err: any) {
      setStatusMessage(`Failed to open folder: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleOpenRpFolder = async () => {
    if (!selectedInstance) return;
    try {
      await tauriService.openResourcepacksFolder(selectedInstance.id);
    } catch (err: any) {
      setStatusMessage(`Failed to open folder: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleSearchModrinth = async (queryOverride?: string) => {
    if (!selectedInstance) return;
    const q = queryOverride !== undefined ? queryOverride : discoverSearch;
    setIsSearchingDiscover(true);
    try {
      const results = await tauriService.searchModrinthMods(
        q,
        selectedInstance.loader === 'fabric' ? 'fabric' : undefined,
        selectedInstance.versionId,
        'mod'
      );
      setDiscoverMods(results);
    } catch (err: any) {
      setStatusMessage(`Modrinth search error: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setIsSearchingDiscover(false);
    }
  };

  const handleSearchRpDiscover = async (queryOverride?: string) => {
    if (!selectedInstance) return;
    const q = queryOverride !== undefined ? queryOverride : rpDiscoverSearch;
    setIsSearchingRpDiscover(true);
    try {
      const results = await tauriService.searchModrinthMods(
        q,
        undefined,
        selectedInstance.versionId,
        'resourcepack'
      );
      setRpDiscoverPacks(results);
    } catch (err: any) {
      setStatusMessage(`Modrinth resource pack search error: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setIsSearchingRpDiscover(false);
    }
  };

  const handleBrowseLocalMods = async () => {
    if (!selectedInstance) return;
    try {
      setIsInstallingLocal(true);
      const filePaths = await tauriService.pickJarFiles();
      if (!filePaths || filePaths.length === 0) return;

      const installed = await tauriService.installLocalMods(selectedInstance.id, filePaths);
      await loadMods();
      setStatusMessage(`Successfully installed ${installed.length} mod(s) into ${selectedInstance.name}`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Failed to install local mods: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsInstallingLocal(false);
    }
  };

  const handleDropFiles = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (!selectedInstance) return;

    const files = Array.from(e.dataTransfer.files);
    const jarPaths: string[] = [];
    for (const file of files) {
      const fullPath = (file as any).path;
      if (fullPath && fullPath.endsWith('.jar')) {
        jarPaths.push(fullPath);
      }
    }

    if (jarPaths.length === 0) {
      setStatusMessage('No valid .jar files detected. Please use the "Browse Mod JARs" button to select files.');
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    try {
      setIsInstallingLocal(true);
      const installed = await tauriService.installLocalMods(selectedInstance.id, jarPaths);
      await loadMods();
      setStatusMessage(`Successfully imported ${installed.length} mod(s) into ${selectedInstance.name}`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Failed to import mod JARs: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsInstallingLocal(false);
    }
  };

  const handleInstallMod = async (mod: ModrinthMod) => {
    if (!selectedInstance) return;
    try {
      setInstallingModId(mod.projectId);
      setModInstallProgress((prev) => ({ ...prev, [mod.projectId]: 'downloading' }));
      setModInstallError((prev) => ({ ...prev, [mod.projectId]: '' }));

      await tauriService.installModrinthMod(
        selectedInstance.id,
        mod.projectId,
        selectedInstance.loader === 'fabric' ? 'fabric' : 'vanilla',
        selectedInstance.versionId
      );

      setModInstallProgress((prev) => ({ ...prev, [mod.projectId]: 'verifying' }));
      await new Promise((r) => setTimeout(r, 200));

      setModInstallProgress((prev) => ({ ...prev, [mod.projectId]: 'installed' }));
      setInstalledSuccessIds((prev) => ({ ...prev, [mod.projectId]: true }));
      await loadMods();
      setStatusMessage(`Successfully installed ${mod.title} into ${selectedInstance.name}`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setModInstallProgress((prev) => ({ ...prev, [mod.projectId]: 'error' }));
      setModInstallError((prev) => ({ ...prev, [mod.projectId]: msg }));
      setStatusMessage(`Failed to install ${mod.title}: ${msg}`);
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setInstallingModId(null);
    }
  };

  const handleToggleRp = async (pack: ResourcePackItem) => {
    if (!selectedInstance) return;
    try {
      await tauriService.toggleResourcepack(selectedInstance.id, pack.fileName);
      await loadResourcePacks();
    } catch (err: any) {
      setStatusMessage(`Error toggling resource pack: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  const handleDeleteRp = async (pack: ResourcePackItem) => {
    if (!selectedInstance) return;
    if (!window.confirm(`Delete resource pack ${pack.name}?`)) return;
    try {
      await tauriService.deleteResourcepack(selectedInstance.id, pack.fileName);
      await loadResourcePacks();
    } catch (err: any) {
      setStatusMessage(`Error deleting resource pack: ${err?.message || err}`);
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  useEffect(() => {
    if (activeTab === 'discover' && discoverMods.length === 0) {
      handleSearchModrinth('');
    } else if (activeTab === 'resourcepacks' && rpDiscoverPacks.length === 0) {
      handleSearchRpDiscover('');
    }
  }, [activeTab]);

  const filtered = mods.filter((m) => {
    const query = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      m.description.toLowerCase().includes(query) ||
      m.fileName.toLowerCase().includes(query) ||
      (m.authors && m.authors.some((a) => a.toLowerCase().includes(query)))
    );
  });

  return (
    <div className="desktop-page-container">
      {/* Top Application Toolbar */}
      <div className="archive-toolbar">
        <div className="archive-title-block">
          <div className="archive-title-with-badge">
            <h2 className="archive-main-title">MODS & EXTENSIONS</h2>
            {selectedInstance && (
              <span className="journal-badge" style={{ background: '#ECE4D4', color: '#5E4E3D', border: '1px solid #C8BAA6', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                {selectedInstance.name} ({selectedInstance.loader === 'fabric' ? `Fabric ${selectedInstance.fabricVersion || ''}` : 'Vanilla'})
              </span>
            )}
          </div>
          <span className="archive-main-desc">
            Instance-scoped mod management, direct Modrinth integration, SHA-256 verification, and resource packs.
          </span>
        </div>

        <div className="archive-actions-block">
          {activeTab === 'installed' && (
            <>
              <button
                onClick={handleCheckUpdates}
                className="btn-secondary-wood"
                disabled={isCheckingUpdates || !selectedInstance}
                title="Query Modrinth for newer compatible mod versions"
              >
                <ArrowUpCircle size={13} className={isCheckingUpdates ? 'spinning-icon' : ''} />
                <span>{isCheckingUpdates ? 'Checking...' : 'Check Updates'}</span>
              </button>

              {availableUpdates.length > 0 && (
                <button
                  onClick={handleUpdateAll}
                  className="btn-primary-wood"
                  style={{ background: '#526B45', borderColor: '#3F5938' }}
                  title="Update all outdated mods"
                >
                  <ArrowUpCircle size={13} />
                  <span>Update All ({availableUpdates.length})</span>
                </button>
              )}

              <button
                onClick={loadMods}
                className="btn-secondary-wood"
                disabled={isLoading || !selectedInstance}
                title="Scan mods folder for new or modified mods"
              >
                <RefreshCw size={13} className={isLoading ? 'spinning-icon' : ''} />
                <span>{isLoading ? 'Scanning...' : 'Rescan'}</span>
              </button>

              <button
                onClick={handleOpenFolder}
                className="btn-primary-forest"
                disabled={!selectedInstance}
                title="Open mods folder in Windows Explorer"
              >
                <Folder size={14} />
                <span>Open Mods Folder</span>
              </button>
            </>
          )}

          {activeTab === 'resourcepacks' && (
            <button
              onClick={handleOpenRpFolder}
              className="btn-primary-forest"
              disabled={!selectedInstance}
              title="Open resource packs folder in Windows Explorer"
            >
              <Folder size={14} />
              <span>Open Packs Folder</span>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Instance Selector & Scope Bar */}
      <div style={{
        margin: '0.75rem 1.25rem 0.5rem 1.25rem',
        padding: '12px 16px',
        background: '#FAF4E8',
        border: '1.5px solid #D5C0A0',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#5E4E3D', letterSpacing: '0.04em' }}>
            ACTIVE INSTANCE:
          </span>
          <select
            value={selectedInstance?.id || ''}
            onChange={(e) => onSelectInstance(e.target.value)}
            className="wood-select"
            style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, minWidth: '240px', borderRadius: '4px' }}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name} ({inst.loader === 'fabric' ? `Fabric ${inst.fabricVersion || ''}` : 'Vanilla'} • {inst.versionId})
              </option>
            ))}
          </select>

          {selectedInstance && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  background: selectedInstance.loader === 'fabric' ? '#E0E8DC' : '#ECE4D4',
                  color: selectedInstance.loader === 'fabric' ? '#3F5938' : '#5E4E3D',
                  border: `1px solid ${selectedInstance.loader === 'fabric' ? '#A4BC96' : '#C8BAA6'}`,
                }}
              >
                {selectedInstance.loader === 'fabric' ? 'Fabric Loader' : 'Vanilla'}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '3px',
                  background: '#ECE4D4',
                  color: '#5E4E3D',
                  border: '1px solid #C8BAA6',
                }}
              >
                Minecraft {selectedInstance.versionId}
              </span>
            </div>
          )}
        </div>

        {selectedInstance && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#746454' }}>
              Folder: <code>instances/{selectedInstance.id}/mods</code>
            </span>
            <button
              onClick={handleOpenFolder}
              className="btn-secondary-wood"
              style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Open instance mods directory in Windows Explorer"
            >
              <FolderOpen size={13} />
              <span>Open Folder</span>
            </button>
          </div>
        )}
      </div>

      {/* Vanilla Loader Warning if applicable */}
      {selectedInstance?.loader === 'vanilla' && (
        <div
          style={{
            margin: '0 1.25rem 0.5rem 1.25rem',
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'rgba(184, 111, 82, 0.12)',
            border: '1.5px solid #B86F52',
            color: '#2A1A0F',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={16} color="#B86F52" />
          <span>
            <strong>Vanilla Instance Notice:</strong> This instance is configured with the Vanilla Minecraft loader. Mods require the Fabric loader to execute in-game. You can still manage and install mods here, but switch or create a Fabric instance in the Instances tab to run them.
          </span>
        </div>
      )}

      {/* Tabs Row: Installed vs Discover vs Resource Packs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem 0.5rem 1.25rem', borderBottom: '1px solid rgba(120, 139, 85, 0.2)' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('installed')}
            className={`filter-tab-btn ${activeTab === 'installed' ? 'active' : ''}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <Layers size={13} style={{ marginRight: '6px' }} />
            <span>Installed Mods ({mods.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            className={`filter-tab-btn ${activeTab === 'discover' ? 'active' : ''}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <Compass size={13} style={{ marginRight: '6px' }} />
            <span>Discover Mods (Modrinth)</span>
          </button>
          <button
            onClick={() => setActiveTab('resourcepacks')}
            className={`filter-tab-btn ${activeTab === 'resourcepacks' ? 'active' : ''}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <Package size={13} style={{ marginRight: '6px' }} />
            <span>Resource Packs ({resourcePacks.length})</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            margin: '0.5rem 1.25rem',
            padding: '8px 12px',
            borderRadius: '4px',
            background: 'rgba(82, 107, 69, 0.15)',
            border: '1px solid #526B45',
            color: '#2A1A0F',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* ====================================================================
          TAB 1: INSTALLED MODS
          ==================================================================== */}
      {activeTab === 'installed' && (
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Earthy Mod Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDropFiles}
            onClick={handleBrowseLocalMods}
            style={{
              padding: '16px 20px',
              border: isDragging ? '2px dashed #526B45' : '2px dashed #C8BAA6',
              borderRadius: '6px',
              background: isDragging ? 'rgba(82, 107, 69, 0.08)' : '#FAF4E8',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#5E4E3D' }}>
              <UploadCloud size={20} color={isDragging ? '#526B45' : '#8D7B69'} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#2A1A0F' }}>
                {isInstallingLocal ? 'Verifying & Installing Mod JARs...' : 'Drag & Drop Mod JARs Here'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: '#746454' }}>
              Drop <code>.jar</code> mod files here, or click to browse. Files are verified for ZIP integrity and copied directly into <code>instances/{selectedInstance?.id || ''}/mods</code>.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleBrowseLocalMods();
              }}
              disabled={isInstallingLocal || !selectedInstance}
              className="btn-primary-wood"
              style={{ marginTop: '2px', padding: '5px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isInstallingLocal ? (
                <>
                  <RefreshCw size={12} className="spinning-icon" />
                  <span>INSTALLING...</span>
                </>
              ) : (
                <>
                  <FolderOpen size={12} />
                  <span>BROWSE MOD JARS</span>
                </>
              )}
            </button>
          </div>

          {/* Search bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="search-bar-wrap" style={{ flex: 1 }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search installed mods by name, author, or file..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state-journal" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <Layers size={36} color="#B8A58A" style={{ marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', color: '#5E4E3D', margin: '0 0 6px 0' }}>No Mods Found</h3>
              <p style={{ fontSize: '13px', color: '#746454', margin: '0 0 16px 0' }}>
                {mods.length === 0
                  ? "This instance's mods directory is currently empty. Switch to Discover to browse and install compatible mods from Modrinth."
                  : 'No mods match your search query.'}
              </p>
              {mods.length === 0 && (
                <button
                  onClick={() => setActiveTab('discover')}
                  className="btn-primary-wood"
                  style={{ padding: '8px 16px' }}
                >
                  <Compass size={14} style={{ marginRight: '6px' }} />
                  <span>Discover Mods</span>
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((mod) => {
                const update = availableUpdates.find((u) => u.fileName === mod.fileName || u.projectId === mod.modrinthProjectId);
                const isUpdating = update ? updatingProjectIds[update.projectId] : false;

                return (
                  <div
                    key={mod.fileName}
                    style={{
                      background: mod.enabled ? '#FAF4E8' : '#ECE4D4',
                      border: mod.enabled ? '1.5px solid #D5C0A0' : '1px dashed #B8A58A',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: mod.enabled ? 1 : 0.7,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={mod.enabled}
                        onChange={() => handleToggle(mod)}
                        style={{ width: '16px', height: '16px', accentColor: '#526B45', cursor: 'pointer' }}
                        title={mod.enabled ? 'Click to disable' : 'Click to enable'}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#2A1A0F' }}>
                            {mod.name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#746454', background: '#E0E8DC', padding: '1px 6px', borderRadius: '3px' }}>
                            v{mod.version}
                          </span>
                          <span style={{ fontSize: '11px', color: '#5E4E3D', background: '#D5C0A0', padding: '1px 6px', borderRadius: '3px' }}>
                            {mod.loader}
                          </span>
                          {update && (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#3F5938', background: '#CBE0C2', padding: '1px 6px', borderRadius: '3px' }}>
                              Update to {update.latestVersion}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#746454' }}>
                          {mod.description}
                        </p>
                        {mod.authors.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#8D7B69', display: 'block', marginTop: '2px' }}>
                            By {mod.authors.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {update && (
                        <button
                          onClick={() => handleUpdateMod(update)}
                          disabled={isUpdating}
                          className="btn-primary-wood"
                          style={{ padding: '6px 12px', fontSize: '11px', background: '#526B45' }}
                        >
                          <ArrowUpCircle size={13} className={isUpdating ? 'spinning-icon' : ''} />
                          <span>{isUpdating ? 'Updating...' : 'Update'}</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(mod)}
                        className="btn-secondary-wood"
                        style={{ padding: '6px 10px', color: '#B86F52' }}
                        title="Delete Mod"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: DISCOVER MODS (MODRINTH DIRECT DOWNLOAD + DEPENDENCIES)
          ==================================================================== */}
      {activeTab === 'discover' && (
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div className="search-bar-wrap" style={{ flex: 1 }}>
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search Modrinth mods (e.g. Sodium, Iris, FerriteCore)..."
                value={discoverSearch}
                onChange={(e) => setDiscoverSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchModrinth()}
                className="search-input"
              />
            </div>
            <button
              onClick={() => handleSearchModrinth()}
              className="btn-primary-wood"
              disabled={isSearchingDiscover}
              style={{ padding: '0 16px' }}
            >
              {isSearchingDiscover ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
            {discoverMods.map((mod) => {
              const isInstalled = mods.some((m) => m.modrinthProjectId === mod.projectId || m.name.toLowerCase() === mod.title.toLowerCase()) || !!installedSuccessIds[mod.projectId];

              return (
                <div
                  key={mod.projectId}
                  style={{
                    background: '#FAF4E8',
                    border: '1.5px solid #D5C0A0',
                    borderRadius: '6px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {mod.iconUrl ? (
                      <img
                        src={mod.iconUrl}
                        alt={mod.title}
                        style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '6px',
                          background: '#8C7863',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FAF4E8',
                        }}
                      >
                        <Box size={22} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 700, color: '#2A1A0F' }}>
                        {mod.title}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#746454' }}>By {mod.author}</span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: '#5E4E3D', lineHeight: 1.4, flex: 1 }}>
                    {mod.description}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid #EADBCE' }}>
                    <span style={{ fontSize: '11px', color: '#8D7B69' }}>
                      {mod.downloads.toLocaleString()} downloads
                    </span>

                    {(() => {
                      const progress = modInstallProgress[mod.projectId];
                      if (progress === 'downloading') {
                        return (
                          <button
                            disabled
                            className="btn-primary-wood"
                            style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85 }}
                          >
                            <RefreshCw size={13} className="spinning-icon" />
                            <span>DOWNLOADING...</span>
                          </button>
                        );
                      }
                      if (progress === 'verifying') {
                        return (
                          <button
                            disabled
                            className="btn-primary-wood"
                            style={{ padding: '6px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85, background: '#788B55' }}
                          >
                            <RefreshCw size={13} className="spinning-icon" />
                            <span>VERIFYING...</span>
                          </button>
                        );
                      }
                      if (isInstalled || progress === 'installed') {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#526B45', fontSize: '12px', fontWeight: 700 }}>
                            <Check size={15} strokeWidth={2.5} />
                            <span>INSTALLED ✓</span>
                          </div>
                        );
                      }
                      if (progress === 'error') {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <button
                              onClick={() => handleInstallMod(mod)}
                              disabled={!!installingModId}
                              className="btn-primary-wood"
                              style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', background: '#B86F52', borderColor: '#8C4830' }}
                            >
                              <RotateCcw size={12} />
                              <span>RETRY ↻</span>
                            </button>
                            {modInstallError[mod.projectId] && (
                              <span style={{ fontSize: '10px', color: '#B86F52', maxWidth: '180px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={modInstallError[mod.projectId]}>
                                {modInstallError[mod.projectId]}
                              </span>
                            )}
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => handleInstallMod(mod)}
                          disabled={!!installingModId}
                          className="btn-primary-wood"
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Download size={13} />
                          <span>INSTALL</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: RESOURCE PACKS
          ==================================================================== */}
      {activeTab === 'resourcepacks' && (
        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Installed Resource Packs */}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#2A1A0F', margin: '0 0 8px 0' }}>
              INSTALLED RESOURCE PACKS ({resourcePacks.length})
            </h3>

            {resourcePacks.length === 0 ? (
              <div className="empty-state-journal" style={{ padding: '32px 20px', textAlign: 'center' }}>
                <Package size={32} color="#B8A58A" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '13px', color: '#746454', margin: 0 }}>
                  No resource packs installed in this instance. Drop .zip files into the resource packs folder or search below.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {resourcePacks.map((pack) => (
                  <div
                    key={pack.fileName}
                    style={{
                      background: pack.enabled ? '#FAF4E8' : '#ECE4D4',
                      border: pack.enabled ? '1.5px solid #D5C0A0' : '1px dashed #B8A58A',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: pack.enabled ? 1 : 0.7,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="checkbox"
                        checked={pack.enabled}
                        onChange={() => handleToggleRp(pack)}
                        style={{ width: '16px', height: '16px', accentColor: '#526B45', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#2A1A0F' }}>
                            {pack.name}
                          </span>
                          {pack.packFormat && (
                            <span style={{ fontSize: '11px', color: '#746454', background: '#E0E8DC', padding: '1px 6px', borderRadius: '3px' }}>
                              Format {pack.packFormat}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#746454' }}>
                          {pack.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRp(pack)}
                      className="btn-secondary-wood"
                      style={{ padding: '6px 10px', color: '#B86F52' }}
                      title="Delete Resource Pack"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discover Resource Packs via Modrinth */}
          <div style={{ marginTop: '12px', borderTop: '1px solid #D5C0A0', paddingTop: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#2A1A0F', margin: '0 0 8px 0' }}>
              DISCOVER RESOURCE PACKS (MODRINTH)
            </h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div className="search-bar-wrap" style={{ flex: 1 }}>
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search resource packs on Modrinth (e.g. Faithful, Bare Bones)..."
                  value={rpDiscoverSearch}
                  onChange={(e) => setRpDiscoverSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchRpDiscover()}
                  className="search-input"
                />
              </div>
              <button
                onClick={() => handleSearchRpDiscover()}
                className="btn-primary-wood"
                disabled={isSearchingRpDiscover}
                style={{ padding: '0 16px' }}
              >
                {isSearchingRpDiscover ? 'Searching...' : 'Search'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '12px' }}>
              {rpDiscoverPacks.map((pack) => (
                <div
                  key={pack.projectId}
                  style={{
                    background: '#FAF4E8',
                    border: '1.5px solid #D5C0A0',
                    borderRadius: '6px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {pack.iconUrl ? (
                      <img
                        src={pack.iconUrl}
                        alt={pack.title}
                        style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          background: '#8C7863',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FAF4E8',
                        }}
                      >
                        <Package size={20} />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 2px 0', fontSize: '14px', fontWeight: 700, color: '#2A1A0F' }}>
                        {pack.title}
                      </h4>
                      <span style={{ fontSize: '11px', color: '#746454' }}>By {pack.author}</span>
                    </div>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: '#5E4E3D', lineHeight: 1.4, flex: 1 }}>
                    {pack.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
