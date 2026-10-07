import React, { useState } from 'react';
import { X, Box, Download } from 'lucide-react';
import { MinecraftVersion } from '../types/launcher';

interface NewVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddVersion: (newVersion: MinecraftVersion) => void;
}

export const NewVersionModal: React.FC<NewVersionModalProps> = ({ isOpen, onClose, onAddVersion }) => {
  const [versionName, setVersionName] = useState('1.21.5');
  const [loaderType, setLoaderType] = useState<'release' | 'snapshot' | 'fabric' | 'forge'>('release');
  const [customName, setCustomName] = useState('MINECRAFT 1.21.5');
  const [description, setDescription] = useState('New survival release with bug fixes and world optimizations.');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const typeLabel =
      loaderType === 'release'
        ? 'Vanilla'
        : loaderType === 'fabric'
        ? 'Fabric Modded'
        : loaderType === 'forge'
        ? 'Forge'
        : 'Snapshot';

    const newVer: MinecraftVersion = {
      id: `${versionName}-${loaderType}-${Date.now()}`,
      name: customName || `MINECRAFT ${versionName}`,
      type: loaderType,
      typeLabel: typeLabel,
      installed: true,
      releaseDate: 'Present Day',
      size: '560 MB',
      description: description,
    };

    onAddVersion(newVer);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-journal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-journal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Box size={18} color="#C8A878" />
            <h3 className="modal-journal-title">Install New Minecraft Archive</h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#DCCCB0', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-journal-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#3D3025' }}>
                Installation Name
              </label>
              <input
                type="text"
                className="parchment-input"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. MINECRAFT 1.21.5"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#3D3025' }}>
                Loader / Engine Type
              </label>
              <select
                className="parchment-select"
                value={loaderType}
                onChange={(e) => setLoaderType(e.target.value as any)}
              >
                <option value="release">Vanilla Release (Official Mojang)</option>
                <option value="fabric">Fabric Loader (Lightweight Mods & Shaders)</option>
                <option value="forge">Minecraft Forge (Extensive Modpacks)</option>
                <option value="snapshot">Experimental Snapshot</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#3D3025' }}>
                Minecraft Version Number
              </label>
              <select
                className="parchment-select"
                value={versionName}
                onChange={(e) => {
                  setVersionName(e.target.value);
                  setCustomName(`MINECRAFT ${e.target.value}`);
                }}
              >
                <option value="1.21.5">1.21.5 (Latest Release Candidate)</option>
                <option value="1.21.4">1.21.4</option>
                <option value="1.21.1">1.21.1</option>
                <option value="1.20.6">1.20.6</option>
                <option value="1.20.4">1.20.4</option>
                <option value="1.19.2">1.19.2</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#3D3025' }}>
                Instance Notes / Description
              </label>
              <textarea
                className="parchment-input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-journal-footer">
            <button type="button" onClick={onClose} className="btn-secondary-wood">
              Cancel
            </button>
            <button type="submit" className="btn-primary-forest">
              <Download size={14} />
              <span>Record & Install</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
