pub mod models;
pub mod minecraft;
pub mod launcher;
pub mod state;
pub mod commands;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_minecraft_versions,
            commands::get_installed_versions,
            commands::install_minecraft_version,
            commands::verify_minecraft_version,
            commands::repair_minecraft_version,
            commands::detect_java,
            commands::get_available_javas,
            commands::launch_minecraft,
            commands::stop_minecraft,
            commands::get_minecraft_process_state,
            commands::get_launcher_settings,
            commands::save_launcher_settings,
            commands::pick_directory,
            commands::pick_jar_files,
            commands::pick_skin_file,
            commands::get_offline_accounts,
            commands::get_selected_offline_account,
            commands::create_offline_account,
            commands::delete_offline_account,
            commands::select_offline_account,
            commands::set_account_avatar,
            commands::set_account_skin,
            commands::set_account_profile_icon,
            commands::get_instances,
            commands::get_selected_instance,
            commands::select_instance,
            commands::create_instance,
            commands::update_instance,
            commands::duplicate_instance,
            commands::delete_instance,
            commands::open_instance_folder,
            commands::get_instance_mods,
            commands::toggle_mod,
            commands::delete_mod,
            commands::open_mods_folder,
            commands::install_local_mods,
            commands::search_modrinth_mods,
            commands::install_modrinth_mod,
            commands::check_mod_updates,
            commands::update_mod,
            commands::list_resourcepacks,
            commands::toggle_resourcepack,
            commands::delete_resourcepack,
            commands::open_resourcepacks_folder,
            commands::get_fabric_loader_versions,
            commands::install_fabric_version,
            commands::list_instance_worlds,
            commands::create_world_backup,
            commands::list_world_backups,
            commands::restore_world_backup,
            commands::delete_world_backup,
            commands::export_world_archive,
            commands::import_world_archive,
            commands::debug_active_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Volume Launcher application");
}
