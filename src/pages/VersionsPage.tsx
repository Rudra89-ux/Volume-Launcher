import React, { useState } from 'react';
import { 
  Play, 
  MoreVertical, 
  Plus, 
  CheckCircle2, 
  Download, 
  Search, 
  RefreshCw, 
  Loader2, 
  Check, 
  ShieldCheck, 
  Wrench,
  AlertCircle
} from 'lucide-react';
import { MinecraftVersion, ActiveInstallState } from '../types/launcher';
import { tauriService } from '../services/tauri';

interface VersionsPageProps {
  versions: MinecraftVersion[];
  selectedVersion: MinecraftVersion;
  activeInstall: ActiveInstallState | null;
  onSelectVersion: (version: MinecraftVersion) => void;
  onLaunchVersion: (version: MinecraftVersion) => void;
  onInstallVersion: (version: MinecraftVersion) => void;
  onOpenNewVersionModal: () => void;
  onRefreshVersions: () => void;
  isLoadingVersions: boolean;
}

export const VersionsPage: React.FC<VersionsPageProps> = ({
  versions,
  selectedVersion,
  activeInstall,
  onSelectVersion,
  onLaunchVersion,
  onInstallVersion,
  onOpenNewVersionModal,
  onRefreshVersions,
  isLoadingVersions,
}) => {
  const [filter, setFilter] = useState<'all' | 'release' | 'snapshot' | 'installed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<{
    versionId: string;
    text: string;
    isError?: boolean;
  } | null>(null);

  const handleVerifyAndRepair = async (version: MinecraftVersion) => {
    setActiveMenuId(null);
    setVerifyingId(version.id);
    setVerificationNotice({
      versionId: version.id,
      text: `Verifying SHA-1 checksums for ${version.name}...`,
    });

    try {
      const result = await tauriService.verifyMinecraftVersion(version.id);
      if (result.is_valid) {
        setVerificationNotice({
          versionId: version.id,
          text: `All ${result.total_files} files verified intact and valid (SHA-1 verified).`,
        });
      } else {
        const count = result.missing_files + result.corrupt_files;
        setVerificationNotice({
          versionId: version.id,
          text: `Detected ${count} missing/corrupted file(s). Repairing now...`,
        });
        await tauriService.repairMinecraftVersion(version.id);
        setVerificationNotice({
          versionId: version.id,
          text: `Repair complete! All files redownloaded and verified.`,
        });
      }
    } catch (err: any) {
      setVerificationNotice({
        versionId: version.id,
        text: `Verification error: ${err?.message || err}`,
        isError: true,
      });
    } finally {
      setVerifyingId(null);
    }
  };

  const filteredVersions = versions.filter((v) => {
    const isRel = v.type === 'release';
    const isSnap = v.type === 'snapshot';
    const isInst = v.installed;

    const matchesFilter =
      filter === 'all' ||
      (filter === 'release' && isRel) ||
      (filter === 'snapshot' && isSnap) ||
      (filter === 'installed' && isInst);

    const matchesSearch =
      v.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.typeLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="desktop-page-container">
      {/* Top Application Toolbar */}
      <div className="archive-toolbar">
        <div className="archive-title-block">
          <h2 className="archive-main-title">VERSION ARCHIVE</h2>
          <span className="archive-main-desc">
            Official Mojang engine releases, survival updates, and experimental snapshot builds.
          </span>
        </div>

        <div className="archive-actions-block">
          <button
            onClick={onRefreshVersions}
            className="btn-secondary-wood"
            disabled={isLoadingVersions}
            title="Refresh official manifest from Mojang"
          >
            <RefreshCw size={13} className={isLoadingVersions ? 'spinning-icon' : ''} />
            <span>{isLoadingVersions ? 'Syncing...' : 'Sync Mojang'}</span>
          </button>

          <button
            onClick={onOpenNewVersionModal}
            className="btn-primary-forest"
          >
            <Plus size={15} />
            <span>Custom Installation</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="archive-filter-row">
        <div className="filter-tabs-row">
          <button
            onClick={() => setFilter('all')}
            className={`filter-tab-btn ${filter === 'all' ? 'active' : ''}`}
          >
            All Archives ({versions.length})
          </button>
          <button
            onClick={() => setFilter('release')}
            className={`filter-tab-btn ${filter === 'release' ? 'active' : ''}`}
          >
            Releases ({versions.filter((v) => v.type === 'release').length})
          </button>
          <button
            onClick={() => setFilter('snapshot')}
            className={`filter-tab-btn ${filter === 'snapshot' ? 'active' : ''}`}
          >
            Snapshots ({versions.filter((v) => v.type === 'snapshot').length})
          </button>
          <button
            onClick={() => setFilter('installed')}
            className={`filter-tab-btn ${filter === 'installed' ? 'active' : ''}`}
          >
            Installed ({versions.filter((v) => v.installed).length})
          </button>
        </div>

        <div className="archive-search-box">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Filter versions (e.g. 1.21.4)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="parchment-input archive-search-input"
          />
        </div>
      </div>

      {/* Verification Notice Banner */}
      {verificationNotice && (
        <div 
          style={{
            margin: '0.5rem 1.25rem',
            padding: '0.6rem 1rem',
            backgroundColor: verificationNotice.isError ? '#5A261D' : '#3D4C2F',
            color: '#F4ECE0',
            borderRadius: '4px',
            fontSize: '0.82rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {verifyingId ? (
              <Loader2 size={14} className="spinning-icon" />
            ) : verificationNotice.isError ? (
              <AlertCircle size={14} color="#E8A598" />
            ) : (
              <ShieldCheck size={14} color="#A7C98C" />
            )}
            <span>{verificationNotice.text}</span>
          </div>
          <button
            onClick={() => setVerificationNotice(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#F4ECE0',
              cursor: 'pointer',
              fontSize: '0.9rem',
              opacity: 0.8
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ====================================================================
          EXPLORER'S VERTICAL ARCHIVE / LIST LAYOUT
          ==================================================================== */}
      <div className="archive-entries-list">
        {filteredVersions.slice(0, 100).map((version) => {
          const isSelected = selectedVersion.id === version.id;
          const isInstallingThis = activeInstall && activeInstall.versionId === version.id;
          const isVerifyingThis = verifyingId === version.id;

          return (
            <div
              key={version.id}
              className={`archive-entry-row ${isSelected ? 'active-entry' : ''}`}
            >
              {/* Left Column: Version Info */}
              <div className="entry-left-col">
                <div className="entry-title-row">
                  <h3 className="entry-version-title">{version.name}</h3>
                  <span className="entry-type-tag">
                    {version.type === 'release' ? 'Vanilla Release' : 'Snapshot'}
                  </span>
                  {isSelected && (
                    <span className="entry-selected-pill">Active Selected</span>
                  )}
                </div>

                <div className="entry-meta-row">
                  <span className="entry-meta-item">Released: {version.releaseDate}</span>
                  <span className="entry-meta-sep">•</span>
                  <span className="entry-meta-item">Size: {version.size}</span>
                  <span className="entry-meta-sep">•</span>
                  <span className="entry-meta-desc">{version.description}</span>
                </div>

                {/* Progress bar if downloading */}
                {isInstallingThis && (
                  <div className="entry-install-progress-box">
                    <div className="entry-progress-bar-track">
                      <div
                        className="entry-progress-bar-fill"
                        style={{ width: `${Math.max(activeInstall.percentage, 5)}%` }}
                      ></div>
                    </div>
                    <div className="entry-progress-info">
                      <span>Stage: <strong>{activeInstall.stage.toUpperCase()}</strong></span>
                      <span>
                        {activeInstall.current}/{activeInstall.total} files ({activeInstall.percentage}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Middle Column: Status Dot */}
              <div className="entry-middle-col">
                {isVerifyingThis ? (
                  <div className="entry-status-badge installing" title="Verifying SHA-1 hashes">
                    <Loader2 size={13} className="spinning-icon" color="#526B45" />
                    <span>Verifying</span>
                  </div>
                ) : version.installed ? (
                  <div className="entry-status-badge installed" title="Installed and ready to launch">
                    <Check size={13} color="#526B45" strokeWidth={2.5} />
                    <span>Installed</span>
                  </div>
                ) : isInstallingThis ? (
                  <div className="entry-status-badge installing">
                    <Loader2 size={13} className="spinning-icon" color="#526B45" />
                    <span>Installing</span>
                  </div>
                ) : (
                  <div className="entry-status-badge available" title="Stored in Mojang official archives">
                    <span className="status-dot-dim"></span>
                    <span>Available</span>
                  </div>
                )}
              </div>

              {/* Right Column: Action Buttons */}
              <div className="entry-right-col">
                {version.installed ? (
                  <button
                    onClick={() => {
                      onSelectVersion(version);
                      onLaunchVersion(version);
                    }}
                    className="btn-primary-forest entry-play-btn"
                  >
                    <Play size={13} fill="#FAF4E8" strokeWidth={1} />
                    <span>PLAY</span>
                  </button>
                ) : (
                  <button
                    onClick={() => onInstallVersion(version)}
                    disabled={!!isInstallingThis}
                    className="btn-secondary-wood entry-install-btn"
                  >
                    {isInstallingThis ? (
                      <>
                        <Loader2 size={13} className="spinning-icon" />
                        <span>DOWNLOADING</span>
                      </>
                    ) : (
                      <>
                        <Download size={13} />
                        <span>INSTALL</span>
                      </>
                    )}
                  </button>
                )}

                {/* Options Menu Button [ ⋮ ] */}
                <div className="entry-options-wrap">
                  <button
                    onClick={() => setActiveMenuId(activeMenuId === version.id ? null : version.id)}
                    className="btn-sm-action"
                    title="Version Actions"
                  >
                    <MoreVertical size={14} />
                  </button>

                  {activeMenuId === version.id && (
                    <div className="entry-menu-dropdown">
                      <button
                        onClick={() => {
                          onSelectVersion(version);
                          setActiveMenuId(null);
                        }}
                        className="entry-menu-item"
                      >
                        <CheckCircle2 size={13} color="#526B45" />
                        <span>Select Version</span>
                      </button>

                      {version.installed && (
                        <button
                          onClick={() => handleVerifyAndRepair(version)}
                          disabled={!!verifyingId}
                          className="entry-menu-item"
                        >
                          <Wrench size={13} color="#B86F52" />
                          <span>Verify & Repair Files</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
