use tauri::State;
use crate::state::AppState;
use crate::models::JavaInfo;
use crate::launcher::java::JavaDetector;

#[tauri::command]
pub async fn detect_java(
    state: State<'_, AppState>,
    required_major_version: Option<u32>,
) -> Result<JavaInfo, String> {
    let settings_lock = state.settings.lock().await;
    let custom = if !settings_lock.java_executable_path.is_empty() {
        Some(settings_lock.java_executable_path.as_str())
    } else {
        None
    };

    JavaDetector::detect_java(required_major_version, custom)
}

#[tauri::command]
pub async fn get_available_javas() -> Result<Vec<JavaInfo>, String> {
    Ok(JavaDetector::get_available_javas())
}
