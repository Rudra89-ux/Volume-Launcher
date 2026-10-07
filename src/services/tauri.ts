import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { 
  OfflineAccount, 
  Instance, 
  LocalMod, 
  VerificationResult, 
  FabricLoaderItem,
  InstanceWorldInfo,
  WorldBackupInfo,
  ModrinthMod,
  ResourcePackItem,
  ModUpdateInfo,
} from '../types/launcher';

export interface FrontendVersionInfo {
  id: string;
  name: string;
  type: string; // "release" | "snapshot"
  installed: boolean;
  releaseDate: string;
  size: string;
  description: string;
}

export interface InstallProgress {
  version: string;
  stage: 'manifest' | 'version' | 'client' | 'libraries' | 'assets' | 'natives' | 'verification' | 'complete' | 'error';
  current: number;
  total: number;
  bytes_downloaded: number;
  bytes_total: number;
  current_file: string;
  message?: string;
}

export interface JavaInfo {
  path: string;
  version: string;
  major_version: number;
  is_valid: boolean;
}

export interface ProcessState {
  status: 'idle' | 'preparing' | 'launching' | 'running' | 'stopping' | 'stopped' | 'error';
  version?: string;
  pid?: number;
  started_at?: string;
  exit_code?: number;
  error_message?: string;
}

export interface LauncherSettingsBackend {
  gameDirectory: string;
  allocatedRamGb: number;
  maxRamGb: number;
  javaExecutablePath: string;
  javaVersion: string;
  resolutionWidth: number;
  resolutionHeight: number;
  fullscreen: boolean;
  selectedVersion?: string;
  guiScale?: number;
  closeLauncherOnStart: boolean;
  checkUpdates: boolean;
  soundEffects: boolean;
  enableVolumeProfileIntegration?: boolean;
  jvmArguments?: string;
}

export class TauriMinecraftService {
  /**
   * Retrieves dynamically parsed versions from Mojang's official version manifest.
   */
  async getMinecraftVersions(): Promise<FrontendVersionInfo[]> {
    if (!isTauri()) {
      return [
        {
          id: '1.21.1',
          name: '1.21.1',
          type: 'release',
          installed: false,
          releaseDate: '2024-08-08',
          size: '~500 MB',
          description: 'Official Minecraft 1.21.1 release from Mojang.',
        },
        {
          id: '1.20.4',
          name: '1.20.4',
          type: 'release',
          installed: false,
          releaseDate: '2023-12-07',
          size: '~480 MB',
          description: 'Official Minecraft 1.20.4 release from Mojang.',
        },
      ];
    }
    try {
      return await invoke<FrontendVersionInfo[]>('get_minecraft_versions');
    } catch (err) {
      console.error('Error fetching Minecraft versions from Tauri backend:', err);
      throw err;
    }
  }

  /**
   * Retrieves list of locally installed Minecraft versions.
   */
  async getInstalledVersions(): Promise<string[]> {
    if (!isTauri()) {
      return ['1.21.1'];
    }
    try {
      return await invoke<string[]>('get_installed_versions');
    } catch (err) {
      console.error('Error fetching installed Minecraft versions:', err);
      return [];
    }
  }

  /**
   * Installs a specific Minecraft version. Emits progress via Tauri event channel.
   */
  async installVersion(
    versionId: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<void> {
    if (!isTauri()) {
      // Simulate frontend progress for web preview
      if (onProgress) {
        onProgress({
          version: versionId,
          stage: 'manifest',
          current: 0,
          total: 100,
          bytes_downloaded: 0,
          bytes_total: 100000000,
          current_file: 'manifest.json',
        });
        await new Promise((r) => setTimeout(r, 600));
        onProgress({
          version: versionId,
          stage: 'client',
          current: 30,
          total: 100,
          bytes_downloaded: 30000000,
          bytes_total: 100000000,
          current_file: 'client.jar',
        });
        await new Promise((r) => setTimeout(r, 600));
        onProgress({
          version: versionId,
          stage: 'complete',
          current: 100,
          total: 100,
          bytes_downloaded: 100000000,
          bytes_total: 100000000,
          current_file: 'done',
        });
      }
      return;
    }

    let unlisten: UnlistenFn | undefined;
    if (onProgress) {
      unlisten = await listen<InstallProgress>('install-progress', (event) => {
        if (event.payload.version === versionId) {
          onProgress(event.payload);
        }
      });
    }

    try {
      await invoke('install_minecraft_version', { versionId });
    } catch (err) {
      console.error(`Error installing Minecraft version ${versionId}:`, err);
      throw err;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }

  /**
   * Verifies the local file integrity of an installed Minecraft version against official SHA-1 hashes.
   */
  async verifyVersion(versionId: string): Promise<VerificationResult> {
    if (!isTauri()) {
      return {
        total_files: 142,
        verified_files: 142,
        missing_files: 0,
        corrupt_files: 0,
        is_valid: true,
        details: ['Web simulation: all files intact'],
      };
    }
    try {
      return await invoke<VerificationResult>('verify_minecraft_version', { versionId });
    } catch (err) {
      console.error(`Error verifying version ${versionId}:`, err);
      throw err;
    }
  }

  /**
   * Repairs missing or corrupt assets, libraries, and client JAR for a Minecraft version.
   */
  async repairVersion(
    versionId: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<void> {
    if (!isTauri()) {
      return this.installVersion(versionId, onProgress);
    }

    let unlisten: UnlistenFn | undefined;
    if (onProgress) {
      unlisten = await listen<InstallProgress>('install-progress', (event) => {
        if (event.payload.version === versionId) {
          onProgress(event.payload);
        }
      });
    }

    try {
      await invoke('repair_minecraft_version', { versionId });
    } catch (err) {
      console.error(`Error repairing version ${versionId}:`, err);
      throw err;
    } finally {
      if (unlisten) {
        unlisten();
      }
    }
  }

  /**
   * Subscribes to Minecraft installation progress events.
   */
  async onInstallProgress(callback: (progress: InstallProgress) => void): Promise<UnlistenFn> {
    if (!isTauri()) {
      return () => {};
    }
    return await listen<InstallProgress>('install-progress', (event) => {
      callback(event.payload);
    });
  }

  /**
   * Alias for installVersion.
   */
  async installMinecraftVersion(
    versionId: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<void> {
    return this.installVersion(versionId, onProgress);
  }

  /**
   * Alias for verifyVersion.
   */
  async verifyMinecraftVersion(versionId: string): Promise<VerificationResult> {
    return this.verifyVersion(versionId);
  }

  /**
   * Alias for repairVersion.
   */
  async repairMinecraftVersion(
    versionId: string,
    onProgress?: (progress: InstallProgress) => void
  ): Promise<void> {
    return this.repairVersion(versionId, onProgress);
  }

  /**
   * Detects valid Java runtimes on the host machine.
   */
  async detectJava(requiredJava?: number, customJavaPath?: string): Promise<JavaInfo> {
    if (!isTauri()) {
      return {
        path: 'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
        version: '21.0.2',
        major_version: 21,
        is_valid: true,
      };
    }
    try {
      return await invoke<JavaInfo>('detect_java', {
        requiredJava: requiredJava || null,
        customJavaPath: customJavaPath || null,
      });
    } catch (err) {
      console.error('Error detecting Java environment:', err);
      throw err;
    }
  }

  /**
   * Discovers all available Java runtimes on the system.
   */
  async getAvailableJavas(): Promise<JavaInfo[]> {
    if (!isTauri()) {
      return [
        {
          path: 'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
          version: '21.0.2',
          major_version: 21,
          is_valid: true,
        },
      ];
    }
    try {
      return await invoke<JavaInfo[]>('get_available_javas');
    } catch (err) {
      console.error('Error discovering Java runtimes:', err);
      return [];
    }
  }

  /**
   * Launches a real Minecraft process with the selected offline account and instance.
   */
  async launchMinecraft(versionId?: string, instanceId?: string): Promise<number> {
    if (!isTauri()) {
      console.log(`[Web Simulation] Launching Minecraft: version=${versionId}, instance=${instanceId}`);
      return 12345;
    }
    try {
      return await invoke<number>('launch_minecraft', {
        versionId: versionId || null,
        instanceId: instanceId || null,
      });
    } catch (err) {
      console.error('Error launching Minecraft process:', err);
      throw err;
    }
  }

  /**
   * Stops the currently running Minecraft process.
   */
  async stopMinecraft(): Promise<void> {
    if (!isTauri()) {
      return;
    }
    try {
      await invoke('stop_minecraft');
    } catch (err) {
      console.error('Error stopping Minecraft process:', err);
      throw err;
    }
  }

  /**
   * Retrieves the current Minecraft process lifecycle state.
   */
  async getProcessState(): Promise<ProcessState> {
    if (!isTauri()) {
      return { status: 'idle' };
    }
    try {
      return await invoke<ProcessState>('get_minecraft_process_state');
    } catch (err) {
      console.error('Error getting process state:', err);
      return { status: 'idle' };
    }
  }

  /**
   * Alias for getProcessState.
   */
  async getMinecraftProcessState(): Promise<ProcessState> {
    return this.getProcessState();
  }

  /**
   * Loads persisted settings from disk.
   */
  async getLauncherSettings(): Promise<LauncherSettingsBackend> {
    if (!isTauri()) {
      return {
        gameDirectory: 'minecraft_data',
        allocatedRamGb: 4,
        maxRamGb: 16,
        javaExecutablePath: '',
        javaVersion: '',
        resolutionWidth: 1280,
        resolutionHeight: 720,
        fullscreen: false,
        selectedVersion: undefined,
        guiScale: 3,
        closeLauncherOnStart: false,
        checkUpdates: true,
        soundEffects: true,
      };
    }
    try {
      return await invoke<LauncherSettingsBackend>('get_launcher_settings');
    } catch (err) {
      console.error('Error loading launcher settings:', err);
      throw err;
    }
  }

  /**
   * Saves launcher settings to disk.
   */
  async saveLauncherSettings(settings: LauncherSettingsBackend): Promise<void> {
    if (!isTauri()) {
      return;
    }
    try {
      await invoke('save_launcher_settings', { settings });
    } catch (err) {
      console.error('Error saving launcher settings:', err);
      throw err;
    }
  }

  /**
   * Opens the native Windows folder picker dialog.
   */
  async pickDirectory(defaultPath?: string): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    try {
      return await invoke<string | null>('pick_directory', { defaultPath: defaultPath || null });
    } catch (err) {
      console.error('Error opening directory picker:', err);
      return null;
    }
  }

  /**
   * Opens the native Windows file picker dialog for JAR mods.
   */
  async pickJarFiles(): Promise<string[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<string[]>('pick_jar_files');
    } catch (err) {
      console.error('Error opening mod file picker:', err);
      return [];
    }
  }

  /**
   * Opens the native Windows file picker dialog for skin PNG files.
   */
  async pickSkinFile(): Promise<string | null> {
    if (!isTauri()) {
      return null;
    }
    try {
      return await invoke<string | null>('pick_skin_file');
    } catch (err) {
      console.error('Error opening skin picker:', err);
      return null;
    }
  }

  // ============================================================================
  // OFFLINE ACCOUNT & PROFILE MANAGEMENT
  // ============================================================================

  async getOfflineAccounts(): Promise<OfflineAccount[]> {
    if (!isTauri()) {
      return [
        {
          id: 'offline-00000000-0000-3000-8000-000000000001',
          username: 'DevExplorer',
          uuid: '00000000-0000-3000-8000-000000000001',
          createdAt: '2026-10-06T12:00:00Z',
          avatarType: 'default',
          profileIcon: 'moon',
          skinModel: 'classic',
        },
      ];
    }
    try {
      return await invoke<OfflineAccount[]>('get_offline_accounts');
    } catch (err) {
      console.error('Error fetching offline accounts:', err);
      return [];
    }
  }

  async getSelectedOfflineAccount(): Promise<OfflineAccount | null> {
    if (!isTauri()) {
      return {
        id: 'offline-00000000-0000-3000-8000-000000000001',
        username: 'DevExplorer',
        uuid: '00000000-0000-3000-8000-000000000001',
        createdAt: '2026-10-06T12:00:00Z',
        avatarType: 'default',
        profileIcon: 'moon',
        skinModel: 'classic',
      };
    }
    try {
      return await invoke<OfflineAccount | null>('get_selected_offline_account');
    } catch (err) {
      console.error('Error fetching selected offline account:', err);
      return null;
    }
  }

  async createOfflineAccount(username: string): Promise<OfflineAccount> {
    if (!isTauri()) {
      return {
        id: `offline-${Date.now()}`,
        username,
        uuid: '00000000-0000-3000-8000-000000000002',
        createdAt: new Date().toISOString(),
        avatarType: 'default',
        profileIcon: 'moon',
        skinModel: 'classic',
      };
    }
    try {
      return await invoke<OfflineAccount>('create_offline_account', { username });
    } catch (err) {
      console.error('Error creating offline account:', err);
      throw err;
    }
  }

  async selectOfflineAccount(accountId: string): Promise<OfflineAccount> {
    if (!isTauri()) {
      return {
        id: accountId,
        username: 'DevExplorer',
        uuid: '00000000-0000-3000-8000-000000000001',
        createdAt: '2026-10-06T12:00:00Z',
        avatarType: 'default',
        profileIcon: 'moon',
        skinModel: 'classic',
      };
    }
    try {
      return await invoke<OfflineAccount>('select_offline_account', { accountId });
    } catch (err) {
      console.error('Error selecting offline account:', err);
      throw err;
    }
  }

  async deleteOfflineAccount(accountId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('delete_offline_account', { accountId });
    } catch (err) {
      console.error('Error deleting offline account:', err);
      throw err;
    }
  }

  async setAccountAvatar(accountId: string, avatarType: string, avatarData?: string): Promise<OfflineAccount> {
    if (!isTauri()) {
      return {
        id: accountId,
        username: 'DevExplorer',
        uuid: '00000000-0000-3000-8000-000000000001',
        createdAt: '2026-10-06T12:00:00Z',
        avatarType: avatarType as any,
        avatarPath: avatarData,
      };
    }
    try {
      return await invoke<OfflineAccount>('set_account_avatar', { accountId, avatarType, avatarData });
    } catch (err) {
      console.error('Error setting account avatar:', err);
      throw err;
    }
  }

  async setAccountSkin(accountId: string, skinData?: string, skinModel?: string): Promise<OfflineAccount> {
    if (!isTauri()) {
      return {
        id: accountId,
        username: 'DevExplorer',
        uuid: '00000000-0000-3000-8000-000000000001',
        createdAt: '2026-10-06T12:00:00Z',
        skinPath: skinData,
        skinModel: (skinModel || 'classic') as any,
      };
    }
    try {
      return await invoke<OfflineAccount>('set_account_skin', { accountId, skinData, skinModel });
    } catch (err) {
      console.error('Error setting account skin:', err);
      throw err;
    }
  }

  async setAccountProfileIcon(accountId: string, profileIcon: string): Promise<OfflineAccount> {
    if (!isTauri()) {
      return {
        id: accountId,
        username: 'DevExplorer',
        uuid: '00000000-0000-3000-8000-000000000001',
        createdAt: '2026-10-06T12:00:00Z',
        profileIcon,
      };
    }
    try {
      return await invoke<OfflineAccount>('set_account_profile_icon', { accountId, profileIcon });
    } catch (err) {
      console.error('Error setting account profile icon:', err);
      throw err;
    }
  }

  // ============================================================================
  // INSTANCE MANAGEMENT
  // ============================================================================

  async getInstances(): Promise<Instance[]> {
    if (!isTauri()) {
      return [
        {
          id: 'default',
          name: 'Vanilla Survival',
          versionId: '1.21.1',
          loader: 'vanilla',
          createdAt: '1728211200',
        },
      ];
    }
    try {
      return await invoke<Instance[]>('get_instances');
    } catch (err) {
      console.error('Error getting instances:', err);
      return [];
    }
  }

  async getSelectedInstance(): Promise<Instance | null> {
    if (!isTauri()) {
      return {
        id: 'default',
        name: 'Vanilla Survival',
        versionId: '1.21.1',
        loader: 'vanilla',
        createdAt: '1728211200',
      };
    }
    try {
      return await invoke<Instance | null>('get_selected_instance');
    } catch (err) {
      console.error('Error getting selected instance:', err);
      return null;
    }
  }

  async selectInstance(instanceId: string): Promise<Instance> {
    if (!isTauri()) {
      return {
        id: instanceId,
        name: 'Vanilla Survival',
        versionId: '1.21.1',
        loader: 'vanilla',
        createdAt: '1728211200',
      };
    }
    try {
      return await invoke<Instance>('select_instance', { instanceId });
    } catch (err) {
      console.error('Error selecting instance:', err);
      throw err;
    }
  }

  async createInstance(
    name: string,
    versionId: string,
    loader: string,
    fabricVersion?: string
  ): Promise<Instance> {
    if (!isTauri()) {
      return {
        id: `inst-${Date.now()}`,
        name,
        versionId,
        loader: loader as any,
        fabricVersion,
        createdAt: String(Date.now()),
      };
    }
    try {
      return await invoke<Instance>('create_instance', {
        name,
        versionId,
        loader,
        fabricVersion,
      });
    } catch (err) {
      console.error('Error creating instance:', err);
      throw err;
    }
  }

  async updateInstance(instance: Instance): Promise<Instance> {
    if (!isTauri()) return instance;
    try {
      return await invoke<Instance>('update_instance', { instance });
    } catch (err) {
      console.error('Error updating instance:', err);
      throw err;
    }
  }

  async duplicateInstance(instanceId: string, newName: string): Promise<Instance> {
    if (!isTauri()) {
      return {
        id: `inst-${Date.now()}`,
        name: newName,
        versionId: '1.21.1',
        loader: 'vanilla',
        createdAt: String(Date.now()),
      };
    }
    try {
      return await invoke<Instance>('duplicate_instance', { instanceId, newName });
    } catch (err) {
      console.error('Error duplicating instance:', err);
      throw err;
    }
  }

  async deleteInstance(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('delete_instance', { instanceId });
    } catch (err) {
      console.error('Error deleting instance:', err);
      throw err;
    }
  }

  async openInstanceFolder(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('open_instance_folder', { instanceId });
    } catch (err) {
      console.error('Error opening instance folder:', err);
      throw err;
    }
  }

  // ============================================================================
  // LOCAL MOD & RESOURCE PACK MANAGEMENT
  // ============================================================================

  async getInstanceMods(instanceId: string): Promise<LocalMod[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<LocalMod[]>('get_instance_mods', { instanceId });
    } catch (err) {
      console.error('Error getting instance mods:', err);
      return [];
    }
  }

  async toggleMod(instanceId: string, fileName: string): Promise<LocalMod> {
    if (!isTauri()) {
      throw new Error('Tauri required');
    }
    try {
      return await invoke<LocalMod>('toggle_mod', { instanceId, fileName });
    } catch (err) {
      console.error('Error toggling mod:', err);
      throw err;
    }
  }

  async deleteMod(instanceId: string, fileName: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('delete_mod', { instanceId, fileName });
    } catch (err) {
      console.error('Error deleting mod:', err);
      throw err;
    }
  }

  async openModsFolder(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('open_mods_folder', { instanceId });
    } catch (err) {
      console.error('Error opening mods folder:', err);
      throw err;
    }
  }

  /**
   * Installs one or more local .jar mod files into the instance mods folder.
   */
  async installLocalMods(instanceId: string, filePaths: string[]): Promise<LocalMod[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<LocalMod[]>('install_local_mods', { instanceId, filePaths });
    } catch (err) {
      console.error('Error installing local mods:', err);
      throw err;
    }
  }

  async searchModrinthMods(
    query: string,
    loader?: string,
    gameVersion?: string,
    projectType?: string
  ): Promise<ModrinthMod[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<ModrinthMod[]>('search_modrinth_mods', {
        query,
        loader: loader || null,
        gameVersion: gameVersion || null,
        projectType: projectType || null,
      });
    } catch (err) {
      console.error('Error searching Modrinth mods:', err);
      throw err;
    }
  }

  async installModrinthMod(
    instanceId: string,
    projectId: string,
    loader: string,
    gameVersion: string
  ): Promise<LocalMod> {
    if (!isTauri()) {
      throw new Error('Tauri required');
    }
    try {
      return await invoke<LocalMod>('install_modrinth_mod', {
        instanceId,
        projectId,
        loader,
        gameVersion,
      });
    } catch (err) {
      console.error('Error installing Modrinth mod:', err);
      throw err;
    }
  }

  async checkModUpdates(
    instanceId: string,
    loader: string,
    gameVersion: string
  ): Promise<ModUpdateInfo[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<ModUpdateInfo[]>('check_mod_updates', {
        instanceId,
        loader,
        gameVersion,
      });
    } catch (err) {
      console.error('Error checking mod updates:', err);
      return [];
    }
  }

  async updateMod(
    instanceId: string,
    projectId: string,
    loader: string,
    gameVersion: string
  ): Promise<LocalMod> {
    if (!isTauri()) {
      throw new Error('Tauri required');
    }
    try {
      return await invoke<LocalMod>('update_mod', {
        instanceId,
        projectId,
        loader,
        gameVersion,
      });
    } catch (err) {
      console.error('Error updating mod:', err);
      throw err;
    }
  }

  async listResourcepacks(instanceId: string): Promise<ResourcePackItem[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<ResourcePackItem[]>('list_resourcepacks', { instanceId });
    } catch (err) {
      console.error('Error listing resource packs:', err);
      return [];
    }
  }

  async toggleResourcepack(instanceId: string, fileName: string): Promise<ResourcePackItem> {
    if (!isTauri()) {
      throw new Error('Tauri required');
    }
    try {
      return await invoke<ResourcePackItem>('toggle_resourcepack', { instanceId, fileName });
    } catch (err) {
      console.error('Error toggling resource pack:', err);
      throw err;
    }
  }

  async deleteResourcepack(instanceId: string, fileName: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('delete_resourcepack', { instanceId, fileName });
    } catch (err) {
      console.error('Error deleting resource pack:', err);
      throw err;
    }
  }

  async openResourcepacksFolder(instanceId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('open_resourcepacks_folder', { instanceId });
    } catch (err) {
      console.error('Error opening resource packs folder:', err);
      throw err;
    }
  }

  // ============================================================================
  // FABRIC LOADER INTEGRATION
  // ============================================================================

  async getFabricLoaderVersions(gameVersion: string): Promise<FabricLoaderItem[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<FabricLoaderItem[]>('get_fabric_loader_versions', { gameVersion });
    } catch (err) {
      console.error('Error getting Fabric loader versions:', err);
      return [];
    }
  }

  async installFabricVersion(gameVersion: string, loaderVersion: string): Promise<string> {
    if (!isTauri()) {
      return `fabric-loader-${loaderVersion}-${gameVersion}`;
    }
    try {
      return await invoke<string>('install_fabric_version', { gameVersion, loaderVersion });
    } catch (err) {
      console.error('Error installing Fabric version:', err);
      throw err;
    }
  }

  // ============================================================================
  // LOCAL WORLD ARCHIVE & BACKUP MANAGEMENT (100% LOCAL-FIRST)
  // ============================================================================

  async listInstanceWorlds(instanceId: string): Promise<InstanceWorldInfo[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<InstanceWorldInfo[]>('list_instance_worlds', { instanceId });
    } catch (err) {
      console.error('Error listing instance worlds:', err);
      return [];
    }
  }

  async createWorldBackup(instanceId: string, worldFolderName: string): Promise<WorldBackupInfo> {
    if (!isTauri()) {
      return {
        backupId: `${worldFolderName}.backup_1728211200`,
        worldFolderName,
        timestamp: 1728211200,
        sizeBytes: 1024,
        path: 'local',
      };
    }
    try {
      return await invoke<WorldBackupInfo>('create_world_backup', { instanceId, worldFolderName });
    } catch (err) {
      console.error('Error creating world backup:', err);
      throw err;
    }
  }

  async listWorldBackups(instanceId: string, worldFolderName: string): Promise<WorldBackupInfo[]> {
    if (!isTauri()) {
      return [];
    }
    try {
      return await invoke<WorldBackupInfo[]>('list_world_backups', { instanceId, worldFolderName });
    } catch (err) {
      console.error('Error listing world backups:', err);
      return [];
    }
  }

  async restoreWorldBackup(instanceId: string, worldFolderName: string, backupId: string): Promise<string> {
    if (!isTauri()) {
      return 'Restored world';
    }
    try {
      return await invoke<string>('restore_world_backup', { instanceId, worldFolderName, backupId });
    } catch (err) {
      console.error('Error restoring world backup:', err);
      throw err;
    }
  }

  async deleteWorldBackup(instanceId: string, backupId: string): Promise<void> {
    if (!isTauri()) return;
    try {
      await invoke('delete_world_backup', { instanceId, backupId });
    } catch (err) {
      console.error('Error deleting world backup:', err);
      throw err;
    }
  }

  async exportWorldArchive(instanceId: string, worldFolderName: string, destinationFile: string): Promise<string> {
    if (!isTauri()) {
      return 'Exported world archive';
    }
    try {
      return await invoke<string>('export_world_archive', { instanceId, worldFolderName, destinationFile });
    } catch (err) {
      console.error('Error exporting world archive:', err);
      throw err;
    }
  }

  async importWorldArchive(instanceId: string, archiveFilePath: string, worldFolderName?: string): Promise<string> {
    if (!isTauri()) {
      return 'Imported world archive';
    }
    try {
      return await invoke<string>('import_world_archive', { instanceId, archiveFilePath, worldFolderName: worldFolderName || null });
    } catch (err) {
      console.error('Error importing world archive:', err);
      throw err;
    }
  }

  async debugActiveProfile(instanceId?: string): Promise<any> {
    if (!isTauri()) {
      return { status: 'mock' };
    }
    try {
      return await invoke<any>('debug_active_profile', { instanceId: instanceId || null });
    } catch (err) {
      console.error('Error debugging active profile:', err);
      throw err;
    }
  }
}

export const tauriService = new TauriMinecraftService();

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
