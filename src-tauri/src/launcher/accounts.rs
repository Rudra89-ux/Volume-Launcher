use std::fs;
use std::path::PathBuf;
use crate::models::{
    OfflineAccount, AccountsConfig, validate_username, current_iso_timestamp
};
use crate::minecraft::paths::MinecraftPaths;

pub struct AccountManager {
    config_path: PathBuf,
    config: AccountsConfig,
}

impl AccountManager {
    pub fn new(paths: &MinecraftPaths) -> Self {
        let config_path = paths.accounts_file();
        let config = Self::load_or_init(&config_path);
        Self {
            config_path,
            config,
        }
    }

    fn load_or_init(config_path: &PathBuf) -> AccountsConfig {
        if config_path.exists() {
            if let Ok(content) = fs::read_to_string(config_path) {
                if let Ok(mut loaded) = serde_json::from_str::<AccountsConfig>(&content) {
                    if loaded.accounts.is_empty() {
                        let default_account = OfflineAccount::new("DevExplorer");
                        loaded.selected_account_id = default_account.id.clone();
                        loaded.accounts.push(default_account);
                        let _ = Self::save_to_disk(config_path, &loaded);
                        return loaded;
                    }

                    // Verify selected_account_id points to an existing account
                    if !loaded.accounts.iter().any(|a| a.id == loaded.selected_account_id) {
                        loaded.selected_account_id = loaded.accounts[0].id.clone();
                        let _ = Self::save_to_disk(config_path, &loaded);
                    }

                    return loaded;
                }
            }
        }

        // Initialize default configuration
        let default_config = AccountsConfig::default();
        let _ = Self::save_to_disk(config_path, &default_config);
        default_config
    }

    fn save_to_disk(path: &PathBuf, config: &AccountsConfig) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize accounts configuration: {}", e))?;
        fs::write(path, json)
            .map_err(|e| format!("Failed to save accounts file: {}", e))?;
        Ok(())
    }

    fn save(&self) -> Result<(), String> {
        Self::save_to_disk(&self.config_path, &self.config)
    }

    pub fn get_accounts(&self) -> Vec<OfflineAccount> {
        self.config.accounts.clone()
    }

    pub fn get_selected_account(&self) -> Option<OfflineAccount> {
        self.config.accounts
            .iter()
            .find(|a| a.id == self.config.selected_account_id)
            .cloned()
            .or_else(|| self.config.accounts.first().cloned())
    }

    pub fn create_account(&mut self, username: &str) -> Result<OfflineAccount, String> {
        let trimmed = username.trim();
        validate_username(trimmed)?;

        // Case-insensitive duplicate check
        if self.config.accounts.iter().any(|a| a.username.eq_ignore_ascii_case(trimmed)) {
            return Err(format!("An explorer named '{}' already exists.", trimmed));
        }

        let new_account = OfflineAccount::new(trimmed);
        let return_val = new_account.clone();
        self.config.accounts.push(new_account);
        self.config.selected_account_id = return_val.id.clone();
        self.save()?;
        Ok(return_val)
    }

    pub fn select_account(&mut self, account_id: &str, is_minecraft_running: bool) -> Result<OfflineAccount, String> {
        if is_minecraft_running {
            return Err("Cannot switch explorers while Minecraft is running. Stop Minecraft before switching profiles.".to_string());
        }

        let account = self.config.accounts
            .iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or_else(|| "The specified explorer profile does not exist.".to_string())?;

        self.config.selected_account_id = account.id.clone();
        self.save()?;
        Ok(account)
    }

    pub fn delete_account(&mut self, account_id: &str, is_minecraft_running: bool) -> Result<(), String> {
        if is_minecraft_running && self.config.selected_account_id == account_id {
            return Err("Cannot remove the active explorer profile while Minecraft is running.".to_string());
        }

        let initial_len = self.config.accounts.len();
        self.config.accounts.retain(|a| a.id != account_id);

        if self.config.accounts.len() == initial_len {
            return Err("Explorer profile not found.".to_string());
        }

        // If the deleted account was selected, pick the next or default
        if self.config.selected_account_id == account_id {
            if let Some(first) = self.config.accounts.first() {
                self.config.selected_account_id = first.id.clone();
            } else {
                let default_account = OfflineAccount::new("DevExplorer");
                self.config.selected_account_id = default_account.id.clone();
                self.config.accounts.push(default_account);
            }
        }

        self.save()
    }

    pub fn update_last_played(&mut self, account_id: &str) -> Result<(), String> {
        if let Some(account) = self.config.accounts.iter_mut().find(|a| a.id == account_id) {
            account.last_played_at = Some(current_iso_timestamp());
            self.save()?;
        }
        Ok(())
    }

    pub fn set_account_avatar(
        &mut self,
        account_id: &str,
        avatar_type: &str,
        avatar_path: Option<String>,
    ) -> Result<OfflineAccount, String> {
        let account = self.config.accounts.iter_mut().find(|a| a.id == account_id)
            .ok_or_else(|| "Account not found.".to_string())?;

        account.avatar_type = avatar_type.to_string();
        account.avatar_path = avatar_path;
        account.avatar_updated_at = Some(current_iso_timestamp());

        let updated = account.clone();
        self.save()?;
        Ok(updated)
    }

    pub fn set_account_skin(
        &mut self,
        account_id: &str,
        skin_path: Option<String>,
        skin_model: Option<String>,
    ) -> Result<OfflineAccount, String> {
        let account = self.config.accounts.iter_mut().find(|a| a.id == account_id)
            .ok_or_else(|| "Account not found.".to_string())?;

        account.skin_path = skin_path;
        if let Some(model) = skin_model {
            account.skin_model = Some(model);
        }
        account.avatar_updated_at = Some(current_iso_timestamp());

        let updated = account.clone();
        self.save()?;
        Ok(updated)
    }

    pub fn set_account_profile_icon(
        &mut self,
        account_id: &str,
        profile_icon: &str,
    ) -> Result<OfflineAccount, String> {
        let account = self.config.accounts.iter_mut().find(|a| a.id == account_id)
            .ok_or_else(|| "Account not found.".to_string())?;

        account.profile_icon = Some(profile_icon.to_string());
        account.avatar_updated_at = Some(current_iso_timestamp());

        let updated = account.clone();
        self.save()?;
        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_account_manager_lifecycle() {
        let temp_dir = std::env::temp_dir().join(format!("volume_accounts_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let paths = MinecraftPaths::new(&temp_dir);

        // 1. Initial load creates DevExplorer
        let mut manager = AccountManager::new(&paths);
        let accounts = manager.get_accounts();
        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].username, "DevExplorer");
        assert_eq!(manager.get_selected_account().unwrap().username, "DevExplorer");

        // 2. Create another account
        let rudra = manager.create_account("Rudra").expect("Should create valid account");
        assert_eq!(rudra.username, "Rudra");
        assert_eq!(manager.get_accounts().len(), 2);
        assert_eq!(manager.get_selected_account().unwrap().id, rudra.id);

        // 3. Reject duplicate username (case-insensitive)
        let dup_exact = manager.create_account("Rudra");
        assert!(dup_exact.is_err(), "Exact duplicate must be rejected");

        let dup_case = manager.create_account("rudra");
        assert!(dup_case.is_err(), "Case-insensitive duplicate must be rejected");

        // 4. Switching accounts
        let dev_acc = accounts[0].clone();
        let selected = manager.select_account(&dev_acc.id, false).expect("Should switch to DevExplorer");
        assert_eq!(selected.username, "DevExplorer");
        assert_eq!(manager.get_selected_account().unwrap().id, dev_acc.id);

        // Cannot switch while Minecraft is running
        assert!(manager.select_account(&rudra.id, true).is_err(), "Cannot switch while Minecraft is running");

        // 5. Deleting account
        // Cannot delete active account while running
        assert!(manager.delete_account(&dev_acc.id, true).is_err(), "Cannot delete active account while Minecraft is running");

        // Delete rudra
        manager.delete_account(&rudra.id, false).expect("Should delete inactive account");
        assert_eq!(manager.get_accounts().len(), 1);

        // 6. Persistence: create a new AccountManager pointing to same directory
        let mut reloaded = AccountManager::new(&paths);
        assert_eq!(reloaded.get_accounts().len(), 1);
        assert_eq!(reloaded.get_selected_account().unwrap().username, "DevExplorer");

        // 7. Avatar management & persistence
        reloaded.set_account_avatar(&dev_acc.id, "custom", Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==".to_string()))
            .expect("Should set avatar");
        assert_eq!(reloaded.get_selected_account().unwrap().avatar_type, "custom");
        assert!(reloaded.get_selected_account().unwrap().avatar_path.is_some());

        let reloaded2 = AccountManager::new(&paths);
        assert_eq!(reloaded2.get_selected_account().unwrap().avatar_type, "custom");
        assert!(reloaded2.get_selected_account().unwrap().avatar_path.is_some());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
