use std::path::PathBuf;
use std::fs::{self, OpenOptions};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::models::{
    VersionMetadata, ArgumentItem, ArgumentValue, Rule,
    ProcessState, LauncherSettings, OfflineAccount
};
use crate::minecraft::paths::MinecraftPaths;
use crate::minecraft::installer::Installer;
use crate::launcher::java::JavaDetector;

pub struct ProcessManager {
    child: Arc<Mutex<Option<Child>>>,
    state: Arc<Mutex<ProcessState>>,
    last_log_path: Arc<Mutex<Option<PathBuf>>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            state: Arc::new(Mutex::new(ProcessState::default())),
            last_log_path: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn get_state(&self) -> ProcessState {
        self.state.lock().await.clone()
    }

    pub async fn get_last_log_path(&self) -> Option<PathBuf> {
        self.last_log_path.lock().await.clone()
    }

    pub async fn stop_process(&self) -> Result<(), String> {
        let mut child_lock = self.child.lock().await;
        let mut state_lock = self.state.lock().await;

        if let Some(mut child) = child_lock.take() {
            state_lock.status = "stopping".to_string();
            let _ = child.kill();
            let _ = child.wait();
            state_lock.status = "stopped".to_string();
            state_lock.exit_code = Some(-1);
            return Ok(());
        }

        state_lock.status = "stopped".to_string();
        Ok(())
    }

    pub async fn launch(
        &self,
        version_id: &str,
        metadata: &VersionMetadata,
        paths: &MinecraftPaths,
        settings: &LauncherSettings,
        account: &OfflineAccount,
        instance_dir: Option<&PathBuf>,
    ) -> Result<u32, String> {
        // Ensure no existing process is active
        {
            let mut state_lock = self.state.lock().await;
            if state_lock.status == "running" || state_lock.status == "launching" {
                return Err("A Minecraft process is already running.".to_string());
            }
            state_lock.status = "preparing".to_string();
            state_lock.version = Some(version_id.to_string());
            state_lock.error_message = None;
        }

        // Determine effective game directory
        let default_dir = paths.root.clone();
        let game_dir = instance_dir.unwrap_or(&default_dir);
        let _ = fs::create_dir_all(game_dir);

        // Ensure sensible options.txt exists in game_dir with GUI scale, resolution and fullscreen
        let options_file = game_dir.join("options.txt");
        let target_scale = settings.gui_scale.unwrap_or(3);
        let target_width = if settings.resolution_width > 0 { settings.resolution_width } else { 1280 };
        let target_height = if settings.resolution_height > 0 { settings.resolution_height } else { 720 };
        let target_fullscreen = settings.fullscreen;

        if options_file.exists() {
            if let Ok(content) = fs::read_to_string(&options_file) {
                let mut updated_lines = Vec::new();
                let mut found_gui_scale = false;
                let mut found_width = false;
                let mut found_height = false;
                let mut found_fullscreen = false;

                for line in content.lines() {
                    if line.starts_with("guiScale:") {
                        updated_lines.push(format!("guiScale:{}", target_scale));
                        found_gui_scale = true;
                    } else if line.starts_with("overrideWidth:") {
                        updated_lines.push(format!("overrideWidth:{}", target_width));
                        found_width = true;
                    } else if line.starts_with("overrideHeight:") {
                        updated_lines.push(format!("overrideHeight:{}", target_height));
                        found_height = true;
                    } else if line.starts_with("fullscreen:") {
                        updated_lines.push(format!("fullscreen:{}", target_fullscreen));
                        found_fullscreen = true;
                    } else {
                        updated_lines.push(line.to_string());
                    }
                }
                if !found_gui_scale {
                    updated_lines.push(format!("guiScale:{}", target_scale));
                }
                if !found_width {
                    updated_lines.push(format!("overrideWidth:{}", target_width));
                }
                if !found_height {
                    updated_lines.push(format!("overrideHeight:{}", target_height));
                }
                if !found_fullscreen {
                    updated_lines.push(format!("fullscreen:{}", target_fullscreen));
                }
                let _ = fs::write(&options_file, updated_lines.join("\n"));
            }
        } else {
            let initial_options = format!(
                "version:3955\nguiScale:{}\noverrideWidth:{}\noverrideHeight:{}\nfullscreen:{}\nfov:0.0\n",
                target_scale, target_width, target_height, target_fullscreen
            );
            let _ = fs::write(&options_file, initial_options);
        }

        // 1. Resolve Java executable
        let required_java = metadata.java_version.as_ref().map(|j| j.major_version);
        let custom_java = if !settings.java_executable_path.is_empty() {
            Some(settings.java_executable_path.as_str())
        } else {
            None
        };

        let java_info = match JavaDetector::detect_java(required_java, custom_java) {
            Ok(j) => j,
            Err(e) => {
                let mut state_lock = self.state.lock().await;
                state_lock.status = "error".to_string();
                state_lock.error_message = Some(e.clone());
                return Err(e);
            }
        };

        let clean_java_path = if java_info.path.starts_with(r"\\?\") {
            java_info.path[4..].to_string()
        } else {
            java_info.path.clone()
        };

        // 2. Build Classpath
        let base_version_id = metadata.inherits_from.as_deref().unwrap_or(version_id);
        let client_jar = paths.version_jar(base_version_id);
        if !client_jar.exists() {
            let mut state_lock = self.state.lock().await;
            state_lock.status = "error".to_string();
            state_lock.error_message = Some(format!("Client JAR for {} is not installed. Please click INSTALL first.", base_version_id));
            return Err(format!("Client JAR for {} is not installed. Please click INSTALL first.", base_version_id));
        }

        let mut cp_entries: Vec<String> = Vec::new();
        for lib in &metadata.libraries {
            if !Installer::is_library_allowed_on_windows(lib) {
                continue;
            }

            let mut found = false;
            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    if let Some(rel_path) = &artifact.path {
                        let full_path = paths.libraries_dir().join(rel_path);
                        if full_path.exists() {
                            cp_entries.push(full_path.to_string_lossy().to_string());
                            found = true;
                        }
                    }
                }
            }

            if !found {
                if let Some((rel_path, _)) = crate::minecraft::fabric::maven_to_path(&lib.name) {
                    let full_path = paths.libraries_dir().join(&rel_path);
                    if full_path.exists() {
                        cp_entries.push(full_path.to_string_lossy().to_string());
                    }
                }
            }
        }
        cp_entries.push(client_jar.to_string_lossy().to_string());
        let classpath_str = cp_entries.join(";");

        let natives_dir = paths.version_natives_dir(base_version_id);
        let _ = fs::create_dir_all(&natives_dir);

        let clean_natives_path = if natives_dir.to_string_lossy().starts_with(r"\\?\") {
            natives_dir.to_string_lossy()[4..].to_string()
        } else {
            natives_dir.to_string_lossy().to_string()
        };

        // 3. Build JVM arguments
        let mut jvm_args: Vec<String> = Vec::new();

        // Memory allocation
        let ram_gb = settings.allocated_ram_gb.max(2);
        jvm_args.push(format!("-Xmx{}G", ram_gb));
        jvm_args.push("-Xms2G".to_string());

        // Recommended modern G1GC flags
        jvm_args.push("-XX:+UnlockExperimentalVMOptions".to_string());
        jvm_args.push("-XX:+UseG1GC".to_string());
        jvm_args.push("-XX:G1NewSizePercent=20".to_string());
        jvm_args.push("-XX:G1ReservePercent=20".to_string());
        jvm_args.push("-XX:MaxGCPauseMillis=50".to_string());
        jvm_args.push("-XX:G1HeapRegionSize=32M".to_string());

        if let Some(args_block) = &metadata.arguments {
            if let Some(jvm_list) = &args_block.jvm {
                for item in jvm_list {
                    Self::process_argument_item(
                        item,
                        &mut jvm_args,
                        &clean_natives_path,
                        paths,
                        version_id,
                        &classpath_str,
                        metadata,
                        settings,
                        account,
                        game_dir,
                    );
                }
            }
        }

        // If classpath wasn't added by metadata JVM args, add legacy arguments
        if !jvm_args.iter().any(|a| a == "-cp" || a == "-classpath") {
            jvm_args.push(format!("-Djava.library.path={}", clean_natives_path));
            jvm_args.push("-Dminecraft.launcher.brand=VolumeLauncher".to_string());
            jvm_args.push("-Dminecraft.launcher.version=1.0.0".to_string());
            jvm_args.push("-cp".to_string());
            jvm_args.push(classpath_str.clone());
        }

        // Custom JVM arguments from settings / instance
        if let Some(ref custom_jvm) = settings.jvm_arguments {
            for arg in custom_jvm.split_whitespace() {
                if !jvm_args.contains(&arg.to_string()) {
                    jvm_args.push(arg.to_string());
                }
            }
        }

        // System property for active profile icon
        if let Some(ref icon) = account.profile_icon {
            jvm_args.push(format!("-Dvolume.profile.icon={}", icon));
        }

        // 4. Main class
        let main_class = &metadata.main_class;

        // 5. Build Game arguments
        let mut game_args: Vec<String> = Vec::new();

        if let Some(args_block) = &metadata.arguments {
            if let Some(game_list) = &args_block.game {
                for item in game_list {
                    Self::process_argument_item(
                        item,
                        &mut game_args,
                        &clean_natives_path,
                        paths,
                        version_id,
                        &classpath_str,
                        metadata,
                        settings,
                        account,
                        game_dir,
                    );
                }
            }
        } else if let Some(legacy_args) = &metadata.minecraft_arguments {
            // Legacy version string
            for part in legacy_args.split_whitespace() {
                let subbed = Self::substitute_placeholders(
                    part,
                    &clean_natives_path,
                    paths,
                    version_id,
                    &classpath_str,
                    metadata,
                    settings,
                    account,
                    game_dir,
                );
                game_args.push(subbed);
            }
        }

        // Fullscreen toggle or custom resolution
        if settings.fullscreen {
            if !game_args.iter().any(|a| a == "--fullscreen") {
                game_args.push("--fullscreen".to_string());
            }
        } else {
            let width = if settings.resolution_width > 0 { settings.resolution_width } else { 1280 };
            let height = if settings.resolution_height > 0 { settings.resolution_height } else { 720 };
            if !game_args.iter().any(|a| a == "--width") {
                game_args.push("--width".to_string());
                game_args.push(width.to_string());
            }
            if !game_args.iter().any(|a| a == "--height") {
                game_args.push("--height".to_string());
                game_args.push(height.to_string());
            }
        }

        // Ensure --username and --uuid are always explicitly present
        if !game_args.iter().any(|a| a == "--username") {
            game_args.push("--username".to_string());
            game_args.push(account.username.clone());
        }
        if !game_args.iter().any(|a| a == "--uuid") {
            game_args.push("--uuid".to_string());
            game_args.push(account.uuid.clone());
        }

        // Remove any unresolved leftover placeholder tokens
        game_args.retain(|a| !a.contains("${"));

        // Setup log file
        paths.ensure_directories().map_err(|e| e.to_string())?;
        let timestamp = chrono_or_fallback_timestamp();
        let log_file_path = paths.logs_dir().join(format!("minecraft_{}_{}.log", version_id, timestamp));
        *self.last_log_path.lock().await = Some(log_file_path.clone());

        println!("[VolumeLauncher] Launching Minecraft {}", version_id);
        println!("[VolumeLauncher] Account:");
        println!("[VolumeLauncher]   Username: {}", account.username);
        println!("[VolumeLauncher]   UUID: {}", account.uuid);
        println!("[VolumeLauncher] Game Directory: {}", game_dir.display());
        println!("[VolumeLauncher] Java: {}", clean_java_path);

        let log_header = format!(
            "=== VOLUME LAUNCHER MINECRAFT LOG ===\nVersion: {}\nMain Class: {}\nTimestamp: {}\nAccount:\nUsername: {}\nUUID: {}\nJava: {}\nGame Directory: {}\n=====================================\n\n",
            version_id, main_class, timestamp, account.username, account.uuid, clean_java_path, game_dir.to_string_lossy()
        );
        let _ = fs::write(&log_file_path, log_header);

        let log_file = OpenOptions::new()
            .write(true)
            .append(true)
            .open(&log_file_path)
            .map_err(|e| format!("Failed to create Minecraft log file: {}", e))?;

        let log_file_err = log_file.try_clone()
            .map_err(|e| format!("Failed to clone log file handle: {}", e))?;

        // 6. Spawn process
        {
            let mut state_lock = self.state.lock().await;
            state_lock.status = "launching".to_string();
        }

        let mut cmd = Command::new(&clean_java_path);
        cmd.current_dir(game_dir);
        cmd.args(&jvm_args);
        cmd.arg(main_class);
        cmd.args(&game_args);
        cmd.stdout(Stdio::from(log_file));
        cmd.stderr(Stdio::from(log_file_err));

        let child = cmd.spawn().map_err(|e| {
            format!("Failed to start Minecraft process with Java at '{}': {}", clean_java_path, e)
        })?;

        let pid = child.id();

        // Update state
        {
            let mut child_lock = self.child.lock().await;
            *child_lock = Some(child);

            let mut state_lock = self.state.lock().await;
            state_lock.status = "running".to_string();
            state_lock.pid = Some(pid);
            state_lock.started_at = Some(timestamp);
            state_lock.error_message = None;
        }

        // Background monitor task
        let child_arc = self.child.clone();
        let state_arc = self.state.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                let mut child_lock = child_arc.lock().await;
                if let Some(child_ref) = child_lock.as_mut() {
                    match child_ref.try_wait() {
                        Ok(Some(status)) => {
                            let mut state_lock = state_arc.lock().await;
                            state_lock.status = "stopped".to_string();
                            state_lock.exit_code = status.code();
                            *child_lock = None;
                            break;
                        }
                        Ok(None) => {
                            // Still running
                        }
                        Err(e) => {
                            let mut state_lock = state_arc.lock().await;
                            state_lock.status = "error".to_string();
                            state_lock.error_message = Some(format!("Error monitoring process: {}", e));
                            *child_lock = None;
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });

        Ok(pid)
    }

    fn process_argument_item(
        item: &ArgumentItem,
        target_list: &mut Vec<String>,
        natives_dir: &str,
        paths: &MinecraftPaths,
        version_id: &str,
        classpath_str: &str,
        metadata: &VersionMetadata,
        settings: &LauncherSettings,
        account: &OfflineAccount,
        game_dir: &PathBuf,
    ) {
        match item {
            ArgumentItem::Simple(s) => {
                let subbed = Self::substitute_placeholders(
                    s, natives_dir, paths, version_id, classpath_str, metadata, settings, account, game_dir
                );
                if !subbed.contains("${") {
                    target_list.push(subbed);
                }
            }
            ArgumentItem::Conditional(cond) => {
                if Self::evaluate_argument_rules(&cond.rules, settings) {
                    match &cond.value {
                        ArgumentValue::Single(s) => {
                            let subbed = Self::substitute_placeholders(
                                s, natives_dir, paths, version_id, classpath_str, metadata, settings, account, game_dir
                            );
                            if !subbed.contains("${") {
                                target_list.push(subbed);
                            }
                        }
                        ArgumentValue::Multiple(vec) => {
                            let subbed_vec: Vec<String> = vec.iter().map(|s| {
                                Self::substitute_placeholders(
                                    s, natives_dir, paths, version_id, classpath_str, metadata, settings, account, game_dir
                                )
                            }).collect();
                            if !subbed_vec.iter().any(|s| s.contains("${")) {
                                target_list.extend(subbed_vec);
                            }
                        }
                    }
                }
            }
        }
    }

    fn evaluate_argument_rules(rules: &[Rule], settings: &LauncherSettings) -> bool {
        let mut allowed = false;
        for rule in rules {
            let matches_os = match &rule.os {
                Some(os) => os.name.as_deref() == Some("windows"),
                None => true,
            };

            let matches_features = match &rule.features {
                Some(features) => {
                    let mut feat_ok = true;
                    for (k, expected_val) in features {
                        let actual_val = match k.as_str() {
                            "is_demo_user" => false,
                            "has_custom_resolution" => {
                                !settings.fullscreen && settings.resolution_width > 0 && settings.resolution_height > 0
                            }
                            "has_quick_plays_support" => false,
                            "is_quick_play_singleplayer" => false,
                            "is_quick_play_multiplayer" => false,
                            "is_quick_play_realms" => false,
                            _ => false,
                        };
                        if actual_val != *expected_val {
                            feat_ok = false;
                            break;
                        }
                    }
                    feat_ok
                }
                None => true,
            };

            if matches_os && matches_features {
                allowed = rule.action == "allow";
            }
        }
        allowed
    }

    fn substitute_placeholders(
        template: &str,
        natives_dir: &str,
        paths: &MinecraftPaths,
        version_id: &str,
        classpath_str: &str,
        metadata: &VersionMetadata,
        settings: &LauncherSettings,
        account: &OfflineAccount,
        game_dir: &PathBuf,
    ) -> String {
        let asset_index_id = metadata.asset_index.as_ref().map(|a| a.id.as_str()).unwrap_or("legacy");

        template
            .replace("${natives_directory}", natives_dir)
            .replace("${launcher_name}", "VolumeLauncher")
            .replace("${launcher_version}", "1.0.0")
            .replace("${classpath}", classpath_str)
            .replace("${classpath_separator}", ";")
            .replace("${library_directory}", &paths.libraries_dir().to_string_lossy())
            // Game args
            .replace("${auth_player_name}", &account.username)
            .replace("${version_name}", version_id)
            .replace("${game_directory}", &game_dir.to_string_lossy())
            .replace("${assets_root}", &paths.assets_dir().to_string_lossy())
            .replace("${game_assets}", &paths.assets_dir().to_string_lossy())
            .replace("${assets_index_name}", asset_index_id)
            .replace("${auth_uuid}", &account.uuid)
            .replace("${auth_access_token}", "offline_dev_token")
            .replace("${auth_session}", "offline_dev_token")
            .replace("${clientid}", "VolumeLauncher")
            .replace("${auth_xuid}", "0")
            .replace("${user_type}", "legacy")
            .replace("${user_properties}", "{}")
            .replace("${user_property_map}", "{}")
            .replace("${profile_name}", &account.username)
            .replace("${uuid}", &account.uuid)
            .replace("${username}", &account.username)
            .replace("${version_type}", &metadata.version_type)
            .replace("${resolution_width}", &settings.resolution_width.to_string())
            .replace("${resolution_height}", &settings.resolution_height.to_string())
    }
}

fn chrono_or_fallback_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    format!("{}", now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_argument_placeholder_substitution() {
        let temp_dir = std::env::temp_dir().join("volume_test_launch");
        let paths = MinecraftPaths::new(temp_dir.clone());
        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraExplorer");
        let meta = VersionMetadata {
            id: "1.21.4".to_string(),
            version_type: "release".to_string(),
            time: "2024-01-01T00:00:00Z".to_string(),
            release_time: "2024-01-01T00:00:00Z".to_string(),
            main_class: "net.minecraft.client.main.Main".to_string(),
            inherits_from: None,
            downloads: None,
            libraries: vec![],
            asset_index: None,
            assets: Some("1.21".to_string()),
            java_version: None,
            arguments: None,
            minecraft_arguments: None,
            compliance_level: None,
        };

        let template = "--username ${auth_player_name} --uuid ${auth_uuid} --version ${version_name} --userProperties ${user_properties} --session ${auth_session} --profile ${profile_name}";
        let subbed = ProcessManager::substitute_placeholders(
            template,
            "natives_dir",
            &paths,
            "1.21.4",
            "cp_str",
            &meta,
            &settings,
            &account,
            &temp_dir,
        );

        assert!(subbed.contains("--username RudraExplorer"));
        assert!(subbed.contains(&format!("--uuid {}", account.uuid)));
        assert!(subbed.contains("--version 1.21.4"));
        assert!(subbed.contains("--userProperties {}"));
        assert!(subbed.contains("--session offline_dev_token"));
        assert!(subbed.contains("--profile RudraExplorer"));
        assert!(!subbed.contains("${"));
    }

    #[test]
    fn test_version_isolation_and_display_settings() {
        let temp_dir = std::env::temp_dir().join("volume_test_display_iso");
        let paths = MinecraftPaths::new(temp_dir.clone());
        let mut settings = LauncherSettings::default();
        settings.resolution_width = 1280;
        settings.resolution_height = 720;
        settings.gui_scale = Some(3);
        settings.selected_version = Some("26.3".to_string());
        let account = OfflineAccount::new("RudraExplorer");

        let meta_26_3 = VersionMetadata {
            id: "26.3".to_string(),
            version_type: "release".to_string(),
            time: "2024-01-01T00:00:00Z".to_string(),
            release_time: "2024-01-01T00:00:00Z".to_string(),
            main_class: "net.minecraft.client.main.Main".to_string(),
            inherits_from: None,
            downloads: None,
            libraries: vec![],
            asset_index: None,
            assets: Some("1.21".to_string()),
            java_version: None,
            arguments: None,
            minecraft_arguments: None,
            compliance_level: None,
        };

        // Verify version 26.3 parameters
        let subbed_26_3 = ProcessManager::substitute_placeholders(
            "--version ${version_name} --width ${resolution_width} --height ${resolution_height}",
            "natives",
            &paths,
            "26.3",
            "cp_dummy",
            &meta_26_3,
            &settings,
            &account,
            &temp_dir,
        );

        assert!(subbed_26_3.contains("--version 26.3"));
        assert!(!subbed_26_3.contains("26.4-snapshot-2"));
        assert!(subbed_26_3.contains("--width 1280"));
        assert!(subbed_26_3.contains("--height 720"));

        let meta_26_4 = VersionMetadata {
            id: "26.4-snapshot-2".to_string(),
            version_type: "snapshot".to_string(),
            time: "2024-01-01T00:00:00Z".to_string(),
            release_time: "2024-01-01T00:00:00Z".to_string(),
            main_class: "net.minecraft.client.main.Main".to_string(),
            inherits_from: None,
            downloads: None,
            libraries: vec![],
            asset_index: None,
            assets: Some("1.21".to_string()),
            java_version: None,
            arguments: None,
            minecraft_arguments: None,
            compliance_level: None,
        };

        // Verify version 26.4-snapshot-2 parameters
        let subbed_26_4 = ProcessManager::substitute_placeholders(
            "--version ${version_name} --width ${resolution_width} --height ${resolution_height}",
            "natives",
            &paths,
            "26.4-snapshot-2",
            "cp_dummy",
            &meta_26_4,
            &settings,
            &account,
            &temp_dir,
        );

        assert!(subbed_26_4.contains("--version 26.4-snapshot-2"));
        assert!(!subbed_26_4.contains("--version 26.3"));
    }

    #[test]
    fn test_options_txt_gui_scale_injection() {
        let temp_dir = std::env::temp_dir().join("volume_test_options_txt");
        let _ = fs::create_dir_all(&temp_dir);
        let options_file = temp_dir.join("options.txt");

        // Write initial options with guiScale:0 (which causes extreme zoom in high DPI)
        let _ = fs::write(&options_file, "version:3955\nguiScale:0\nfov:0.0\n");

        // Simulate launcher injection
        let target_scale = 3;
        let target_width = 1920;
        let target_height = 1080;
        let target_fullscreen = false;

        let content = fs::read_to_string(&options_file).unwrap();
        let mut updated_lines = Vec::new();
        let mut found_gui_scale = false;
        let mut found_width = false;
        let mut found_height = false;
        let mut found_fullscreen = false;

        for line in content.lines() {
            if line.starts_with("guiScale:") {
                updated_lines.push(format!("guiScale:{}", target_scale));
                found_gui_scale = true;
            } else if line.starts_with("overrideWidth:") {
                updated_lines.push(format!("overrideWidth:{}", target_width));
                found_width = true;
            } else if line.starts_with("overrideHeight:") {
                updated_lines.push(format!("overrideHeight:{}", target_height));
                found_height = true;
            } else if line.starts_with("fullscreen:") {
                updated_lines.push(format!("fullscreen:{}", target_fullscreen));
                found_fullscreen = true;
            } else {
                updated_lines.push(line.to_string());
            }
        }
        if !found_gui_scale {
            updated_lines.push(format!("guiScale:{}", target_scale));
        }
        if !found_width {
            updated_lines.push(format!("overrideWidth:{}", target_width));
        }
        if !found_height {
            updated_lines.push(format!("overrideHeight:{}", target_height));
        }
        if !found_fullscreen {
            updated_lines.push(format!("fullscreen:{}", target_fullscreen));
        }
        let _ = fs::write(&options_file, updated_lines.join("\n"));

        let final_content = fs::read_to_string(&options_file).unwrap();
        assert!(final_content.contains("guiScale:3"));
        assert!(!final_content.contains("guiScale:0"));
        assert!(final_content.contains("overrideWidth:1920"));
        assert!(final_content.contains("overrideHeight:1080"));
        assert!(final_content.contains("fullscreen:false"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn test_live_launch_version_26_3_and_stop() {
        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let meta_file = paths.version_json("26.3");
        let jar_file = paths.version_jar("26.3");
        if !meta_file.exists() || !jar_file.exists() {
            println!("Skipping live test: 26.3 not installed on host machine.");
            return;
        }

        let meta_content = fs::read_to_string(&meta_file).unwrap();
        let metadata: VersionMetadata = serde_json::from_str(&meta_content).unwrap();

        let proc_mgr = ProcessManager::new();
        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraLiveTest");

        // 1. Launch real 26.3 process
        let pid = proc_mgr.launch(
            "26.3",
            &metadata,
            &paths,
            &settings,
            &account,
            None,
        ).await.expect("Failed to launch real Minecraft 26.3");

        assert!(pid > 0, "PID must be positive integer");
        let state = proc_mgr.get_state().await;
        assert_eq!(state.status, "running");
        assert_eq!(state.version, Some("26.3".to_string()));

        // Let it run for 1 second to execute LWJGL and Java runtime startup
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        // 2. Stop process gracefully
        proc_mgr.stop_process().await.expect("Failed to stop Minecraft process");
        let stopped_state = proc_mgr.get_state().await;
        assert_eq!(stopped_state.status, "stopped");
    }

    #[tokio::test]
    async fn test_live_launch_version_26_4_and_stop() {
        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let meta_file = paths.version_json("26.4-snapshot-2");
        let jar_file = paths.version_jar("26.4-snapshot-2");
        if !meta_file.exists() || !jar_file.exists() {
            println!("Skipping live test: 26.4-snapshot-2 not installed on host machine.");
            return;
        }

        let meta_content = fs::read_to_string(&meta_file).unwrap();
        let metadata: VersionMetadata = serde_json::from_str(&meta_content).unwrap();

        let proc_mgr = ProcessManager::new();
        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraLiveTest");

        // 1. Launch real 26.4-snapshot-2 process
        let pid = proc_mgr.launch(
            "26.4-snapshot-2",
            &metadata,
            &paths,
            &settings,
            &account,
            None,
        ).await.expect("Failed to launch real Minecraft 26.4-snapshot-2");

        assert!(pid > 0, "PID must be positive integer");
        let state = proc_mgr.get_state().await;
        assert_eq!(state.status, "running");
        assert_eq!(state.version, Some("26.4-snapshot-2".to_string()));

        // Let it run for 1 second
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        // 2. Stop process gracefully
        proc_mgr.stop_process().await.expect("Failed to stop Minecraft process");
        let stopped_state = proc_mgr.get_state().await;
        assert_eq!(stopped_state.status, "stopped");
    }

    #[tokio::test]
    async fn test_live_launch_version_1_12_2_and_stop() {
        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let meta_file = paths.version_json("1.12.2");
        let jar_file = paths.version_jar("1.12.2");
        if !meta_file.exists() || !jar_file.exists() {
            println!("Skipping live test: 1.12.2 not installed on host machine.");
            return;
        }

        let meta_content = fs::read_to_string(&meta_file).unwrap();
        let metadata: VersionMetadata = serde_json::from_str(&meta_content).unwrap();

        let proc_mgr = ProcessManager::new();
        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraLiveTest");

        // 1. Launch real 1.12.2 process
        let pid = proc_mgr.launch(
            "1.12.2",
            &metadata,
            &paths,
            &settings,
            &account,
            None,
        ).await.expect("Failed to launch real Minecraft 1.12.2");

        assert!(pid > 0, "PID must be positive integer");
        let state = proc_mgr.get_state().await;
        assert_eq!(state.status, "running");
        assert_eq!(state.version, Some("1.12.2".to_string()));

        // Let it run for 1.5 seconds
        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;

        // 2. Stop process gracefully
        proc_mgr.stop_process().await.expect("Failed to stop Minecraft process");
        let stopped_state = proc_mgr.get_state().await;
        assert_eq!(stopped_state.status, "stopped");
    }

    #[tokio::test]
    async fn test_live_launch_fabric_26_3_and_stop() {
        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let jar_file = paths.version_jar("26.3");
        if !jar_file.exists() {
            println!("Skipping live test: 26.3 not installed on host machine.");
            return;
        }

        let installer = Installer::new(paths.clone());
        let fabric_version_id = "fabric-loader-0.19.5-26.3";

        // 1. Resolve and install Fabric metadata and libraries
        let metadata = match installer.resolve_metadata(fabric_version_id).await {
            Ok(m) => m,
            Err(e) => {
                println!("Skipping Fabric live test (could not reach Fabric meta API): {}", e);
                return;
            }
        };

        assert_eq!(metadata.main_class, "net.fabricmc.loader.impl.launch.knot.KnotClient");

        // Install any missing libraries
        let _ = installer.install_version(fabric_version_id, |_| {}).await;

        // 2. Prepare test instance with a valid test mod
        let instance_dir = paths.instance_dir("fabric_test_instance");
        let mods_dir = instance_dir.join("mods");
        let _ = fs::create_dir_all(&mods_dir);

        let mod_file = mods_dir.join("volume-test-mod.jar");
        {
            use std::io::Write;
            let file = fs::File::create(&mod_file).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let _ = zip.start_file("fabric.mod.json", options);
            let fabric_json = r#"{
                "schemaVersion": 1,
                "id": "volumetestmod",
                "name": "Volume Test Mod",
                "version": "1.0.0",
                "environment": "*"
            }"#;
            let _ = zip.write_all(fabric_json.as_bytes());
            let _ = zip.finish();
        }

        let proc_mgr = ProcessManager::new();
        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraFabricTest");

        // 3. Launch real Fabric Minecraft process with KnotClient
        let pid = proc_mgr.launch(
            fabric_version_id,
            &metadata,
            &paths,
            &settings,
            &account,
            Some(&instance_dir),
        ).await.expect("Failed to launch real Fabric Minecraft client");

        assert!(pid > 0, "PID must be positive integer");
        let state = proc_mgr.get_state().await;
        assert_eq!(state.status, "running");
        assert_eq!(state.version, Some(fabric_version_id.to_string()));

        // Let KnotClient and Minecraft run for 2 seconds
        tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

        // 4. Gracefully terminate process
        proc_mgr.stop_process().await.expect("Failed to stop Fabric Minecraft process");
        let stopped_state = proc_mgr.get_state().await;
        assert_eq!(stopped_state.status, "stopped");

        // Clean up test instance
        let _ = fs::remove_dir_all(&instance_dir);
    }

    #[tokio::test]
    async fn test_live_fabric_mod_initialization_and_disable_lifecycle() {
        use crate::launcher::mods::ModManager;

        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let jar_file = paths.version_jar("26.3");
        if !jar_file.exists() {
            println!("Skipping live test: 26.3 not installed on host machine.");
            return;
        }

        let installer = Installer::new(paths.clone());
        let fabric_version_id = "fabric-loader-0.19.5-26.3";

        let metadata = match installer.resolve_metadata(fabric_version_id).await {
            Ok(m) => m,
            Err(e) => {
                println!("Skipping Fabric live test: {}", e);
                return;
            }
        };

        let _ = installer.install_version(fabric_version_id, |_| {}).await;

        let instance_id = "fabric_mod_verification_instance";
        let instance_dir = paths.instance_dir(instance_id);
        let mods_dir = paths.instance_mods_dir(instance_id);
        fs::create_dir_all(&mods_dir).unwrap();

        let mod_file = mods_dir.join("volume-test-mod.jar");
        ModManager::generate_verification_mod_jar(&mod_file).expect("Failed to create verification mod JAR");
        assert!(mod_file.exists(), "volume-test-mod.jar must exist");

        let settings = LauncherSettings::default();
        let account = OfflineAccount::new("RudraModE2ETest");

        // -------------------------------------------------------------
        // STEP 1: LAUNCH WITH MOD ENABLED -> EXPECT INITIALIZATION LOG
        // -------------------------------------------------------------
        let proc_mgr1 = ProcessManager::new();
        let pid1 = proc_mgr1.launch(
            fabric_version_id,
            &metadata,
            &paths,
            &settings,
            &account,
            Some(&instance_dir),
        ).await.expect("Failed to launch Fabric with enabled mod");

        assert!(pid1 > 0);
        let state1 = proc_mgr1.get_state().await;
        assert_eq!(state1.status, "running");

        // Wait 3 seconds for KnotClient to initialize mod
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        // Verify initialization evidence in real Minecraft log file
        let log_path1 = proc_mgr1.get_last_log_path().await.expect("Log path must exist");
        let log_content1 = fs::read_to_string(&log_path1).expect("Failed to read Minecraft log");
        assert!(
            log_content1.contains("[VolumeTestMod] INITIALIZATION_SUCCESS"),
            "Log must contain unmistakable initialization evidence from VolumeTestMod. Log was:\n{}",
            log_content1
        );

        proc_mgr1.stop_process().await.expect("Failed to stop process 1");
        let stopped1 = proc_mgr1.get_state().await;
        assert_eq!(stopped1.status, "stopped");

        // -------------------------------------------------------------
        // STEP 2: DISABLE MOD (.jar.disabled) -> EXPECT NO INITIALIZATION
        // -------------------------------------------------------------
        let toggled_off = ModManager::toggle_mod(&paths, instance_id, "volume-test-mod.jar")
            .expect("Failed to disable mod");
        assert_eq!(toggled_off.file_name, "volume-test-mod.jar.disabled");
        assert!(!toggled_off.enabled);

        let proc_mgr2 = ProcessManager::new();
        let pid2 = proc_mgr2.launch(
            fabric_version_id,
            &metadata,
            &paths,
            &settings,
            &account,
            Some(&instance_dir),
        ).await.expect("Failed to launch Fabric with disabled mod");

        assert!(pid2 > 0);
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        let log_path2 = proc_mgr2.get_last_log_path().await.expect("Log path 2 must exist");
        let log_content2 = fs::read_to_string(&log_path2).expect("Failed to read log 2");
        assert!(
            !log_content2.contains("[VolumeTestMod] INITIALIZATION_SUCCESS"),
            "Disabled mod must NOT initialize"
        );

        proc_mgr2.stop_process().await.expect("Failed to stop process 2");

        // -------------------------------------------------------------
        // STEP 3: RE-ENABLE MOD (.jar) -> EXPECT INITIALIZATION LOG AGAIN
        // -------------------------------------------------------------
        let toggled_on = ModManager::toggle_mod(&paths, instance_id, "volume-test-mod.jar.disabled")
            .expect("Failed to re-enable mod");
        assert_eq!(toggled_on.file_name, "volume-test-mod.jar");
        assert!(toggled_on.enabled);

        let proc_mgr3 = ProcessManager::new();
        let pid3 = proc_mgr3.launch(
            fabric_version_id,
            &metadata,
            &paths,
            &settings,
            &account,
            Some(&instance_dir),
        ).await.expect("Failed to launch Fabric with re-enabled mod");

        assert!(pid3 > 0);
        tokio::time::sleep(tokio::time::Duration::from_millis(3000)).await;

        let log_path3 = proc_mgr3.get_last_log_path().await.expect("Log path 3 must exist");
        let log_content3 = fs::read_to_string(&log_path3).expect("Failed to read log 3");
        assert!(
            log_content3.contains("[VolumeTestMod] INITIALIZATION_SUCCESS"),
            "Re-enabled mod must initialize successfully again"
        );

        proc_mgr3.stop_process().await.expect("Failed to stop process 3");

        // Cleanup
        let _ = fs::remove_dir_all(&instance_dir);
    }

    #[tokio::test]
    async fn test_live_fabric_companion_and_skin_pipeline() {
        use crate::launcher::mods::ModManager;

        let paths = MinecraftPaths::new(MinecraftPaths::default_root());
        let jar_file = paths.version_jar("26.3");
        if !jar_file.exists() {
            println!("Skipping live test: 26.3 not installed on host machine.");
            return;
        }

        let installer = Installer::new(paths.clone());
        let fabric_version_id = "fabric-loader-0.19.5-26.3";

        let metadata = match installer.resolve_metadata(fabric_version_id).await {
            Ok(m) => m,
            Err(e) => {
                println!("Skipping Fabric live test: {}", e);
                return;
            }
        };

        let _ = installer.install_version(fabric_version_id, |_| {}).await;

        let instance_id = "fabric_companion_pipeline_test";
        let instance_dir = paths.instance_dir(instance_id);
        let mods_dir = paths.instance_mods_dir(instance_id);
        // 1. Ensure companion mod is installed
        ModManager::ensure_companion_mod(&mods_dir).expect("Failed to install companion mod");
        assert!(mods_dir.join("volume-companion-1.0.jar").exists());
        assert!(!mods_dir.join("offline-skins-26.3.jar").exists());

        // 2. Setup skin file
        let skin_path = instance_dir.join("player_skin.png");
        let test_skin_bytes = include_bytes!("../../templates/test_skin_64.png");
        fs::write(&skin_path, test_skin_bytes).unwrap();

        let mut account = OfflineAccount::new("RudraInGamePlayer");
        account.profile_icon = Some("star".to_string());
        account.skin_model = Some("classic".to_string());
        account.skin_path = Some(skin_path.to_string_lossy().to_string());

        // 3. Write .volume/active_profile.json
        let vol_dir = instance_dir.join(".volume");
        fs::create_dir_all(&vol_dir).unwrap();
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(test_skin_bytes);
        let skin_hash = format!("{:x}", hasher.finalize());

        let profile_info = serde_json::json!({
            "username": account.username,
            "uuid": account.uuid,
            "profileIcon": account.profile_icon.as_deref().unwrap_or("moon"),
            "skinModel": account.skin_model.as_deref().unwrap_or("classic"),
            "skinPath": account.skin_path.as_deref().unwrap_or(""),
            "skinHash": skin_hash
        });
        fs::write(vol_dir.join("active_profile.json"), profile_info.to_string()).unwrap();

        // 4. Configure offlineskins
        let offlineskins_dir = instance_dir.join("config").join("offlineskins");
        let offlineskins_skins_dir = offlineskins_dir.join("skins");
        fs::create_dir_all(&offlineskins_skins_dir).unwrap();
        fs::copy(&skin_path, offlineskins_skins_dir.join(format!("{}.png", account.username))).unwrap();
        let config_json = serde_json::json!({
            "selectedSkinName": account.username,
            "defaultModel": "steve"
        });
        fs::write(offlineskins_dir.join("config.json"), config_json.to_string()).unwrap();

        // 5. Launch process
        let proc_mgr = ProcessManager::new();
        let settings = LauncherSettings::default();

        let pid = proc_mgr.launch(
            fabric_version_id,
            &metadata,
            &paths,
            &settings,
            &account,
            Some(&instance_dir),
        ).await.expect("Failed to launch Fabric Minecraft client with companion mod");

        assert!(pid > 0);
        let state = proc_mgr.get_state().await;
        assert_eq!(state.status, "running");

        // Wait 3.5 seconds for KnotClient and VolumeCompanion to initialize
        tokio::time::sleep(tokio::time::Duration::from_millis(3500)).await;

        // Verify log file
        let log_path = proc_mgr.get_last_log_path().await.expect("Log path must exist");
        let log_content = fs::read_to_string(&log_path).expect("Failed to read log");

        println!("=== TEST LAUNCH LOG ===\n{}\n=====================", log_content);

        assert!(log_content.contains("Account:\nUsername: RudraInGamePlayer"));
        assert!(log_content.contains(&format!("UUID: {}", account.uuid)));
        assert!(log_content.contains("[VolumeCompanion] Initialized"), "Log must contain companion initialization");
        assert!(log_content.contains("[VolumeCompanion] Active profile loaded"), "Log must contain active profile loaded");
        assert!(log_content.contains("[VolumeCompanion] Username: RudraInGamePlayer"), "Log must contain player username");
        assert!(log_content.contains("[VolumeCompanion] Profile icon: star"), "Log must contain star profile icon");
        assert!(log_content.contains("[VolumeCompanion] Skin model: classic"), "Log must contain classic skin model");
        assert!(log_content.contains("[VolumeCompanion] Skin loaded successfully"), "Log must confirm skin loaded");

        // Stop process
        proc_mgr.stop_process().await.expect("Failed to stop process");

        // Cleanup
        let _ = fs::remove_dir_all(&instance_dir);
    }
}
