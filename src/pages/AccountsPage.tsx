import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserPlus, 
  Trash2, 
  Copy, 
  Check, 
  Clock, 
  Calendar, 
  Fingerprint, 
  ShieldAlert, 
  Sparkles,
  AlertCircle,
  Upload,
  RotateCcw,
  Palette
} from 'lucide-react';
import { OfflineAccount } from '../types/launcher';
import { ExplorerAvatar, PROFILE_ICONS, getProfileIconSymbol } from '../components/ExplorerAvatar';
import { SkinPreview } from '../components/SkinPreview';
import { tauriService } from '../services/tauri';

interface AccountsPageProps {
  accounts: OfflineAccount[];
  selectedAccount: OfflineAccount | null;
  onSelectAccount: (accountId: string) => Promise<void> | void;
  onCreateAccount: (username: string) => Promise<void> | void;
  onDeleteAccount: (accountId: string) => Promise<void> | void;
  onUpdateAvatar?: (accountId: string, avatarType: string, avatarData?: string) => Promise<void> | void;
  onUpdateSkin?: (accountId: string, skinData?: string, skinModel?: 'classic' | 'slim') => Promise<void> | void;
  onUpdateProfileIcon?: (accountId: string, profileIcon: string) => Promise<void> | void;
  isMinecraftRunning: boolean;
}

export const AccountsPage: React.FC<AccountsPageProps> = ({
  accounts = [],
  selectedAccount = null,
  onSelectAccount,
  onCreateAccount,
  onDeleteAccount,
  onUpdateAvatar,
  onUpdateSkin,
  onUpdateProfileIcon,
  isMinecraftRunning = false,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copiedUuid, setCopiedUuid] = useState<string | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<OfflineAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile Customization Modal state
  const [customizingAccount, setCustomizingAccount] = useState<OfflineAccount | null>(null);
  const [selectedProfileIcon, setSelectedProfileIcon] = useState('moon');
  const [selectedSkinModel, setSelectedSkinModel] = useState<'classic' | 'slim'>('classic');
  const [skinDataUrl, setSkinDataUrl] = useState<string | null>(null);
  const [selectedAvatarType, setSelectedAvatarType] = useState<'default' | 'custom' | 'skin'>('default');
  const [avatarPreviewData, setAvatarPreviewData] = useState<string | null>(null);
  const [isSavingCustomization, setIsSavingCustomization] = useState(false);

  // Validate username in real-time
  const validateUsername = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) {
      return 'Account username cannot be empty.';
    }
    if (trimmed.length < 3) {
      return 'Username must be at least 3 characters long.';
    }
    if (trimmed.length > 16) {
      return 'Username cannot exceed 16 characters.';
    }
    const validPattern = /^[a-zA-Z0-9_]+$/;
    if (!validPattern.test(trimmed)) {
      return 'Only letters, numbers, and underscores are allowed.';
    }
    const duplicate = accounts.some(
      (acc) => acc.username.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      return `An account named "${trimmed}" already exists.`;
    }
    return null;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewUsername(val);
    if (val.length > 0) {
      setValidationError(validateUsername(val));
    } else {
      setValidationError(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateUsername(newUsername);
    if (error) {
      setValidationError(error);
      return;
    }

    try {
      setIsSubmitting(true);
      await onCreateAccount(newUsername.trim());
      setNewUsername('');
      setValidationError(null);
      setIsCreating(false);
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to create offline account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyUuid = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    setCopiedUuid(uuid);
    setTimeout(() => {
      setCopiedUuid(null);
    }, 2000);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never played';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const handleOpenCustomizationModal = (account: OfflineAccount) => {
    setCustomizingAccount(account);
    setSelectedProfileIcon(account.profileIcon || 'moon');
    setSelectedSkinModel(account.skinModel || 'classic');
    setSkinDataUrl(account.skinPath || null);
    setSelectedAvatarType(account.avatarType || 'default');
    setAvatarPreviewData(account.avatarPath || null);
  };

  const handleSkinFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Skin image file should be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSkinDataUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Avatar image file should be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setAvatarPreviewData(dataUrl);
      setSelectedAvatarType('custom');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCustomization = async () => {
    if (!customizingAccount) return;
    try {
      setIsSavingCustomization(true);
      if (onUpdateProfileIcon) {
        await onUpdateProfileIcon(customizingAccount.id, selectedProfileIcon);
      }
      if (onUpdateSkin) {
        await onUpdateSkin(customizingAccount.id, skinDataUrl || undefined, selectedSkinModel);
      }
      if (onUpdateAvatar) {
        await onUpdateAvatar(
          customizingAccount.id,
          selectedAvatarType,
          selectedAvatarType === 'custom' ? (avatarPreviewData || undefined) : undefined
        );
      }
      setCustomizingAccount(null);
    } catch (err) {
      console.error('Failed to save customization:', err);
    } finally {
      setIsSavingCustomization(false);
    }
  };

  return (
    <div className="desktop-page-container">
      {/* 1. Header Row */}
      <div className="archive-toolbar">
        <div className="archive-title-block">
          <h2 className="archive-main-title">MINECRAFT ACCOUNTS</h2>
          <span className="archive-main-desc">
            Offline Minecraft player profiles with deterministic UUIDs, custom skins, and local profile icons.
          </span>
        </div>

        <div className="toolbar-action-group">
          {isMinecraftRunning && (
            <div className="running-game-pill" title="Minecraft is currently running">
              <ShieldAlert size={14} />
              <span>Game Running (Accounts Locked)</span>
            </div>
          )}

          {!isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="btn-primary-wood"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px' }}
            >
              <UserPlus size={16} strokeWidth={2.4} />
              <span>Add Account</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. New Account Creation Form (Collapsible Card) */}
      {isCreating && (
        <div className="roster-create-card">
          <div className="create-card-header">
            <div className="create-card-title-group">
              <Sparkles size={16} color="#788B55" />
              <h3 className="create-card-title">Add Offline Account</h3>
            </div>
            <span className="create-card-badge">Offline Mode</span>
          </div>

          <form onSubmit={handleCreateSubmit} className="create-card-form">
            <p className="create-card-instruction">
              Enter a Minecraft username. Volume Launcher generates a deterministic offline UUID
              matching Mojang's offline player protocol (<code>OfflinePlayer:username</code>).
            </p>

            <div className="create-input-row">
              <div className="create-input-field-wrap">
                <input
                  type="text"
                  value={newUsername}
                  onChange={handleUsernameChange}
                  placeholder="e.g. Steve, Alex, or Player1"
                  className={`create-username-input ${validationError ? 'input-error' : ''}`}
                  maxLength={16}
                  autoFocus
                  disabled={isSubmitting}
                />
                <span className="char-count-pill">{newUsername.length}/16</span>
              </div>

              <div className="create-form-actions">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setNewUsername('');
                    setValidationError(null);
                  }}
                  className="roster-btn secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="roster-btn primary"
                  disabled={isSubmitting || !newUsername.trim() || !!validationError}
                >
                  {isSubmitting ? 'Adding...' : 'Add Account'}
                </button>
              </div>
            </div>

            {validationError && (
              <div className="create-validation-message error">
                <AlertCircle size={14} />
                <span>{validationError}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* 3. Active Profile Plaque */}
      {selectedAccount && (
        <div className="active-explorer-showcase">
          <div className="showcase-avatar-col">
            <ExplorerAvatar
              username={selectedAccount.username}
              uuid={selectedAccount.uuid}
              avatarType={selectedAccount.avatarType}
              avatarPath={selectedAccount.avatarPath}
              profileIcon={selectedAccount.profileIcon}
              size={64}
              className="showcase-avatar"
            />
            <button
              type="button"
              onClick={() => handleOpenCustomizationModal(selectedAccount)}
              className="btn-secondary-wood"
              style={{
                marginTop: '8px',
                fontSize: '11px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              title="Customize profile skin & icon"
            >
              <Palette size={12} />
              <span>Skin & Icon</span>
            </button>
          </div>

          <div className="showcase-details-col">
            <div className="showcase-headline-row">
              <div className="showcase-name-lockup">
                <span className="showcase-badge">ACTIVE MINECRAFT ACCOUNT</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 className="showcase-username">{selectedAccount.username}</h3>
                  <span style={{ fontSize: '18px' }} title={`Profile Icon: ${getProfileIconSymbol(selectedAccount.profileIcon)}`}>
                    {getProfileIconSymbol(selectedAccount.profileIcon)}
                  </span>
                </div>
              </div>

              <div className="showcase-meta-chips">
                <div className="meta-chip">
                  <Clock size={12} />
                  <span>Last Played: {formatDate(selectedAccount.lastPlayedAt)}</span>
                </div>
                <div className="meta-chip">
                  <Calendar size={12} />
                  <span>Created: {formatDate(selectedAccount.createdAt)}</span>
                </div>
              </div>
            </div>

            <div className="showcase-uuid-box">
              <div className="uuid-label-group">
                <Fingerprint size={13} />
                <span>OFFLINE UUID</span>
              </div>
              <code className="uuid-display-code">{selectedAccount.uuid}</code>
              <button
                type="button"
                onClick={() => handleCopyUuid(selectedAccount.uuid)}
                className={`copy-uuid-btn ${copiedUuid === selectedAccount.uuid ? 'copied' : ''}`}
                title="Copy offline UUID"
              >
                {copiedUuid === selectedAccount.uuid ? (
                  <>
                    <Check size={12} />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Full Accounts Roster Grid */}
      <div className="roster-list-container">
        <div className="roster-section-header">
          <div className="section-title-wrap">
            <Users size={16} color="#788B55" />
            <h3 className="roster-section-title">ALL MINECRAFT ACCOUNTS</h3>
            <span className="roster-count-badge">{accounts.length}</span>
          </div>
        </div>

        <div className="roster-cards-grid">
          {accounts.map((acc) => {
            const isSelected = selectedAccount?.id === acc.id;
            const canDelete = accounts.length > 1;

            return (
              <div
                key={acc.id}
                className={`explorer-roster-card ${isSelected ? 'active-card' : ''}`}
              >
                <div className="card-main-content">
                  <div className="card-avatar-wrap">
                    <ExplorerAvatar
                      username={acc.username}
                      uuid={acc.uuid}
                      avatarType={acc.avatarType}
                      avatarPath={acc.avatarPath}
                      profileIcon={acc.profileIcon}
                      size={42}
                    />
                  </div>

                  <div className="card-info-wrap">
                    <div className="card-title-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h4 className="card-username">{acc.username}</h4>
                        <span style={{ fontSize: '14px' }}>{getProfileIconSymbol(acc.profileIcon)}</span>
                      </div>
                      {isSelected && (
                        <span className="card-active-pill">ACTIVE</span>
                      )}
                    </div>

                    <div className="card-meta-row">
                      <span className="card-meta-text">
                        Last played: {formatDate(acc.lastPlayedAt)}
                      </span>
                    </div>

                    <div className="card-uuid-row">
                      <span className="card-uuid-truncated" title={acc.uuid}>
                        {acc.uuid}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyUuid(acc.uuid)}
                        className="card-copy-btn"
                        title="Copy UUID"
                      >
                        {copiedUuid === acc.uuid ? (
                          <Check size={11} color="#526B45" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card-actions-block">
                  <button
                    type="button"
                    onClick={() => handleOpenCustomizationModal(acc)}
                    className="roster-delete-btn"
                    title={`Customize skin & icon for ${acc.username}`}
                    style={{ color: '#746454' }}
                  >
                    <Palette size={14} />
                  </button>

                  {isSelected ? (
                    <div className="selected-indicator-chip" title="Current account">
                      <UserCheck size={14} />
                      <span>Selected</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelectAccount(acc.id)}
                      disabled={isMinecraftRunning}
                      className="roster-select-btn"
                      title={
                        isMinecraftRunning
                          ? 'Cannot switch accounts while Minecraft is running'
                          : `Select ${acc.username}`
                      }
                    >
                      Select
                    </button>
                  )}

                  <button
                    onClick={() => setAccountToDelete(acc)}
                    disabled={!canDelete}
                    className="roster-delete-btn"
                    title={
                      isMinecraftRunning
                        ? 'Cannot delete while Minecraft is running'
                        : accounts.length <= 1
                        ? 'Cannot delete the only remaining account'
                        : `Delete ${acc.username}`
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Delete Confirmation Modal */}
      {accountToDelete && (
        <div className="modal-backdrop">
          <div className="modal-journal-box">
            <div className="modal-journal-header">
              <div className="header-title-group">
                <AlertCircle size={18} color="#B86F52" />
                <h3 className="modal-journal-title">DELETE ACCOUNT</h3>
              </div>
              <button
                onClick={() => setAccountToDelete(null)}
                className="modal-close-btn"
                title="Cancel"
              >
                ✕
              </button>
            </div>

            <div className="modal-journal-body">
              <p className="modal-journal-warning">
                Are you sure you want to delete <strong>{accountToDelete.username}</strong> from Volume Launcher?
              </p>
              <div className="modal-account-preview">
                <ExplorerAvatar
                  username={accountToDelete.username}
                  uuid={accountToDelete.uuid}
                  profileIcon={accountToDelete.profileIcon}
                  size={36}
                />
                <div className="preview-meta">
                  <span className="preview-name">{accountToDelete.username}</span>
                  <code className="preview-uuid">{accountToDelete.uuid}</code>
                </div>
              </div>
              {selectedAccount?.id === accountToDelete.id && (
                <div className="delete-active-notice">
                  <AlertCircle size={14} />
                  <span>
                    This is your currently active account. Volume Launcher will automatically switch
                    to another account upon deletion.
                  </span>
                </div>
              )}
            </div>

            <div className="modal-journal-footer">
              <button
                type="button"
                onClick={() => setAccountToDelete(null)}
                className="roster-btn secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = accountToDelete;
                  setAccountToDelete(null);
                  if (target) {
                    await onDeleteAccount(target.id);
                  }
                }}
                className="roster-btn danger"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Skin & Profile Icon Customization Modal */}
      {customizingAccount && (
        <div className="modal-backdrop">
          <div className="modal-journal-box" style={{ maxWidth: '520px', width: '92%' }}>
            <div className="modal-journal-header">
              <div className="header-title-group">
                <Palette size={18} color="#526B45" />
                <h3 className="modal-journal-title">CUSTOMIZE ACCOUNT & PROFILE</h3>
              </div>
              <button
                onClick={() => setCustomizingAccount(null)}
                className="modal-close-btn"
                title="Cancel"
              >
                ✕
              </button>
            </div>

            <div className="modal-journal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Profile Icon Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '8px' }}>
                  VOLUME PROFILE ICON
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  {PROFILE_ICONS.map((icon) => {
                    const isSelected = selectedProfileIcon === icon.id;
                    return (
                      <button
                        key={icon.id}
                        type="button"
                        onClick={() => setSelectedProfileIcon(icon.id)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '10px 4px',
                          borderRadius: '6px',
                          border: isSelected ? '2px solid #526B45' : '1px solid #D5C0A0',
                          background: isSelected ? '#E0E8DC' : '#FAF4E8',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontSize: '20px' }}>{icon.symbol}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: isSelected ? '#3F5938' : '#746454' }}>
                          {icon.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Skin Section */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '8px' }}>
                  MINECRAFT SKIN CUSTOMIZATION
                </label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <SkinPreview
                    skinDataUrl={skinDataUrl}
                    skinModel={selectedSkinModel}
                    width={96}
                    height={136}
                  />

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <span style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#746454', marginBottom: '4px' }}>
                        MODEL TYPE
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedSkinModel('classic')}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            border: selectedSkinModel === 'classic' ? '2px solid #526B45' : '1px solid #D5C0A0',
                            background: selectedSkinModel === 'classic' ? '#E0E8DC' : '#FAF4E8',
                            color: selectedSkinModel === 'classic' ? '#3F5938' : '#746454',
                            cursor: 'pointer',
                          }}
                        >
                          Classic (4px)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedSkinModel('slim')}
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            border: selectedSkinModel === 'slim' ? '2px solid #526B45' : '1px solid #D5C0A0',
                            background: selectedSkinModel === 'slim' ? '#E0E8DC' : '#FAF4E8',
                            color: selectedSkinModel === 'slim' ? '#3F5938' : '#746454',
                            cursor: 'pointer',
                          }}
                        >
                          Slim / Alex (3px)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <label
                        className="btn-primary-wood"
                        style={{
                          flex: 1,
                          padding: '7px 10px',
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        <Upload size={13} />
                        <span>Upload Skin (.png)</span>
                        <input
                          type="file"
                          accept=".png,image/png"
                          onChange={handleSkinFileSelect}
                          style={{ display: 'none' }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={async () => {
                          const picked = await tauriService.pickSkinFile();
                          if (picked) {
                            setSkinDataUrl(picked);
                          }
                        }}
                        className="btn-secondary-wood"
                        style={{ padding: '7px 12px', fontSize: '11px' }}
                        title="Browse computer for skin PNG file"
                      >
                        Browse
                      </button>

                      {skinDataUrl && (
                        <button
                          type="button"
                          onClick={() => setSkinDataUrl(null)}
                          className="btn-secondary-wood"
                          style={{ padding: '7px 10px', fontSize: '11px', color: '#B86F52' }}
                          title="Clear custom skin"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Avatar Icon / Monogram option */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5E4E3D', marginBottom: '8px' }}>
                  LAUNCHER AVATAR STYLE
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAvatarType('default');
                      setAvatarPreviewData(null);
                    }}
                    className={`roster-btn ${selectedAvatarType === 'default' ? 'primary' : 'secondary'}`}
                    style={{ flex: 1, padding: '7px 10px', fontSize: '11px', justifyContent: 'center' }}
                  >
                    <RotateCcw size={13} />
                    <span>Monogram & Icon</span>
                  </button>
                  <label
                    className={`roster-btn ${selectedAvatarType === 'custom' ? 'primary' : 'secondary'}`}
                    style={{ flex: 1, padding: '7px 10px', fontSize: '11px', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Upload size={13} />
                    <span>Custom Picture</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFileSelect}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-journal-footer">
              <button
                type="button"
                onClick={() => setCustomizingAccount(null)}
                className="roster-btn secondary"
                disabled={isSavingCustomization}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomization}
                className="roster-btn primary"
                disabled={isSavingCustomization}
              >
                {isSavingCustomization ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
