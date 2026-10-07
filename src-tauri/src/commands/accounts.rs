use tauri::State;
use crate::state::AppState;
use crate::models::OfflineAccount;

#[tauri::command]
pub async fn get_offline_accounts(
    state: State<'_, AppState>,
) -> Result<Vec<OfflineAccount>, String> {
    let account_mgr = state.account_manager.lock().await;
    Ok(account_mgr.get_accounts())
}

#[tauri::command]
pub async fn get_selected_offline_account(
    state: State<'_, AppState>,
) -> Result<Option<OfflineAccount>, String> {
    let account_mgr = state.account_manager.lock().await;
    Ok(account_mgr.get_selected_account())
}

#[tauri::command]
pub async fn create_offline_account(
    state: State<'_, AppState>,
    username: String,
) -> Result<OfflineAccount, String> {
    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.create_account(&username)
}

#[tauri::command]
pub async fn delete_offline_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<(), String> {
    let proc_state = state.process_manager.get_state().await;
    let is_running = proc_state.status == "running" || proc_state.status == "launching";

    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.delete_account(&account_id, is_running)
}

#[tauri::command]
pub async fn select_offline_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<OfflineAccount, String> {
    let proc_state = state.process_manager.get_state().await;
    let is_running = proc_state.status == "running" || proc_state.status == "launching";

    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.select_account(&account_id, is_running)
}

#[tauri::command]
pub async fn set_account_avatar(
    state: State<'_, AppState>,
    account_id: String,
    avatar_type: String,
    avatar_data: Option<String>,
) -> Result<OfflineAccount, String> {
    let saved_path = if let Some(ref data) = avatar_data {
        if data.starts_with("data:image/") {
            let avatars_dir = state.paths.launcher_dir().join("avatars");
            let _ = std::fs::create_dir_all(&avatars_dir);
            let filename = format!("{}.png", account_id);
            let file_path = avatars_dir.join(&filename);

            if let Some(comma_idx) = data.find(',') {
                let b64 = &data[comma_idx + 1..];
                if let Ok(bytes) = base64_decode(b64) {
                    let _ = std::fs::write(&file_path, &bytes);
                }
            }
            Some(file_path.to_string_lossy().to_string())
        } else {
            Some(data.clone())
        }
    } else {
        None
    };

    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.set_account_avatar(&account_id, &avatar_type, saved_path)
}

#[tauri::command]
pub async fn set_account_skin(
    state: State<'_, AppState>,
    account_id: String,
    skin_data: Option<String>,
    skin_model: Option<String>,
) -> Result<OfflineAccount, String> {
    let saved_path = if let Some(ref data) = skin_data {
        if data.trim().is_empty() {
            None
        } else {
            // 1. Get raw skin bytes
            let bytes = if data.starts_with("data:image/") {
                let comma_idx = data.find(',').ok_or_else(|| "Malformed skin data URL".to_string())?;
                base64_decode(&data[comma_idx + 1..])?
            } else {
                let p = std::path::Path::new(data);
                if !p.exists() {
                    return Err(format!("Skin file not found: {}", data));
                }
                std::fs::read(p).map_err(|e| format!("Failed to read skin file: {}", e))?
            };

            // 2. Validate PNG signature
            if bytes.len() < 24 || &bytes[0..8] != &[137, 80, 78, 71, 13, 10, 26, 10] {
                return Err("Invalid skin file: not a valid PNG image format.".to_string());
            }

            // 3. Validate Minecraft skin dimensions from IHDR chunk
            let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
            let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);

            if width != 64 || (height != 64 && height != 32) {
                return Err(format!(
                    "Invalid Minecraft skin dimensions: expected 64x64 or 64x32 PNG, found {}x{}.",
                    width, height
                ));
            }

            // 4. Save to persistent cache under account ID
            let skins_dir = state.paths.launcher_dir().join("skins");
            let _ = std::fs::create_dir_all(&skins_dir);
            let filename = format!("{}.png", account_id);
            let file_path = skins_dir.join(&filename);
            std::fs::write(&file_path, &bytes).map_err(|e| format!("Failed to save skin file: {}", e))?;

            Some(file_path.to_string_lossy().to_string())
        }
    } else {
        None
    };

    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.set_account_skin(&account_id, saved_path, skin_model)
}

#[tauri::command]
pub async fn set_account_profile_icon(
    state: State<'_, AppState>,
    account_id: String,
    profile_icon: String,
) -> Result<OfflineAccount, String> {
    let mut account_mgr = state.account_manager.lock().await;
    account_mgr.set_account_profile_icon(&account_id, &profile_icon)
}

pub fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    let table = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::new();
    let clean: Vec<u8> = input.bytes().filter(|&b| b != b'=' && b != b'\r' && b != b'\n' && b != b' ').collect();
    let mut i = 0;
    while i < clean.len() {
        let b0 = table.iter().position(|&x| x == clean[i]).ok_or("Invalid base64")? as u32;
        let b1 = if i + 1 < clean.len() { table.iter().position(|&x| x == clean[i + 1]).ok_or("Invalid base64")? as u32 } else { 0 };
        let b2 = if i + 2 < clean.len() { table.iter().position(|&x| x == clean[i + 2]).ok_or("Invalid base64")? as u32 } else { 0 };
        let b3 = if i + 3 < clean.len() { table.iter().position(|&x| x == clean[i + 3]).ok_or("Invalid base64")? as u32 } else { 0 };

        let triple = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;
        out.push(((triple >> 16) & 0xFF) as u8);
        if i + 2 < clean.len() {
            out.push(((triple >> 8) & 0xFF) as u8);
        }
        if i + 3 < clean.len() {
            out.push((triple & 0xFF) as u8);
        }
        i += 4;
    }
    Ok(out)
}



