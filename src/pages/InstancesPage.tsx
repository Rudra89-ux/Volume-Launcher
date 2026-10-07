import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Plus, 
  Settings2, 
  FolderOpen, 
  Copy, 
  Trash2, 
  Check, 
  Cpu, 
  Clock, 
  Layers, 
  Sliders, 
  Monitor,
  X,
  AlertTriangle
} from 'lucide-react';
import { Instance, MinecraftVersion, FabricLoaderItem } from '../types/launcher';
import { tauriService } from '../services/tauri';

interface InstancesPageProps {
  instances: Instance[];
  selectedInstance: Instance | null;
  onSelectInstance: (instanceId: string) => Promise<void> | void;
  onLaunchInstance: (instance: Instance) => Promise<void> | void;
  onCreateInstance: (name: string, versionId: string, loader: string, fabricVersion?: string) => Promise<void>;
  onUpdateInstance: (instance: Instance) => Promise<void>;
  onDuplicateInstance: (instanceId: string, newName: string) => Promise<void>;
  onDeleteInstance: (instanceId: string) => Promise<void>;
  onOpenFolder: (instanceId: string) => void;
  availableVersions: MinecraftVersion[];
  isMinecraftRunning: boolean;
}

export const InstancesPage: React.FC<InstancesPageProps> = ({
  instances = [],
  selectedInstance = null,
  onSelectInstance,
  onLaunchInstance,
  onCreateInstance,
  onUpdateInstance,
  onDuplicateInstance,
  onDeleteInstance,
  onOpenFolder,
  availableVersions = [],
  isMinecraftRunning = false,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);
  const [instanceToDelete, setInstanceToDelete] = useState<Instance | null>(null);

  // New instance form state
  const [newName, setNewName] = useState('New Instance');
  const [newVersionId, setNewVersionId] = useState('1.21.1');
  const [newLoader, setNewLoader] = useState<'vanilla' | 'fabric'>('vanilla');
  const [newFabricVersion, setNewFabricVersion] = useState('');
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderItem[]>([]);
  const [isLoadingFabric, setIsLoadingFabric] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit instance form state
  const [editName, setEditName] = useState('');
  const [editMemoryGb, setEditMemoryGb] = useState<number>(4);
  const [editResolutionWidth, setEditResolutionWidth] = useState<number>(1280);
  const [editResolutionHeight, setEditResolutionHeight] = useState<number>(720);
  const [editFullscreen, setEditFullscreen] = useState(false);
  const [editJavaPath, setEditJavaPath] = useState('');
  const [editJvmArgs, setEditJvmArgs] = useState('');
  const [editGameDir, setEditGameDir] = useState('');

  // Default selection for version
  useEffect(() => {
    if (availableVersions.length > 0 && !newVersionId) {
      const rel = availableVersions.find(v => v.type === 'release') || availableVersions[0];
      setNewVersionId(rel.id);
    }
  }, [availableVersions, newVersionId]);

  // Fetch Fabric versions when loader is fabric
  useEffect(() => {
    if (newLoader === 'fabric' && newVersionId) {
      setIsLoadingFabric(true);
      tauriService.getFabricLoaderVersions(newVersionId)
        .then((loaders) => {
          setFabricLoaders(loaders);
          if (loaders.length > 0) {
            const stable = loaders.find(l => l.stable) || loaders[0];
            setNewFabricVersion(stable.version);
          }
        })
        .catch((err) => {
          console.error('Failed to load Fabric loaders:', err);
        })
        .finally(() => {
          setIsLoadingFabric(false);
        });
    }
  }, [newLoader, newVersionId]);

  const handleOpenEdit = (inst: Instance) => {
    setEditingInstance(inst);
    setEditName(inst.name);
    setEditMemoryGb(inst.memoryGb || 4);
    setEditResolutionWidth(inst.resolutionWidth || 1280);
    setEditResolutionHeight(inst.resolutionHeight || 720);
    setEditFullscreen(inst.fullscreen || false);
    setEditJavaPath(inst.javaPath || '');
    setEditJvmArgs(inst.jvmArgs || '');
    setEditGameDir(inst.gameDir || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInstance) return;

    try {
      setIsSubmitting(true);
      const updated: Instance = {
        ...editingInstance,
        name: editName.trim() || editingInstance.name,
        memoryGb: editMemoryGb > 0 ? editMemoryGb : undefined,
        resolutionWidth: editResolutionWidth > 0 ? editResolutionWidth : undefined,
        resolutionHeight: editResolutionHeight > 0 ? editResolutionHeight : undefined,
        fullscreen: editFullscreen,
        javaPath: editJavaPath.trim() ? editJavaPath.trim() : undefined,
        jvmArgs: editJvmArgs.trim() ? editJvmArgs.trim() : undefined,
        gameDir: editGameDir.trim() ? editGameDir.trim() : undefined,
      };
      await onUpdateInstance(updated);
      setEditingInstance(null);
    } catch (err) {
      console.error('Failed to update instance:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newVersionId) return;

    try {
      setIsSubmitting(true);
      await onCreateInstance(
        newName.trim(),
        newVersionId,
        newLoader,
        newLoader === 'fabric' ? newFabricVersion : undefined
      );
      setIsCreateModalOpen(false);
      setNewName('New Instance');
    } catch (err) {
      console.error('Failed to create instance:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatLastPlayed = (timestamp?: string) => {
    if (!timestamp) return 'Never played';
    const num = parseInt(timestamp, 10);
    if (isNaN(num)) return timestamp;
    const date = new Date(num > 10000000000 ? num : num * 1000);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="desktop-page-container">
      {/* Header row */}
      <div className="archive-toolbar">
        <div className="archive-title-block">
          <h2 className="archive-main-title">MINECRAFT INSTANCES</h2>
          <span className="archive-main-desc">
            Isolated Minecraft environments with dedicated saves, mods, resource packs, and memory allocation.
          </span>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary-wood"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px' }}
        >
          <Plus size={16} strokeWidth={2.4} />
          <span>New Instance</span>
        </button>
      </div>

      {/* Instances list */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px', marginTop: '16px' }}>
        {instances.map((inst) => {
          const isSelected = selectedInstance?.id === inst.id;
          return (
            <div
              key={inst.id}
              className={`journal-instance-card ${isSelected ? 'selected' : ''}`}
              style={{
                background: isSelected ? '#FDFBF7' : '#F9F5EC',
                border: isSelected ? '2px solid #526B45' : '1.5px solid #D5C0A0',
                borderRadius: '8px',
                padding: '16px',
                boxShadow: isSelected
                  ? '0 4px 12px rgba(82, 107, 69, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                  : '0 2px 6px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
              }}
            >
              {/* Top row: badge + name + status */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '6px',
                      background: inst.loader === 'fabric' ? '#526B45' : '#8C7863',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FAF4E8',
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                    }}
                  >
                    <Layers size={20} />
                  </div>
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#2A1A0F',
                        fontFamily: "'Cinzel Decorative', serif",
                      }}
                    >
                      {inst.name}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: inst.loader === 'fabric' ? '#E0E8DC' : '#ECE4D4',
                          color: inst.loader === 'fabric' ? '#3F5938' : '#5E4E3D',
                          border: `1px solid ${inst.loader === 'fabric' ? '#A4BC96' : '#C8BAA6'}`,
                        }}
                      >
                        {inst.loader === 'fabric' ? `Fabric (${inst.fabricVersion || 'Latest'})` : 'Vanilla'}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#746454',
                        }}
                      >
                        Minecraft {inst.versionId}
                      </span>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: '#526B45',
                      color: '#FAF4E8',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    <Check size={12} strokeWidth={2.5} />
                    <span>ACTIVE</span>
                  </div>
                )}
              </div>

              {/* Specs pills row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  padding: '8px 10px',
                  background: 'rgba(213, 192, 160, 0.25)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#5E4E3D',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Cpu size={13} color="#746454" />
                  <span>{inst.memoryGb || 4} GB RAM</span>
                </div>
                <span>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Monitor size={13} color="#746454" />
                  <span>{inst.fullscreen ? 'Fullscreen' : `${inst.resolutionWidth || 1280}x${inst.resolutionHeight || 720}`}</span>
                </div>
                <span>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} color="#746454" />
                  <span>{formatLastPlayed(inst.lastPlayedAt)}</span>
                </div>
              </div>

              {/* Action buttons row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 'auto',
                  paddingTop: '6px',
                  borderTop: '1px solid #EADBCE',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      onSelectInstance(inst.id);
                      onLaunchInstance(inst);
                    }}
                    disabled={isMinecraftRunning}
                    className="btn-primary-wood"
                    style={{
                      padding: '6px 14px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: isMinecraftRunning ? 0.6 : 1,
                    }}
                    title="Launch Minecraft using this instance"
                  >
                    <Play size={13} fill="currentColor" />
                    <span>Launch</span>
                  </button>

                  {!isSelected && (
                    <button
                      onClick={() => onSelectInstance(inst.id)}
                      className="btn-secondary-wood"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                      title="Select this instance as active"
                    >
                      Select
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleOpenEdit(inst)}
                    className="btn-secondary-wood"
                    style={{ padding: '6px 8px' }}
                    title="Instance Settings (RAM, Resolution, JVM)"
                  >
                    <Sliders size={14} />
                  </button>
                  <button
                    onClick={() => onOpenFolder(inst.id)}
                    className="btn-secondary-wood"
                    style={{ padding: '6px 8px' }}
                    title="Open Instance Folder"
                  >
                    <FolderOpen size={14} />
                  </button>
                  <button
                    onClick={() => onDuplicateInstance(inst.id, `${inst.name} (Copy)`)}
                    className="btn-secondary-wood"
                    style={{ padding: '6px 8px' }}
                    title="Duplicate Instance"
                  >
                    <Copy size={14} />
                  </button>
                  {instances.length > 1 && (
                    <button
                      onClick={() => setInstanceToDelete(inst)}
                      className="btn-secondary-wood"
                      style={{ padding: '6px 8px', color: '#B86F52' }}
                      title="Delete Instance"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE INSTANCE MODAL */}
      {isCreateModalOpen && (
        <div className="launch-console-backdrop" style={{ zIndex: 1200 }}>
          <div
            className="parchment-modal-container"
            style={{ maxWidth: '520px', width: '92%', padding: '24px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#2A1A0F' }}>
                CREATE INSTANCE
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#746454' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  INSTANCE NAME
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="wood-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                  placeholder="e.g. Fabric Hardcore, Snapshot Testing"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  MINECRAFT VERSION
                </label>
                <select
                  value={newVersionId}
                  onChange={(e) => setNewVersionId(e.target.value)}
                  className="wood-select"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                >
                  {availableVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.type}) {v.installed ? '• Installed' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '6px' }}>
                  MOD LOADER
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setNewLoader('vanilla')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: newLoader === 'vanilla' ? '2px solid #526B45' : '1px solid #D5C0A0',
                      background: newLoader === 'vanilla' ? '#E0E8DC' : '#FAF4E8',
                      fontWeight: 700,
                      color: newLoader === 'vanilla' ? '#3F5938' : '#746454',
                      cursor: 'pointer',
                    }}
                  >
                    Vanilla
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLoader('fabric')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: newLoader === 'fabric' ? '2px solid #526B45' : '1px solid #D5C0A0',
                      background: newLoader === 'fabric' ? '#E0E8DC' : '#FAF4E8',
                      fontWeight: 700,
                      color: newLoader === 'fabric' ? '#3F5938' : '#746454',
                      cursor: 'pointer',
                    }}
                  >
                    Fabric
                  </button>
                </div>
              </div>

              {newLoader === 'fabric' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                    FABRIC LOADER VERSION {isLoadingFabric && '(Fetching...)'}
                  </label>
                  <select
                    value={newFabricVersion}
                    onChange={(e) => setNewFabricVersion(e.target.value)}
                    className="wood-select"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                    disabled={isLoadingFabric || fabricLoaders.length === 0}
                  >
                    {fabricLoaders.map((fl) => (
                      <option key={fl.version} value={fl.version}>
                        {fl.version} {fl.stable ? '(Stable)' : ''}
                      </option>
                    ))}
                    {fabricLoaders.length === 0 && (
                      <option value="0.16.10">0.16.10 (Default)</option>
                    )}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn-secondary-wood"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary-wood"
                  style={{ padding: '8px 20px' }}
                >
                  {isSubmitting ? 'Creating...' : 'Create Instance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT INSTANCE MODAL */}
      {editingInstance && (
        <div className="launch-console-backdrop" style={{ zIndex: 1200 }}>
          <div
            className="parchment-modal-container"
            style={{ maxWidth: '540px', width: '92%', padding: '24px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings2 size={18} color="#526B45" />
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#2A1A0F' }}>
                  INSTANCE CONFIGURATION
                </h3>
              </div>
              <button
                onClick={() => setEditingInstance(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#746454' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  INSTANCE NAME
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="wood-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                  required
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#5E4E3D' }}>
                    MEMORY ALLOCATION (RAM)
                  </label>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#526B45' }}>
                    {editMemoryGb} GB
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="16"
                  step="1"
                  value={editMemoryGb}
                  onChange={(e) => setEditMemoryGb(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: '#526B45' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                    WIDTH (PX)
                  </label>
                  <input
                    type="number"
                    value={editResolutionWidth}
                    onChange={(e) => setEditResolutionWidth(parseInt(e.target.value, 10) || 1280)}
                    className="wood-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                    disabled={editFullscreen}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                    HEIGHT (PX)
                  </label>
                  <input
                    type="number"
                    value={editResolutionHeight}
                    onChange={(e) => setEditResolutionHeight(parseInt(e.target.value, 10) || 720)}
                    className="wood-input"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                    disabled={editFullscreen}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#5E4E3D' }}>
                  <input
                    type="checkbox"
                    checked={editFullscreen}
                    onChange={(e) => setEditFullscreen(e.target.checked)}
                    style={{ accentColor: '#526B45', width: '16px', height: '16px' }}
                  />
                  <span>Launch in Fullscreen Mode</span>
                </label>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  CUSTOM JAVA EXECUTABLE (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={editJavaPath}
                  onChange={(e) => setEditJavaPath(e.target.value)}
                  className="wood-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                  placeholder="Leave blank to use auto-detected runtime"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  ADDITIONAL JVM ARGUMENTS (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={editJvmArgs}
                  onChange={(e) => setEditJvmArgs(e.target.value)}
                  className="wood-input"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '4px' }}
                  placeholder="e.g. -XX:+UseZGC"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '4px' }}>
                  GAME DIRECTORY OVERRIDE (OPTIONAL)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={editGameDir}
                    onChange={(e) => setEditGameDir(e.target.value)}
                    className="wood-input"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', fontSize: '12px' }}
                    placeholder="Default instance directory"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const selected = await tauriService.pickDirectory(editGameDir || undefined);
                      if (selected) {
                        setEditGameDir(selected);
                      }
                    }}
                    className="btn-secondary-wood"
                    style={{ padding: '8px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setEditingInstance(null)}
                  className="btn-secondary-wood"
                  style={{ padding: '8px 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary-wood"
                  style={{ padding: '8px 20px' }}
                >
                  {isSubmitting ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {instanceToDelete && (
        <div className="launch-console-backdrop" style={{ zIndex: 1300 }}>
          <div
            className="parchment-modal-container"
            style={{ maxWidth: '440px', width: '90%', padding: '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B86F52', marginBottom: '12px' }}>
              <AlertTriangle size={24} />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                DELETE INSTANCE?
              </h3>
            </div>
            <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#5E4E3D', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{instanceToDelete.name}</strong>? All worlds, mods, and configuration in this instance will be permanently removed.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setInstanceToDelete(null)}
                className="btn-secondary-wood"
                style={{ padding: '8px 14px' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await onDeleteInstance(instanceToDelete.id);
                  setInstanceToDelete(null);
                }}
                className="btn-primary-wood"
                style={{ padding: '8px 16px', background: '#B86F52', borderColor: '#8E513A' }}
              >
                Delete Instance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
