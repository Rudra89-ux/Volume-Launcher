use tauri::{AppHandle, State, Emitter};
use crate::state::AppState;
use crate::minecraft::fabric::FabricLoaderItem;

#[tauri::command]
pub async fn get_fabric_loader_versions(
    state: State<'_, AppState>,
    game_version: String,
) -> Result<Vec<FabricLoaderItem>, String> {
    state.fabric_service.get_loader_versions(&game_version).await
}

#[tauri::command]
pub async fn install_fabric_version(
    app: AppHandle,
    state: State<'_, AppState>,
    game_version: String,
    loader_version: String,
) -> Result<String, String> {
    // 1. Fetch Fabric profile JSON
    let fabric_meta = state.fabric_service.fetch_fabric_profile_json(&game_version, &loader_version).await?;
    let fabric_id = fabric_meta.id.clone();

    // 2. Install base vanilla version & Fabric merged libraries
    state.installer.install_version(&fabric_id, move |progress| {
        let _ = app.emit("minecraft-install-progress", progress);
    }).await?;

    Ok(fabric_id)
}
