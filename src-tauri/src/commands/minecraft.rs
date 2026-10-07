use tauri::{AppHandle, State, Emitter};
use crate::state::AppState;
use crate::models::{FrontendVersionInfo, VerificationResult};

#[tauri::command]
pub async fn get_minecraft_versions(
    state: State<'_, AppState>,
) -> Result<Vec<FrontendVersionInfo>, String> {
    state.manifest_service.get_version_list().await
}

#[tauri::command]
pub async fn get_installed_versions(
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let versions = state.manifest_service.get_version_list().await?;
    let installed: Vec<String> = versions
        .into_iter()
        .filter(|v| v.installed)
        .map(|v| v.id)
        .collect();
    Ok(installed)
}

#[tauri::command]
pub async fn install_minecraft_version(
    app: AppHandle,
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), String> {
    state.installer.install_version(&version_id, move |progress| {
        let _ = app.emit("minecraft-install-progress", progress);
    }).await
}

#[tauri::command]
pub async fn verify_minecraft_version(
    state: State<'_, AppState>,
    version_id: String,
) -> Result<VerificationResult, String> {
    state.installer.verify_installation(&version_id).await
}

#[tauri::command]
pub async fn repair_minecraft_version(
    app: AppHandle,
    state: State<'_, AppState>,
    version_id: String,
) -> Result<(), String> {
    state.installer.repair_installation(&version_id, move |progress| {
        let _ = app.emit("minecraft-install-progress", progress);
    }).await
}
