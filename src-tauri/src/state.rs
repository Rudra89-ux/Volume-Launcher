use std::sync::Arc;
use tokio::sync::Mutex;
use std::fs;
use crate::models::LauncherSettings;
use crate::minecraft::paths::MinecraftPaths;
use crate::minecraft::manifest::ManifestService;
use crate::minecraft::installer::Installer;
use crate::minecraft::fabric::FabricService;
use crate::launcher::process::ProcessManager;
use crate::launcher::accounts::AccountManager;
use crate::launcher::instances::InstanceManager;

pub struct AppState {
    pub paths: MinecraftPaths,
    pub process_manager: ProcessManager,
    pub settings: Arc<Mutex<LauncherSettings>>,
    pub installer: Installer,
    pub manifest_service: ManifestService,
    pub account_manager: Arc<Mutex<AccountManager>>,
    pub fabric_service: FabricService,
    pub instance_manager: Arc<Mutex<InstanceManager>>,
}

impl AppState {
    pub fn new() -> Self {
        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let _ = paths.ensure_directories();

        // Load settings from disk if available, otherwise default
        let settings_file = paths.settings_file();
        let loaded_settings = if settings_file.exists() {
            fs::read_to_string(&settings_file)
                .ok()
                .and_then(|content| serde_json::from_str::<LauncherSettings>(&content).ok())
                .unwrap_or_default()
        } else {
            LauncherSettings::default()
        };

        let installer = Installer::new(paths.clone());
        let manifest_service = ManifestService::new(paths.clone());
        let process_manager = ProcessManager::new();
        let account_manager = AccountManager::new(&paths);
        let fabric_service = FabricService::new(paths.clone());
        let instance_manager = InstanceManager::new(paths.clone());

        Self {
            paths,
            process_manager,
            settings: Arc::new(Mutex::new(loaded_settings)),
            installer,
            manifest_service,
            account_manager: Arc::new(Mutex::new(account_manager)),
            fabric_service,
            instance_manager: Arc::new(Mutex::new(instance_manager)),
        }
    }
}
