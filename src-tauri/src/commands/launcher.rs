use std::fs;
use tauri::State;
use crate::state::AppState;
use crate::models::{ProcessState, LauncherSettings};

#[tauri::command]
pub async fn launch_minecraft(
    state: State<'_, AppState>,
    version_id: Option<String>,
    instance_id: Option<String>,
) -> Result<u32, String> {
    let base_settings = state.settings.lock().await.clone();

    // 1. Determine effective version, instance directory, and instance settings
    let (effective_version_id, instance_path, opt_inst_id, opt_inst): (String, Option<std::path::PathBuf>, Option<String>, Option<crate::models::Instance>) = {
        let instance_mgr = state.instance_manager.lock().await;

        let target_inst = if let Some(ref i_id) = instance_id {
            instance_mgr.get_instances().into_iter().find(|i| &i.id == i_id)
        } else {
            instance_mgr.get_selected_instance()
        };

        if let Some(inst) = target_inst {
            let v_id = if inst.loader == "fabric" {
                if let Some(ref explicit_v) = version_id {
                    if explicit_v.starts_with("fabric-loader-") {
                        explicit_v.clone()
                    } else if let Some(ref f_ver) = inst.fabric_version {
                        format!("fabric-loader-{}-{}", f_ver, inst.version_id)
                    } else {
                        inst.version_id.clone()
                    }
                } else if let Some(ref f_ver) = inst.fabric_version {
                    format!("fabric-loader-{}-{}", f_ver, inst.version_id)
                } else {
                    inst.version_id.clone()
                }
            } else if let Some(ref explicit_v) = version_id {
                explicit_v.clone()
            } else {
                inst.version_id.clone()
            };

            let path = if let Some(ref custom_dir) = inst.game_dir {
                if !custom_dir.trim().is_empty() {
                    std::path::PathBuf::from(custom_dir)
                } else {
                    state.paths.instance_dir(&inst.id)
                }
            } else {
                state.paths.instance_dir(&inst.id)
            };
            (v_id, Some(path), Some(inst.id.clone()), Some(inst))
        } else if let Some(ref explicit_v) = version_id {
            let path = if !base_settings.game_directory.trim().is_empty() {
                std::path::PathBuf::from(&base_settings.game_directory)
            } else {
                state.paths.root.clone()
            };
            (explicit_v.clone(), Some(path), None, None)
        } else {
            return Err("No Minecraft version or instance specified for launch.".to_string());
        }
    };

    // 2. Fetch/resolve version metadata (supports both Vanilla and Fabric)
    let metadata = state.installer.resolve_metadata(&effective_version_id).await
        .map_err(|e| format!("Could not load metadata for {}: {}", effective_version_id, e))?;

    // If Fabric version, make sure Fabric loader libraries are installed
    if effective_version_id.starts_with("fabric-loader-") {
        let mut missing_fab_lib = false;
        for lib in &metadata.libraries {
            if let Some((rel_path, _)) = crate::minecraft::fabric::maven_to_path(&lib.name) {
                if !state.paths.libraries_dir().join(&rel_path).exists() {
                    missing_fab_lib = true;
                    break;
                }
            }
        }
        if missing_fab_lib {
            state.installer.install_version(&effective_version_id, |_| {}).await
                .map_err(|e| format!("Failed to auto-install missing Fabric libraries: {}", e))?;
        }
    }

    // 3. Read current settings and apply Instance-specific configuration overrides
    let mut settings = state.settings.lock().await.clone();
    if let Some(ref inst) = opt_inst {
        if let Some(ram) = inst.memory_gb {
            settings.allocated_ram_gb = ram;
        }
        if let Some(ref jp) = inst.java_path {
            if !jp.trim().is_empty() {
                settings.java_executable_path = jp.clone();
            }
        }
        if let Some(w) = inst.resolution_width {
            settings.resolution_width = w;
        }
        if let Some(h) = inst.resolution_height {
            settings.resolution_height = h;
        }
        if let Some(fs_mode) = inst.fullscreen {
            settings.fullscreen = fs_mode;
        }
        if let Some(ref ja) = inst.jvm_args {
            if !ja.trim().is_empty() {
                settings.jvm_arguments = Some(ja.clone());
            }
        }
    }

    // 4. Ensure or disable Volume Companion mod based on settings
    if effective_version_id.starts_with("fabric-loader-") {
        if let Some(ref inst_path) = instance_path {
            let mods_dir = inst_path.join("mods");
            let _ = fs::create_dir_all(&mods_dir);
            if settings.enable_volume_profile_integration {
                let _ = crate::launcher::mods::ModManager::ensure_companion_mod(&mods_dir);
            } else {
                crate::launcher::mods::ModManager::disable_companion_mod(&mods_dir);
            }
        }
    }

    // 5. Read current selected offline account
    let selected_account = {
        let account_mgr = state.account_manager.lock().await;
        account_mgr.get_selected_account()
            .ok_or_else(|| "No offline account found. Please create an account first.".to_string())?
    };

    // Extract raw skin bytes from file path or base64 data URL
    let mut skin_bytes: Option<Vec<u8>> = None;
    if let Some(ref s_path) = selected_account.skin_path {
        if s_path.starts_with("data:image/") {
            if let Some(comma_idx) = s_path.find(',') {
                if let Ok(bytes) = crate::commands::accounts::base64_decode(&s_path[comma_idx + 1..]) {
                    skin_bytes = Some(bytes);
                }
            }
        } else {
            let p = std::path::Path::new(s_path);
            if p.exists() {
                skin_bytes = fs::read(p).ok();
            } else if let Ok(bytes) = crate::commands::accounts::base64_decode(s_path) {
                if bytes.len() >= 8 && &bytes[0..8] == &[137, 80, 78, 71, 13, 10, 26, 10] {
                    skin_bytes = Some(bytes);
                }
            }
        }
    }

    // Calculate skin hash if skin exists
    let skin_hash = skin_bytes.as_ref().map(|bytes| {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    });

    // Save active profile configuration and configure offline skins for Volume companion mod
    if let Some(ref inst_dir) = instance_path {
        let vol_dir = inst_dir.join(".volume");
        let _ = fs::create_dir_all(&vol_dir);

        let skin_dest = vol_dir.join("skin.png");
        let effective_skin_path = if let Some(ref bytes) = skin_bytes {
            let _ = fs::write(&skin_dest, bytes);
            skin_dest.to_string_lossy().to_string()
        } else {
            if skin_dest.exists() {
                let _ = fs::remove_file(&skin_dest);
            }
            String::new()
        };

        let profile_info = serde_json::json!({
            "username": selected_account.username,
            "uuid": selected_account.uuid,
            "profileIcon": selected_account.profile_icon.as_deref().unwrap_or("moon"),
            "skinModel": selected_account.skin_model.as_deref().unwrap_or("classic"),
            "skinPath": effective_skin_path,
            "skinHash": skin_hash.as_deref().unwrap_or("")
        });
        let _ = fs::write(vol_dir.join("active_profile.json"), profile_info.to_string());

        // Configure offline skins
        let offlineskins_dir = inst_dir.join("config").join("offlineskins");
        let offlineskins_skins_dir = offlineskins_dir.join("skins");
        let _ = fs::create_dir_all(&offlineskins_skins_dir);

        let skin_model = selected_account.skin_model.as_deref().unwrap_or("classic");
        let default_model = if skin_model == "slim" { "alex" } else { "steve" };

        let mut selected_skin_name = String::new();
        if let Some(ref bytes) = skin_bytes {
            let dest_skin = offlineskins_skins_dir.join(format!("{}.png", selected_account.username));
            let _ = fs::write(dest_skin, bytes);
            selected_skin_name = selected_account.username.clone();
        }

        let config_json = serde_json::json!({
            "selectedSkinName": selected_skin_name,
            "defaultModel": default_model
        });
        let _ = fs::write(offlineskins_dir.join("config.json"), config_json.to_string());
    }

    // 5. Launch process with selected account and instance directory
    let pid = state.process_manager.launch(
        &effective_version_id,
        &metadata,
        &state.paths,
        &settings,
        &selected_account,
        instance_path.as_ref(),
    ).await?;

    // 6. Update last_played_at only after Minecraft process has successfully launched
    {
        let mut account_mgr = state.account_manager.lock().await;
        let _ = account_mgr.update_last_played(&selected_account.id);
    }
    if let Some(inst_id) = opt_inst_id {
        let mut instance_mgr = state.instance_manager.lock().await;
        let _ = instance_mgr.update_last_played(&inst_id);
    }

    Ok(pid)
}

#[tauri::command]
pub async fn stop_minecraft(
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.process_manager.stop_process().await
}

#[tauri::command]
pub async fn get_minecraft_process_state(
    state: State<'_, AppState>,
) -> Result<ProcessState, String> {
    Ok(state.process_manager.get_state().await)
}

#[tauri::command]
pub async fn get_launcher_settings(
    state: State<'_, AppState>,
) -> Result<LauncherSettings, String> {
    Ok(state.settings.lock().await.clone())
}

#[tauri::command]
pub async fn save_launcher_settings(
    state: State<'_, AppState>,
    settings: LauncherSettings,
) -> Result<(), String> {
    let mut lock = state.settings.lock().await;
    *lock = settings.clone();

    // Persist to disk
    let settings_file = state.paths.settings_file();
    if let Ok(json) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(settings_file, json);
    }

    Ok(())
}

#[tauri::command]
pub async fn pick_directory(default_path: Option<String>) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            let default_clause = default_path
                .filter(|p| !p.trim().is_empty())
                .map(|p| format!("$f.SelectedPath = '{}';", p.replace('\'', "''")))
                .unwrap_or_default();
            let script = format!(
                "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Minecraft Game Directory'; {} if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $f.SelectedPath }}",
                default_clause
            );
            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .output()
                .map_err(|e| format!("Failed to open directory dialog: {}", e))?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_jar_files() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            let script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select Minecraft Mod JARs'; $d.Filter = 'Minecraft Mods (*.jar)|*.jar|All Files (*.*)|*.*'; $d.Multiselect = $true; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileNames | ForEach-Object { Write-Output $_ } }";
            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .map_err(|e| format!("Failed to open file dialog: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout);
            let paths: Vec<String> = stdout.lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            Ok(paths)
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(Vec::new())
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn pick_skin_file() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            let script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select Minecraft Skin (.png)'; $d.Filter = 'PNG Skin Files (*.png)|*.png|All Files (*.*)|*.*'; $d.Multiselect = $false; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }";
            let output = std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .map_err(|e| format!("Failed to open skin dialog: {}", e))?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                Ok(None)
            } else {
                Ok(Some(path))
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            Ok(None)
        }
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn debug_active_profile(
    state: State<'_, AppState>,
    instance_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let account_mgr = state.account_manager.lock().await;
    let selected_account = account_mgr.get_selected_account();

    let instance_mgr = state.instance_manager.lock().await;
    let target_instance = if let Some(ref i_id) = instance_id {
        instance_mgr.get_instances().into_iter().find(|i| &i.id == i_id)
    } else {
        instance_mgr.get_selected_instance()
    };

    let (inst_id, inst_path) = if let Some(ref inst) = target_instance {
        let p = if let Some(ref custom_dir) = inst.game_dir {
            if !custom_dir.trim().is_empty() {
                std::path::PathBuf::from(custom_dir)
            } else {
                state.paths.instance_dir(&inst.id)
            }
        } else {
            state.paths.instance_dir(&inst.id)
        };
        (Some(inst.id.clone()), Some(p))
    } else {
        (None, None)
    };

    let mut account_info = serde_json::Map::new();
    if let Some(ref acc) = selected_account {
        account_info.insert("id".to_string(), serde_json::json!(acc.id));
        account_info.insert("username".to_string(), serde_json::json!(acc.username));
        account_info.insert("uuid".to_string(), serde_json::json!(acc.uuid));
        account_info.insert("profileIcon".to_string(), serde_json::json!(acc.profile_icon.as_deref().unwrap_or("moon")));
        account_info.insert("skinModel".to_string(), serde_json::json!(acc.skin_model.as_deref().unwrap_or("classic")));
        account_info.insert("skinPath".to_string(), serde_json::json!(acc.skin_path));

        let skin_exists = acc.skin_path.as_ref().map(|p| std::path::Path::new(p).exists()).unwrap_or(false);
        account_info.insert("skinExists".to_string(), serde_json::json!(skin_exists));

        let skin_hash = acc.skin_path.as_ref().and_then(|p| {
            if std::path::Path::new(p).exists() {
                std::fs::read(p).ok().map(|bytes| {
                    use sha2::{Sha256, Digest};
                    let mut hasher = Sha256::new();
                    hasher.update(&bytes);
                    format!("{:x}", hasher.finalize())
                })
            } else {
                None
            }
        });
        account_info.insert("skinHash".to_string(), serde_json::json!(skin_hash));
    }

    let mut instance_info = serde_json::Map::new();
    if let Some(ref p) = inst_path {
        instance_info.insert("path".to_string(), serde_json::json!(p.to_string_lossy()));
        instance_info.insert("id".to_string(), serde_json::json!(inst_id));

        let active_profile_path = p.join(".volume").join("active_profile.json");
        let active_profile_json: Option<serde_json::Value> = if active_profile_path.exists() {
            std::fs::read_to_string(&active_profile_path).ok().and_then(|s| serde_json::from_str(&s).ok())
        } else {
            None
        };
        instance_info.insert("activeProfileJson".to_string(), serde_json::json!(active_profile_json));

        let companion_jar_exists = p.join("mods").join("volume-companion-1.0.jar").exists();
        instance_info.insert("companionModPresent".to_string(), serde_json::json!(companion_jar_exists));

        let offline_skins_exists = p.join("mods").join("offline-skins-26.3.jar").exists();
        instance_info.insert("offlineSkinsModPresent".to_string(), serde_json::json!(offline_skins_exists));

        let offlineskins_cfg_path = p.join("config").join("offlineskins").join("config.json");
        let offlineskins_cfg: Option<serde_json::Value> = if offlineskins_cfg_path.exists() {
            std::fs::read_to_string(&offlineskins_cfg_path).ok().and_then(|s| serde_json::from_str(&s).ok())
        } else {
            None
        };
        instance_info.insert("offlineSkinsConfig".to_string(), serde_json::json!(offlineskins_cfg));

        let player_skin_in_offlineskins = if let Some(ref acc) = selected_account {
            p.join("config").join("offlineskins").join("skins").join(format!("{}.png", acc.username)).exists()
        } else {
            false
        };
        instance_info.insert("offlineSkinsPlayerSkinExists".to_string(), serde_json::json!(player_skin_in_offlineskins));
    }

    Ok(serde_json::json!({
        "account": account_info,
        "instance": instance_info,
        "status": "ready"
    }))
}
