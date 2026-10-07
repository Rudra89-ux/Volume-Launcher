import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { PlayBar } from './components/PlayBar';
import { HomePage } from './pages/HomePage';
import { InstancesPage } from './pages/InstancesPage';
import { VersionsPage } from './pages/VersionsPage';
import { ModsPage } from './pages/ModsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountsPage } from './pages/AccountsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NewVersionModal } from './components/NewVersionModal';
import { LaunchConsoleModal } from './components/LaunchConsoleModal';
import {
  INITIAL_VERSIONS,
  INITIAL_SETTINGS,
} from './data/mockData';
import {
  NavigationTab,
  MinecraftVersion,
  LauncherSettings,
  LaunchState,
  ActiveInstallState,
  OfflineAccount,
  Instance,
} from './types/launcher';
import {
  tauriService,
  InstallProgress,
  JavaInfo,
} from './services/tauri';

function playWoodClickSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Ignore audio failures if restricted by browser policy
  }
}

export function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('home');

  // Persistence in localStorage as fallback / cache
  const [versions, setVersions] = useState<MinecraftVersion[]>(() => {
    const saved = localStorage.getItem('volume_versions');
    return saved ? JSON.parse(saved) : INITIAL_VERSIONS;
  });

  const [selectedVersion, setSelectedVersion] = useState<MinecraftVersion>(() => {
    const savedId = localStorage.getItem('volume_selected_version_id');
    if (savedId) {
      const match = versions.find((v) => v.id === savedId);
      if (match) return match;
    }
    const firstRel = versions.find((v) => v.type === 'release');
    return firstRel || versions[0];
  });

  const [settings, setSettings] = useState<LauncherSettings>(() => {
    const saved = localStorage.getItem('volume_settings');
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });

  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);

  const [launchState, setLaunchState] = useState<LaunchState>('idle');
  const [launchLogs, setLaunchLogs] = useState<string[]>([
    `[INFO] Volume Launcher initialized in Earthy Minecraft Theme.`,
    `[INFO] Backend initialized: isolated directory at data/minecraft/`,
  ]);

  const [activeInstall, setActiveInstall] = useState<ActiveInstallState | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState<boolean>(false);
  const [detectedJava, setDetectedJava] = useState<JavaInfo | null>(null);

  const [accounts, setAccounts] = useState<OfflineAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<OfflineAccount | null>(null);

  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [isConsoleModalOpen, setIsConsoleModalOpen] = useState(false);

  // Keep ref for active launchState to avoid stale closures in listeners
  const launchStateRef = useRef(launchState);
  useEffect(() => {
    launchStateRef.current = launchState;
  }, [launchState]);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('volume_versions', JSON.stringify(versions));
  }, [versions]);

  useEffect(() => {
    localStorage.setItem('volume_settings', JSON.stringify(settings));
  }, [settings]);

  // ============================================================================
  // BACKEND INTEGRATION: MANIFEST, JAVA, SETTINGS, PROGRESS
  // ============================================================================

  const fetchVersions = useCallback(async () => {
    setIsLoadingVersions(true);
    try {
      const remoteVersions = await tauriService.getMinecraftVersions();
      if (remoteVersions && remoteVersions.length > 0) {
        const mapped: MinecraftVersion[] = remoteVersions.map((v) => ({
          id: v.id,
          name: v.name,
          type: v.type,
          typeLabel: v.type === 'release' ? 'Vanilla Release' : 'Experimental Snapshot',
          installed: v.installed,
          releaseDate: v.releaseDate || 'Mojang Archive',
          size: v.size || '~500 MB',
          description: v.description || `Official Minecraft ${v.id} package from Mojang.`,
          isDefault: v.type === 'release',
        }));

        setVersions(mapped);

        // Keep selected version if still present, or restore from localStorage, or pick first release
        const targetSavedId = localStorage.getItem('volume_selected_version_id');
        setSelectedVersion((prev) => {
          if (targetSavedId) {
            const matchSaved = mapped.find((v) => v.id === targetSavedId);
            if (matchSaved) return matchSaved;
          }
          const matching = mapped.find((v) => v.id === prev.id);
          if (matching) return matching;
          const firstRelease = mapped.find((v) => v.type === 'release');
          return firstRelease || mapped[0];
        });

        setLaunchLogs((prev) => [
          ...prev,
          `[MANIFEST] Synchronized Mojang official version manifest (${remoteVersions.length} versions cataloged).`,
        ]);
      }
    } catch (err: any) {
      console.warn('Could not sync Mojang version manifest:', err);
      setLaunchLogs((prev) => [
        ...prev,
        `[NOTICE] Operating with cached version archive. (Offline or remote manifest unavailable)`,
      ]);
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);

  const runJavaDetection = useCallback(async () => {
    try {
      const java = await tauriService.detectJava(21);
      setDetectedJava(java);
      if (java && java.is_valid) {
        setSettings((prev) => ({
          ...prev,
          javaExecutablePath: java.path,
          javaVersion: `Java ${java.major_version} (${java.version})`,
        }));
        setLaunchLogs((prev) => [
          ...prev,
          `[JAVA] Verified runtime: Java ${java.major_version} (${java.version}) at ${java.path}`,
        ]);
      } else {
        setLaunchLogs((prev) => [
          ...prev,
          `[WARN] Java detection notice: Java 21+ not found. Minecraft 1.20.5+ requires Java 21.`,
        ]);
      }
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[WARN] Java detection: ${err?.message || err}`,
      ]);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const list = await tauriService.getOfflineAccounts();
      setAccounts(list);
      const selected = await tauriService.getSelectedOfflineAccount();
      if (selected) {
        setSelectedAccount(selected);
      } else if (list.length > 0) {
        setSelectedAccount(list[0]);
      }
    } catch (err: any) {
      console.warn('Could not sync offline accounts:', err);
    }
  }, []);

  const fetchInstances = useCallback(async () => {
    try {
      const list = await tauriService.getInstances();
      setInstances(list);
      if (list.length > 0) {
        setSelectedInstance((prev) => {
          if (!prev) return list[0];
          const match = list.find((i) => i.id === prev.id);
          return match || list[0];
        });
      }
    } catch (err: any) {
      console.warn('Could not sync instances:', err);
    }
  }, []);

  // Initialize backend connection on mount
  useEffect(() => {
    // 0. Load offline accounts & instances
    fetchAccounts();
    fetchInstances();

    // 1. Load backend settings
    tauriService.getLauncherSettings().then((backendSettings) => {
      setSettings((prev) => ({
        ...prev,
        gameDirectory: backendSettings.gameDirectory || prev.gameDirectory,
        allocatedRamGb: backendSettings.allocatedRamGb ?? prev.allocatedRamGb,
        maxRamGb: backendSettings.maxRamGb ?? prev.maxRamGb,
        javaExecutablePath: backendSettings.javaExecutablePath || prev.javaExecutablePath,
        javaVersion: backendSettings.javaVersion || prev.javaVersion,
        resolutionWidth: backendSettings.resolutionWidth ?? prev.resolutionWidth,
        resolutionHeight: backendSettings.resolutionHeight ?? prev.resolutionHeight,
        fullscreen: backendSettings.fullscreen ?? prev.fullscreen,
        selectedVersion: backendSettings.selectedVersion || prev.selectedVersion,
        guiScale: backendSettings.guiScale ?? prev.guiScale,
        closeLauncherOnStart: backendSettings.closeLauncherOnStart ?? prev.closeLauncherOnStart,
        checkUpdates: backendSettings.checkUpdates ?? prev.checkUpdates,
        soundEffects: backendSettings.soundEffects ?? prev.soundEffects,
        enableVolumeProfileIntegration: backendSettings.enableVolumeProfileIntegration ?? prev.enableVolumeProfileIntegration ?? true,
      }));

      if (backendSettings.selectedVersion) {
        localStorage.setItem('volume_selected_version_id', backendSettings.selectedVersion);
        setVersions((currentVersions) => {
          const match = currentVersions.find((v) => v.id === backendSettings.selectedVersion);
          if (match) setSelectedVersion(match);
          return currentVersions;
        });
      }
    }).catch(() => {});

    // 2. Detect Java
    runJavaDetection();

    // 3. Fetch version manifest
    fetchVersions();

    // 4. Subscribe to download / install progress events
    const unlistenPromise = tauriService.onInstallProgress((progress: InstallProgress) => {
      let pct = 0;
      if (progress.stage === 'complete') {
        pct = 100;
      } else if (progress.total > 0) {
        pct = Math.round((progress.current / progress.total) * 100);
      } else if (progress.bytes_total > 0) {
        pct = Math.round((progress.bytes_downloaded / progress.bytes_total) * 100);
      }

      setActiveInstall({
        versionId: progress.version,
        stage: progress.stage,
        current: progress.current,
        total: progress.total,
        bytesDownloaded: progress.bytes_downloaded,
        bytesTotal: progress.bytes_total,
        currentFile: progress.current_file,
        message: progress.message,
        percentage: pct,
      });

      if (progress.stage === 'complete') {
        setVersions((prev) =>
          prev.map((v) => (v.id === progress.version ? { ...v, installed: true } : v))
        );
        setSelectedVersion((prev) =>
          prev.id === progress.version ? { ...prev, installed: true } : prev
        );
        setActiveInstall(null);
        setLaunchLogs((prev) => [
          ...prev,
          `[INSTALL] Minecraft ${progress.version} installation complete & verified!`,
        ]);
      } else if (progress.stage === 'error') {
        setActiveInstall(null);
        if (launchStateRef.current === 'downloading') {
          setLaunchState('error');
        }
        setLaunchLogs((prev) => [
          ...prev,
          `[ERROR] Installation failed for ${progress.version}: ${progress.message || 'Unknown error'}`,
        ]);
      } else {
        // Log milestone steps
        if (
          progress.current === 1 ||
          progress.current === progress.total ||
          progress.current % 100 === 0
        ) {
          const file = progress.current_file ? ` (${progress.current_file})` : '';
          setLaunchLogs((prev) => [
            ...prev,
            `[INSTALL] [${progress.stage.toUpperCase()}] ${progress.current}/${progress.total}${file}`,
          ]);
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten: any) => {
        if (typeof unlisten === 'function') unlisten();
      }).catch(() => {});
    };
  }, [fetchVersions, runJavaDetection, fetchAccounts]);

  // Periodic Process Monitoring when launching or running
  useEffect(() => {
    if (launchState !== 'running' && launchState !== 'launching' && launchState !== 'stopping') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const state = await tauriService.getMinecraftProcessState();
        if (state.status === 'running') {
          if (launchStateRef.current !== 'running') {
            setLaunchState('running');
          }
        } else if (state.status === 'stopped' || state.status === 'idle') {
          if (launchStateRef.current === 'running' || launchStateRef.current === 'stopping') {
            setLaunchState('idle');
            setLaunchLogs((prev) => [
              ...prev,
              `[PROCESS] Minecraft session finished (exit code: ${state.exit_code ?? 0}). World state preserved.`,
            ]);
          }
        } else if (state.status === 'error') {
          setLaunchState('error');
          setLaunchLogs((prev) => [
            ...prev,
            `[ERROR] Minecraft process error: ${state.error_message || 'Process terminated unexpectedly.'}`,
          ]);
        }
      } catch (err) {
        console.warn('Process poll error:', err);
      }
    }, 1200);

    return () => clearInterval(interval);
  }, [launchState]);

  // ============================================================================
  // USER ACTIONS: NAVIGATION, INSTALL, LAUNCH, STOP, SETTINGS
  // ============================================================================

  const handleTabChange = (tab: NavigationTab) => {
    if (settings.soundEffects) playWoodClickSound();
    setCurrentTab(tab);
  };

  const handleSelectVersion = (ver: MinecraftVersion) => {
    if (settings.soundEffects) playWoodClickSound();
    setSelectedVersion(ver);
    localStorage.setItem('volume_selected_version_id', ver.id);
    tauriService.saveLauncherSettings({
      ...settings,
      selectedVersion: ver.id,
    }).catch(() => {});
  };

  const handleSelectAccount = async (accountId: string) => {
    if (settings.soundEffects) playWoodClickSound();
    if (launchState === 'running' || launchState === 'launching') {
      setLaunchLogs((prev) => [
        ...prev,
        `[WARN] Cannot switch account while Minecraft is running!`,
      ]);
      return;
    }
    try {
      const switched = await tauriService.selectOfflineAccount(accountId);
      setSelectedAccount(switched);
      setLaunchLogs((prev) => [
        ...prev,
        `[AUTH] Switched active account to ${switched.username} (${switched.uuid}).`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to switch account: ${err?.message || err}`,
      ]);
    }
  };

  const handleCreateAccount = async (username: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const created = await tauriService.createOfflineAccount(username);
      setAccounts((prev) => [...prev, created]);
      setSelectedAccount(created);
      setLaunchLogs((prev) => [
        ...prev,
        `[AUTH] Created account "${created.username}" (Deterministic UUID: ${created.uuid}).`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to create account: ${err?.message || err}`,
      ]);
      throw err;
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (settings.soundEffects) playWoodClickSound();
    if (launchState === 'running' || launchState === 'launching') {
      setLaunchLogs((prev) => [
        ...prev,
        `[WARN] Cannot delete account while Minecraft is running!`,
      ]);
      return;
    }
    try {
      await tauriService.deleteOfflineAccount(accountId);
      const remaining = await tauriService.getOfflineAccounts();
      setAccounts(remaining);
      const active = await tauriService.getSelectedOfflineAccount();
      setSelectedAccount(active);
      setLaunchLogs((prev) => [
        ...prev,
        `[AUTH] Deleted account. Active account: ${active?.username || 'DevExplorer'}.`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to delete account: ${err?.message || err}`,
      ]);
    }
  };

  const handleUpdateAvatar = async (accountId: string, avatarType: string, avatarData?: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const updated = await tauriService.setAccountAvatar(accountId, avatarType, avatarData);
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAccount?.id === updated.id) {
        setSelectedAccount(updated);
      }
      setLaunchLogs((prev) => [
        ...prev,
        `[PROFILE] Updated avatar for ${updated.username} (${avatarType}).`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to update avatar: ${err?.message || err}`,
      ]);
    }
  };

  const handleUpdateSkin = async (accountId: string, skinData?: string, skinModel?: 'classic' | 'slim') => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const updated = await tauriService.setAccountSkin(accountId, skinData, skinModel);
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAccount?.id === updated.id) {
        setSelectedAccount(updated);
      }
      setLaunchLogs((prev) => [
        ...prev,
        `[PROFILE] Updated skin for ${updated.username} (${skinModel || 'classic'}).`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to update skin: ${err?.message || err}`,
      ]);
    }
  };

  const handleUpdateProfileIcon = async (accountId: string, profileIcon: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const updated = await tauriService.setAccountProfileIcon(accountId, profileIcon);
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      if (selectedAccount?.id === updated.id) {
        setSelectedAccount(updated);
      }
      setLaunchLogs((prev) => [
        ...prev,
        `[PROFILE] Updated profile icon for ${updated.username}.`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to update profile icon: ${err?.message || err}`,
      ]);
    }
  };

  const handleSelectInstance = async (instanceId: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const switched = await tauriService.selectInstance(instanceId);
      setSelectedInstance(switched);
      setLaunchLogs((prev) => [
        ...prev,
        `[INSTANCE] Active instance: "${switched.name}" (Loader: ${switched.loader})`,
      ]);
      // If instance has matching version in version catalog, select it
      const matchVer = versions.find((v) => v.id === switched.versionId);
      if (matchVer) {
        handleSelectVersion(matchVer);
      }
    } catch (err: any) {
      console.warn('Failed to select instance:', err);
    }
  };

  const handleCreateInstance = async (name: string, versionId: string, loader: string, fabricVersion?: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const created = await tauriService.createInstance(name, versionId, loader, fabricVersion);
      setInstances((prev) => [...prev, created]);
      setSelectedInstance(created);
      setLaunchLogs((prev) => [
        ...prev,
        `[INSTANCE] Created new instance "${created.name}" (${created.loader} ${created.versionId})`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to create instance: ${err?.message || err}`,
      ]);
      throw err;
    }
  };

  const handleUpdateInstance = async (instance: Instance) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const updated = await tauriService.updateInstance(instance);
      setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      if (selectedInstance?.id === updated.id) {
        setSelectedInstance(updated);
      }
      setLaunchLogs((prev) => [
        ...prev,
        `[INSTANCE] Updated settings for "${updated.name}".`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to update instance: ${err?.message || err}`,
      ]);
      throw err;
    }
  };

  const handleDuplicateInstance = async (instanceId: string, newName: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      const duplicated = await tauriService.duplicateInstance(instanceId, newName);
      setInstances((prev) => [...prev, duplicated]);
      setSelectedInstance(duplicated);
      setLaunchLogs((prev) => [
        ...prev,
        `[INSTANCE] Duplicated instance as "${duplicated.name}".`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to duplicate instance: ${err?.message || err}`,
      ]);
      throw err;
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      await tauriService.deleteInstance(instanceId);
      const remaining = await tauriService.getInstances();
      setInstances(remaining);
      const active = await tauriService.getSelectedInstance();
      setSelectedInstance(active || (remaining.length > 0 ? remaining[0] : null));
      setLaunchLogs((prev) => [
        ...prev,
        `[INSTANCE] Deleted instance.`,
      ]);
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to delete instance: ${err?.message || err}`,
      ]);
      throw err;
    }
  };

  const handleOpenInstanceFolder = (instanceId: string) => {
    tauriService.openInstanceFolder(instanceId).catch(console.warn);
  };

  const handleLaunchInstance = async (instance: Instance) => {
    await handleSelectInstance(instance.id);
    const matchVer = versions.find((v) => v.id === instance.versionId);
    handleLaunch(matchVer);
  };

  const handleInstallVersion = async (ver: MinecraftVersion) => {
    if (settings.soundEffects) playWoodClickSound();
    try {
      setLaunchLogs((prev) => [
        ...prev,
        `----------------------------------------------------`,
        `[INSTALL] Initiating download pipeline for ${ver.name} (${ver.id})...`,
        `[INSTALL] Fetching metadata, client JAR, libraries & asset index...`,
      ]);
      await tauriService.installMinecraftVersion(ver.id);
      setVersions((prev) =>
        prev.map((v) => (v.id === ver.id ? { ...v, installed: true } : v))
      );
      handleSelectVersion({ ...ver, installed: true });
    } catch (err: any) {
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Failed to install ${ver.name}: ${err?.message || err}`,
      ]);
    }
  };

  const handleStop = async () => {
    if (settings.soundEffects) playWoodClickSound();
    setLaunchState('stopping');
    setLaunchLogs((prev) => [
      ...prev,
      `[PROCESS] Sending graceful stop signal to Minecraft client...`,
    ]);
    try {
      await tauriService.stopMinecraft();
      setLaunchState('idle');
      setLaunchLogs((prev) => [
        ...prev,
        `[INFO] Minecraft process terminated. Game state safely concluded.`,
      ]);
    } catch (err: any) {
      setLaunchState('idle');
      setLaunchLogs((prev) => [
        ...prev,
        `[WARN] Stop notice: ${err?.message || err}`,
      ]);
    }
  };

  const handleLaunch = async (versionOverride?: MinecraftVersion) => {
    if (settings.soundEffects) playWoodClickSound();

    if (launchState === 'running') {
      await handleStop();
      return;
    }

    if (launchState !== 'idle' && launchState !== 'error') {
      return;
    }

    const targetVersion = versionOverride || selectedVersion;
    if (versionOverride && versionOverride.id !== selectedVersion.id) {
      handleSelectVersion(versionOverride);
    }

    try {
      // 1. If version is not yet installed, install it automatically first!
      if (!targetVersion.installed) {
        setLaunchState('downloading');
        setLaunchLogs((prev) => [
          ...prev,
          `----------------------------------------------------`,
          `[GAME] Preparing launch for ${targetVersion.name} (${targetVersion.id})`,
          `[INSTALL] Version ${targetVersion.name} (${targetVersion.id}) not found locally.`,
          `[INSTALL] Starting automated download & verification pipeline...`,
        ]);

        await tauriService.installMinecraftVersion(targetVersion.id);

        setVersions((prev) =>
          prev.map((v) => (v.id === targetVersion.id ? { ...v, installed: true } : v))
        );
        setSelectedVersion((prev) =>
          prev.id === targetVersion.id ? { ...prev, installed: true } : prev
        );
      }

      // 2. Prepare launch parameters
      setLaunchState('preparing');
      setLaunchLogs((prev) => [
        ...prev,
        `----------------------------------------------------`,
        `[GAME] Target Version: ${targetVersion.name} (${targetVersion.typeLabel})`,
        selectedInstance ? `[INSTANCE] Instance: ${selectedInstance.name} (loader: ${selectedInstance.loader})` : `[INSTANCE] Default instance`,
        `[JVM] Memory: ${settings.allocatedRamGb} GB (-Xmx${settings.allocatedRamGb}G -Xms2G)`,
        `[JVM] Account: ${selectedAccount?.username || 'DevExplorer'} (Deterministic Offline UUID: ${selectedAccount?.uuid || 'n/a'})`,
        `[JVM] Resolution: ${settings.resolutionWidth}x${settings.resolutionHeight} | GUI Scale: ${settings.guiScale ?? 3}`,
        `[PROCESS] Constructing classpath and spawning JVM child process...`,
      ]);

      setLaunchState('launching');
      const pid = await tauriService.launchMinecraft(targetVersion.id, selectedInstance?.id);

      setLaunchState('running');
      fetchAccounts(); // Refresh accounts so lastPlayedAt is immediately updated
      fetchInstances();
      setLaunchLogs((prev) => [
        ...prev,
        `[SUCCESS] [${new Date().toLocaleTimeString()}] Minecraft spawned successfully! (PID: ${pid})`,
        `[PROCESS] Tracking client process. Logs streamed to logs/minecraft_${targetVersion.id}.log`,
      ]);
    } catch (err: any) {
      setLaunchState('error');
      const errMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err);
      setLaunchLogs((prev) => [
        ...prev,
        `[ERROR] Launch failed: ${errMsg}`,
        `[HINT] Verify Java runtime in settings or check the game console logs.`,
      ]);
    }
  };

  const handleAddVersion = (newVer: MinecraftVersion) => {
    const updated = [newVer, ...versions];
    setVersions(updated);
    handleSelectVersion(newVer);
    setLaunchLogs((prev) => [
      ...prev,
      `[SUCCESS] Added custom version: ${newVer.name}`,
    ]);
  };

  const handleUpdateSettings = async (newSettings: LauncherSettings) => {
    setSettings(newSettings);
    try {
      await tauriService.saveLauncherSettings(newSettings);
    } catch (err) {
      console.warn('Could not persist settings to disk:', err);
    }
  };

  return (
    <div className="app-shell">
      {/* 1. Custom Native Desktop Titlebar */}
      <Header
        selectedAccount={selectedAccount}
        accounts={accounts}
        onSelectAccount={handleSelectAccount}
        onNavigateToAccounts={() => handleTabChange('accounts')}
        isMinecraftRunning={launchState === 'running' || launchState === 'launching'}
      />

      {/* 2. Middle Body: Navigation Rail Sidebar + Main Content Viewport */}
      <div className="app-middle-body">
        {/* Polished Wooden Navigation Rail Sidebar */}
        <Sidebar currentTab={currentTab} onSelectTab={handleTabChange} />

        {/* Scrollable Desktop Content Viewport */}
        <main className="content-viewport">
          {currentTab === 'home' && (
            <ErrorBoundary fallbackTitle="Could not load Expedition Home.">
              <HomePage
                selectedVersion={selectedVersion}
                instances={instances}
                selectedInstance={selectedInstance}
                onSelectInstance={handleSelectInstance}
                onLaunch={() => handleLaunch()}
                launchState={launchState}
                onNavigateToVersions={() => handleTabChange('versions')}
                detectedJavaLabel={detectedJava ? `Java ${detectedJava.major_version} (${detectedJava.version})` : settings.javaVersion}
                selectedAccount={selectedAccount}
                onNavigateToAccounts={() => handleTabChange('accounts')}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'instances' && (
            <ErrorBoundary fallbackTitle="Could not load Instances manager.">
              <InstancesPage
                instances={instances}
                selectedInstance={selectedInstance}
                onSelectInstance={handleSelectInstance}
                onLaunchInstance={handleLaunchInstance}
                onCreateInstance={handleCreateInstance}
                onUpdateInstance={handleUpdateInstance}
                onDuplicateInstance={handleDuplicateInstance}
                onDeleteInstance={handleDeleteInstance}
                onOpenFolder={handleOpenInstanceFolder}
                availableVersions={versions}
                isMinecraftRunning={launchState === 'running' || launchState === 'launching'}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'versions' && (
            <ErrorBoundary fallbackTitle="Could not load Versions catalog.">
              <VersionsPage
                versions={versions}
                selectedVersion={selectedVersion}
                activeInstall={activeInstall}
                onSelectVersion={handleSelectVersion}
                onLaunchVersion={(ver) => handleLaunch(ver)}
                onInstallVersion={handleInstallVersion}
                onOpenNewVersionModal={() => setIsNewVersionModalOpen(true)}
                onRefreshVersions={fetchVersions}
                isLoadingVersions={isLoadingVersions}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'accounts' && (
            <ErrorBoundary fallbackTitle="Could not load Minecraft Accounts.">
              <AccountsPage
                accounts={accounts}
                selectedAccount={selectedAccount}
                onSelectAccount={handleSelectAccount}
                onCreateAccount={handleCreateAccount}
                onDeleteAccount={handleDeleteAccount}
                onUpdateAvatar={handleUpdateAvatar}
                onUpdateSkin={handleUpdateSkin}
                onUpdateProfileIcon={handleUpdateProfileIcon}
                isMinecraftRunning={launchState === 'running' || launchState === 'launching'}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'mods' && (
            <ErrorBoundary fallbackTitle="Could not load Mods repository.">
              <ModsPage
                instances={instances}
                selectedInstance={selectedInstance}
                onSelectInstance={handleSelectInstance}
              />
            </ErrorBoundary>
          )}

          {currentTab === 'settings' && (
            <ErrorBoundary fallbackTitle="Could not load Configuration journal.">
              <SettingsPage
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                detectedJava={detectedJava}
                onRescanJava={runJavaDetection}
              />
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* 3. Bottom Persistent Handcrafted Wooden Launch Dock (Full Width) */}
      <PlayBar
        selectedVersion={selectedVersion}
        instances={instances}
        selectedInstance={selectedInstance}
        onSelectInstance={handleSelectInstance}
        launchState={launchState}
        detectedJavaLabel={detectedJava ? `Java ${detectedJava.major_version} (${detectedJava.version})` : settings.javaVersion}
        allocatedRamGb={settings.allocatedRamGb}
        onLaunch={() => handleLaunch()}
        onStop={handleStop}
        onOpenLogs={() => setIsConsoleModalOpen(true)}
        selectedAccount={selectedAccount}
        onNavigateToAccounts={() => handleTabChange('accounts')}
      />

      {/* Modals */}
      <NewVersionModal
        isOpen={isNewVersionModalOpen}
        onClose={() => setIsNewVersionModalOpen(false)}
        onAddVersion={handleAddVersion}
      />

      <LaunchConsoleModal
        isOpen={isConsoleModalOpen}
        onClose={() => setIsConsoleModalOpen(false)}
        logs={launchLogs}
        launchState={launchState}
        activeVersion={selectedVersion}
        activeInstanceName={selectedInstance?.name}
        onClearLogs={() => setLaunchLogs([])}
      />
    </div>
  );
}

export default App;
