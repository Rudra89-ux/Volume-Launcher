use std::process::Command;
use tauri::State;
use crate::state::AppState;
use crate::models::Instance;

#[tauri::command]
pub async fn get_instances(
    state: State<'_, AppState>,
) -> Result<Vec<Instance>, String> {
    let mgr = state.instance_manager.lock().await;
    Ok(mgr.get_instances())
}

#[tauri::command]
pub async fn get_selected_instance(
    state: State<'_, AppState>,
) -> Result<Option<Instance>, String> {
    let mgr = state.instance_manager.lock().await;
    Ok(mgr.get_selected_instance())
}

#[tauri::command]
pub async fn select_instance(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Instance, String> {
    let mut mgr = state.instance_manager.lock().await;
    mgr.select_instance(&instance_id)
}

#[tauri::command]
pub async fn create_instance(
    state: State<'_, AppState>,
    name: String,
    version_id: String,
    loader: String,
    fabric_version: Option<String>,
) -> Result<Instance, String> {
    let mut mgr = state.instance_manager.lock().await;
    mgr.create_instance(&name, &version_id, &loader, fabric_version)
}

#[tauri::command]
pub async fn update_instance(
    state: State<'_, AppState>,
    instance: Instance,
) -> Result<Instance, String> {
    let mut mgr = state.instance_manager.lock().await;
    mgr.update_instance(instance)
}

#[tauri::command]
pub async fn duplicate_instance(
    state: State<'_, AppState>,
    instance_id: String,
    new_name: String,
) -> Result<Instance, String> {
    let mut mgr = state.instance_manager.lock().await;
    mgr.duplicate_instance(&instance_id, &new_name)
}

#[tauri::command]
pub async fn delete_instance(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    let mut mgr = state.instance_manager.lock().await;
    mgr.delete_instance(&instance_id)
}

#[tauri::command]
pub async fn open_instance_folder(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    let dir = state.paths.instance_dir(&instance_id);
    let _ = std::fs::create_dir_all(&dir);

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open file explorer: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open file explorer: {}", e))?;
    }

    Ok(())
}
