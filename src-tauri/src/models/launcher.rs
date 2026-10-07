use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub version: String,
    pub stage: String, // "manifest" | "version" | "client" | "libraries" | "assets" | "natives" | "verification" | "complete" | "error"
    pub current: usize,
    pub total: usize,
    pub bytes_downloaded: u64,
    pub bytes_total: u64,
    pub current_file: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessState {
    pub status: String, // "idle" | "preparing" | "launching" | "running" | "stopping" | "stopped" | "error"
    pub version: Option<String>,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
}

impl Default for ProcessState {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            version: None,
            pid: None,
            started_at: None,
            exit_code: None,
            error_message: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInfo {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherSettings {
    #[serde(rename = "gameDirectory")]
    pub game_directory: String,
    #[serde(rename = "allocatedRamGb")]
    pub allocated_ram_gb: u32,
    #[serde(rename = "maxRamGb")]
    pub max_ram_gb: u32,
    #[serde(rename = "javaExecutablePath")]
    pub java_executable_path: String,
    #[serde(rename = "javaVersion")]
    pub java_version: String,
    #[serde(rename = "resolutionWidth")]
    pub resolution_width: u32,
    #[serde(rename = "resolutionHeight")]
    pub resolution_height: u32,
    pub fullscreen: bool,
    #[serde(rename = "selectedVersion")]
    pub selected_version: Option<String>,
    #[serde(rename = "guiScale")]
    pub gui_scale: Option<u32>,
    #[serde(rename = "closeLauncherOnStart")]
    pub close_launcher_on_start: bool,
    #[serde(rename = "checkUpdates")]
    pub check_updates: bool,
    #[serde(rename = "soundEffects")]
    pub sound_effects: bool,
    #[serde(rename = "enableVolumeProfileIntegration", default = "default_enable_volume_profile_integration")]
    pub enable_volume_profile_integration: bool,
    #[serde(rename = "jvmArguments", default)]
    pub jvm_arguments: Option<String>,
}

fn default_enable_volume_profile_integration() -> bool {
    true
}

impl Default for LauncherSettings {
    fn default() -> Self {
        let default_dir = dirs::data_dir()
            .map(|p| p.join("VolumeLauncher").join("minecraft").to_string_lossy().to_string())
            .unwrap_or_else(|| "minecraft_data".to_string());

        Self {
            game_directory: default_dir,
            allocated_ram_gb: 4,
            max_ram_gb: 16,
            java_executable_path: "".to_string(),
            java_version: "".to_string(),
            resolution_width: 1280,
            resolution_height: 720,
            fullscreen: false,
            selected_version: None,
            gui_scale: Some(3),
            close_launcher_on_start: false,
            check_updates: true,
            sound_effects: true,
            enable_volume_profile_integration: true,
            jvm_arguments: None,
        }
    }
}
