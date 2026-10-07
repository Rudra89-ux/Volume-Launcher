export type NavigationTab = 'home' | 'instances' | 'versions' | 'mods' | 'accounts' | 'settings';

export interface OfflineAccount {
  id: string;
  username: string;
  uuid: string;
  createdAt: string;
  lastPlayedAt?: string;
  avatarType?: 'default' | 'custom' | 'skin';
  avatarPath?: string;
  avatarUpdatedAt?: string;
  skinPath?: string;
  skinModel?: 'classic' | 'slim';
  profileIcon?: string; // "moon" | "star" | "sun" | "flame" | "leaf" | "sword"
}

export interface MinecraftVersion {
  id: string;
  name: string;
  type: 'release' | 'snapshot' | 'fabric' | 'forge' | 'neoforge' | string;
  typeLabel: string;
  installed: boolean;
  releaseDate: string;
  size: string;
  description: string;
  isDefault?: boolean;
}

export interface Instance {
  id: string;
  name: string;
  versionId: string;
  loader: 'vanilla' | 'fabric';
  fabricVersion?: string;
  javaPath?: string;
  memoryGb?: number;
  resolutionWidth?: number;
  resolutionHeight?: number;
  fullscreen?: boolean;
  jvmArgs?: string;
  icon?: string;
  gameDir?: string;
  createdAt: string;
  lastPlayedAt?: string;
}

export interface SavedWorld {
  id: string;
  name: string;
  version: string;
  biome: string;
  seed: string;
  size: string;
  lastPlayed: string;
  gameMode: 'Survival' | 'Hardcore' | 'Creative';
}

export interface LocalMod {
  id: string;
  name: string;
  version: string;
  loader: string;
  fileName: string;
  enabled: boolean;
  description: string;
  authors: string[];
  dependencies: string[];
  compatibilityWarning?: string;
  modrinthProjectId?: string;
  updateAvailable?: string;
}

export interface ResourcePackItem {
  fileName: string;
  name: string;
  description: string;
  packFormat?: number;
  enabled: boolean;
  sizeBytes: number;
}

export interface ModUpdateInfo {
  fileName: string;
  modName: string;
  currentVersion: string;
  latestVersion: string;
  projectId: string;
}

export interface ModItem {
  id: string;
  name: string;
  version: string;
  loader: 'Fabric' | 'Forge' | 'NeoForge' | 'Vanilla';
  author: string;
  description: string;
  enabled: boolean;
  category: 'Performance' | 'World Gen' | 'Visuals' | 'Utility';
}

export interface ModrinthMod {
  projectId: string;
  title: string;
  description: string;
  author: string;
  iconUrl?: string;
  downloads: number;
  follows: number;
  categories: string[];
  versions: string[];
  isCompatible: boolean;
}

export interface LauncherSettings {
  launcherTheme: 'earthy-parchment';
  autoLaunchGame: boolean;
  closeLauncherOnStart: boolean;
  enableDiscordRPC: boolean;
  checkUpdates: boolean;
  gameDirectory: string;
  allocatedRamGb: number;
  maxRamGb: number;
  javaExecutablePath: string;
  javaVersion: string;
  resolutionWidth: number;
  resolutionHeight: number;
  fullscreen: boolean;
  uiScale: 'auto' | 'small' | 'medium' | 'large';
  selectedVersion?: string;
  guiScale?: number;
  soundEffects: boolean;
  enableVolumeProfileIntegration?: boolean;
  jvmArguments?: string;
}

export interface InstanceWorldInfo {
  folderName: string;
  displayName: string;
  sizeBytes: number;
  lastModified: number;
  backupCount: number;
}

export interface WorldBackupInfo {
  backupId: string;
  worldFolderName: string;
  timestamp: number;
  sizeBytes: number;
  path: string;
}

export type LaunchState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'preparing'
  | 'launching'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface ActiveInstallState {
  versionId: string;
  stage: string;
  current: number;
  total: number;
  bytesDownloaded: number;
  bytesTotal: number;
  currentFile: string;
  message?: string;
  percentage: number;
}

export interface VerificationResult {
  total_files: number;
  verified_files: number;
  missing_files: number;
  corrupt_files: number;
  is_valid: boolean;
  details: string[];
}

export interface FabricLoaderItem {
  separator?: string;
  build?: number;
  maven: string;
  version: string;
  stable: boolean;
}
