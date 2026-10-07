use std::fs;
use std::path::PathBuf;
use tauri::State;
use crate::state::AppState;
use crate::launcher::backup::{
    InstanceWorldInfo, WorldBackupInfo, WorldPackageService, calculate_dir_size
};

#[tauri::command]
pub async fn list_instance_worlds(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<InstanceWorldInfo>, String> {
    let saves_dir = state.paths.instance_dir(&instance_id).join("saves");
    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    let mut worlds = Vec::new();
    let entries = fs::read_dir(&saves_dir)
        .map_err(|e| format!("Failed to read saves directory: {}", e))?;

    let mut all_dirs = Vec::new();
    for entry in entries.flatten() {
        if let Ok(file_type) = entry.file_type() {
            if file_type.is_dir() {
                all_dirs.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }

    for dir_name in &all_dirs {
        if dir_name.contains(".backup_") || dir_name.ends_with(".tmp_extract") {
            continue;
        }

        let world_path = saves_dir.join(dir_name);
        let metadata = fs::metadata(&world_path).ok();
        let last_modified = metadata
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or_default();

        let size_bytes = calculate_dir_size(&world_path).unwrap_or(0);
        let prefix = format!("{}.backup_", dir_name);
        let backup_count = all_dirs.iter().filter(|d| d.starts_with(&prefix)).count();

        worlds.push(InstanceWorldInfo {
            folder_name: dir_name.clone(),
            display_name: dir_name.clone(),
            size_bytes,
            last_modified,
            backup_count,
        });
    }

    Ok(worlds)
}

#[tauri::command]
pub async fn create_world_backup(
    state: State<'_, AppState>,
    instance_id: String,
    world_folder_name: String,
) -> Result<WorldBackupInfo, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Close Minecraft before backing up this world.".to_string());
    }

    let world_dir = state.paths.instance_dir(&instance_id).join("saves").join(&world_folder_name);
    if !world_dir.exists() {
        return Err(format!("World '{}' does not exist.", world_folder_name));
    }

    let backup_path = WorldPackageService::create_backup(&world_dir)?;
    let backup_id = backup_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string();

    let timestamp = backup_id.trim_start_matches(&format!("{}.backup_", world_folder_name))
        .parse::<u64>().unwrap_or_default();
    let size_bytes = calculate_dir_size(&backup_path).unwrap_or(0);

    Ok(WorldBackupInfo {
        backup_id,
        world_folder_name,
        timestamp,
        size_bytes,
        path: backup_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn list_world_backups(
    state: State<'_, AppState>,
    instance_id: String,
    world_folder_name: String,
) -> Result<Vec<WorldBackupInfo>, String> {
    let saves_dir = state.paths.instance_dir(&instance_id).join("saves");
    if !saves_dir.exists() {
        return Ok(Vec::new());
    }

    Ok(WorldPackageService::list_backups(&saves_dir, &world_folder_name))
}

#[tauri::command]
pub async fn restore_world_backup(
    state: State<'_, AppState>,
    instance_id: String,
    world_folder_name: String,
    backup_id: String,
) -> Result<String, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Close Minecraft before restoring this world backup.".to_string());
    }

    let saves_dir = state.paths.instance_dir(&instance_id).join("saves");
    let backup_dir = saves_dir.join(&backup_id);
    let target_world_dir = saves_dir.join(&world_folder_name);

    if !backup_dir.exists() {
        return Err(format!("Backup '{}' does not exist.", backup_id));
    }

    WorldPackageService::restore_backup(&backup_dir, &target_world_dir)?;
    Ok(format!("Restored world '{}' successfully from backup.", world_folder_name))
}

#[tauri::command]
pub async fn delete_world_backup(
    state: State<'_, AppState>,
    instance_id: String,
    backup_id: String,
) -> Result<(), String> {
    let saves_dir = state.paths.instance_dir(&instance_id).join("saves");
    let backup_dir = saves_dir.join(&backup_id);
    WorldPackageService::delete_backup(&backup_dir)
}

#[tauri::command]
pub async fn export_world_archive(
    state: State<'_, AppState>,
    instance_id: String,
    world_folder_name: String,
    destination_file: String,
) -> Result<String, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Close Minecraft before exporting this world archive.".to_string());
    }

    let world_dir = state.paths.instance_dir(&instance_id).join("saves").join(&world_folder_name);
    if !world_dir.exists() {
        return Err(format!("World '{}' does not exist.", world_folder_name));
    }

    let out_path = PathBuf::from(&destination_file);
    let (hash, size) = WorldPackageService::pack_world(&world_dir, &out_path)?;
    Ok(format!("World exported successfully ({} bytes, SHA-256: {})", size, &hash[..8]))
}

#[tauri::command]
pub async fn import_world_archive(
    state: State<'_, AppState>,
    instance_id: String,
    archive_file_path: String,
    world_folder_name: Option<String>,
) -> Result<String, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Close Minecraft before importing a world archive.".to_string());
    }

    let archive_path = PathBuf::from(&archive_file_path);
    if !archive_path.exists() {
        return Err(format!("Archive file '{}' not found.", archive_file_path));
    }

    let folder_name = world_folder_name.unwrap_or_else(|| {
        archive_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("imported_world")
            .to_string()
    });

    let saves_dir = state.paths.instance_dir(&instance_id).join("saves");
    let _ = fs::create_dir_all(&saves_dir);
    let target_world_dir = saves_dir.join(&folder_name);

    let backup_created = WorldPackageService::unpack_world(&archive_path, &target_world_dir)?;
    if let Some(backup) = backup_created {
        Ok(format!("Imported world successfully. Existing world backed up to {}", backup.display()))
    } else {
        Ok("Imported world successfully.".to_string())
    }
}
