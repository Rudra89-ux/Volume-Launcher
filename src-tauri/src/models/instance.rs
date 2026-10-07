use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Instance {
    pub id: String,
    pub name: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    pub loader: String, // "vanilla" | "fabric"
    #[serde(rename = "fabricVersion")]
    pub fabric_version: Option<String>,
    #[serde(rename = "javaPath")]
    pub java_path: Option<String>,
    #[serde(rename = "memoryGb")]
    pub memory_gb: Option<u32>,
    #[serde(rename = "resolutionWidth")]
    pub resolution_width: Option<u32>,
    #[serde(rename = "resolutionHeight")]
    pub resolution_height: Option<u32>,
    pub fullscreen: Option<bool>,
    #[serde(rename = "jvmArgs")]
    pub jvm_args: Option<String>,
    pub icon: Option<String>,
    #[serde(rename = "gameDir")]
    pub game_dir: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "lastPlayedAt")]
    pub last_played_at: Option<String>,
}

impl Default for Instance {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: "Default Instance".to_string(),
            version_id: "1.21.1".to_string(),
            loader: "vanilla".to_string(),
            fabric_version: None,
            java_path: None,
            memory_gb: None,
            resolution_width: None,
            resolution_height: None,
            fullscreen: None,
            jvm_args: None,
            icon: None,
            game_dir: None,
            created_at: String::new(),
            last_played_at: None,
        }
    }
}

impl Instance {
    pub fn new(name: &str, version_id: &str, loader: &str) -> Self {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now_sec = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let safe_id = format!("{}-{}", name.to_lowercase().replace(' ', "-"), now_sec);

        Self {
            id: safe_id,
            name: name.to_string(),
            version_id: version_id.to_string(),
            loader: loader.to_string(),
            fabric_version: None,
            java_path: None,
            memory_gb: None,
            resolution_width: None,
            resolution_height: None,
            fullscreen: None,
            jvm_args: None,
            icon: None,
            game_dir: None,
            created_at: format!("{}", now_sec),
            last_played_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct InstancesConfig {
    #[serde(rename = "selectedInstanceId")]
    pub selected_instance_id: Option<String>,
    pub instances: Vec<Instance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMod {
    pub id: String,
    pub name: String,
    pub version: String,
    pub loader: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub enabled: bool,
    pub description: String,
    pub authors: Vec<String>,
    pub dependencies: Vec<String>,
    #[serde(rename = "compatibilityWarning")]
    pub compatibility_warning: Option<String>,
    #[serde(rename = "modrinthProjectId")]
    pub modrinth_project_id: Option<String>,
    #[serde(rename = "updateAvailable")]
    pub update_available: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourcePackItem {
    pub file_name: String,
    pub name: String,
    pub description: String,
    pub pack_format: Option<u32>,
    pub enabled: bool,
    pub size_bytes: u64,
}
