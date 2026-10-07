use tauri::State;
use crate::state::AppState;
use crate::models::{LocalMod, ResourcePackItem};
use crate::launcher::mods::{ModManager, ModrinthProjectHit, ModUpdateInfo};

#[tauri::command]
pub async fn get_instance_mods(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<LocalMod>, String> {
    ModManager::list_mods(&state.paths, &instance_id)
}

#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<LocalMod, String> {
    ModManager::toggle_mod(&state.paths, &instance_id, &file_name)
}

#[tauri::command]
pub async fn delete_mod(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<(), String> {
    ModManager::delete_mod(&state.paths, &instance_id, &file_name)
}

#[tauri::command]
pub async fn open_mods_folder(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    ModManager::open_mods_folder(&state.paths, &instance_id)
}

#[tauri::command]
pub async fn install_local_mods(
    state: State<'_, AppState>,
    instance_id: String,
    file_paths: Vec<String>,
) -> Result<Vec<LocalMod>, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Cannot install mods while Minecraft is running.".to_string());
    }
    ModManager::install_local_mods(&state.paths, &instance_id, &file_paths)
}

#[tauri::command]
pub async fn search_modrinth_mods(
    query: String,
    loader: Option<String>,
    game_version: Option<String>,
    project_type: Option<String>,
) -> Result<Vec<ModrinthProjectHit>, String> {
    ModManager::search_modrinth(
        &query,
        loader.as_deref(),
        game_version.as_deref(),
        project_type.as_deref(),
    ).await
}

#[tauri::command]
pub async fn install_modrinth_mod(
    state: State<'_, AppState>,
    instance_id: String,
    project_id: String,
    loader: String,
    game_version: String,
) -> Result<LocalMod, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Cannot install mods while Minecraft is running.".to_string());
    }

    ModManager::install_modrinth_mod(
        &state.paths,
        &instance_id,
        &project_id,
        &loader,
        &game_version,
    ).await
}

#[tauri::command]
pub async fn check_mod_updates(
    state: State<'_, AppState>,
    instance_id: String,
    loader: String,
    game_version: String,
) -> Result<Vec<ModUpdateInfo>, String> {
    ModManager::check_mod_updates(
        &state.paths,
        &instance_id,
        &loader,
        &game_version,
    ).await
}

#[tauri::command]
pub async fn update_mod(
    state: State<'_, AppState>,
    instance_id: String,
    project_id: String,
    loader: String,
    game_version: String,
) -> Result<LocalMod, String> {
    let proc_state = state.process_manager.get_state().await;
    if proc_state.status == "running" || proc_state.status == "launching" {
        return Err("Cannot update mods while Minecraft is running.".to_string());
    }

    ModManager::update_mod(
        &state.paths,
        &instance_id,
        &project_id,
        &loader,
        &game_version,
    ).await
}

#[tauri::command]
pub async fn list_resourcepacks(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<ResourcePackItem>, String> {
    ModManager::list_resourcepacks(&state.paths, &instance_id)
}

#[tauri::command]
pub async fn toggle_resourcepack(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<ResourcePackItem, String> {
    ModManager::toggle_resourcepack(&state.paths, &instance_id, &file_name)
}

#[tauri::command]
pub async fn delete_resourcepack(
    state: State<'_, AppState>,
    instance_id: String,
    file_name: String,
) -> Result<(), String> {
    ModManager::delete_resourcepack(&state.paths, &instance_id, &file_name)
}

#[tauri::command]
pub async fn open_resourcepacks_folder(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    ModManager::open_resourcepacks_folder(&state.paths, &instance_id)
}
