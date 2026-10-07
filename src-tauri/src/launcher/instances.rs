use std::fs;
use crate::models::{Instance, InstancesConfig};
use crate::minecraft::paths::MinecraftPaths;

pub struct InstanceManager {
    paths: MinecraftPaths,
    config: InstancesConfig,
}

impl InstanceManager {
    pub fn new(paths: MinecraftPaths) -> Self {
        let mut mgr = Self {
            paths: paths.clone(),
            config: InstancesConfig::default(),
        };
        mgr.load_or_initialize();
        mgr
    }

    fn load_or_initialize(&mut self) {
        let file = self.paths.instances_file();
        let _ = self.paths.ensure_directories();

        if file.exists() {
            if let Ok(content) = fs::read_to_string(&file) {
                if let Ok(cfg) = serde_json::from_str::<InstancesConfig>(&content) {
                    if !cfg.instances.is_empty() {
                        self.config = cfg;
                        for inst in &self.config.instances {
                            self.ensure_instance_dirs(&inst.id);
                        }
                        return;
                    }
                }
            }
        }

        // Initialize default instance
        let default_inst = Instance::new("Vanilla Survival", "1.21.1", "vanilla");
        self.ensure_instance_dirs(&default_inst.id);
        self.config.selected_instance_id = Some(default_inst.id.clone());
        self.config.instances = vec![default_inst];
        let _ = self.save();
    }

    pub fn ensure_instance_dirs(&self, instance_id: &str) {
        let dir = self.paths.instance_dir(instance_id);
        let _ = fs::create_dir_all(&dir);
        let _ = fs::create_dir_all(dir.join("mods"));
        let _ = fs::create_dir_all(dir.join("config"));
        let _ = fs::create_dir_all(dir.join("saves"));
        let _ = fs::create_dir_all(dir.join("resourcepacks"));
        let _ = fs::create_dir_all(dir.join("shaderpacks"));
        let _ = fs::create_dir_all(dir.join("screenshots"));
        let _ = fs::create_dir_all(dir.join("logs"));
    }

    fn save(&self) -> Result<(), String> {
        let file = self.paths.instances_file();
        let json = serde_json::to_string_pretty(&self.config)
            .map_err(|e| format!("Failed to serialize instances: {}", e))?;
        fs::write(file, json)
            .map_err(|e| format!("Failed to write instances.json: {}", e))?;
        Ok(())
    }

    pub fn get_instances(&self) -> Vec<Instance> {
        self.config.instances.clone()
    }

    pub fn get_selected_instance(&self) -> Option<Instance> {
        if let Some(selected_id) = &self.config.selected_instance_id {
            if let Some(found) = self.config.instances.iter().find(|i| &i.id == selected_id) {
                return Some(found.clone());
            }
        }
        self.config.instances.first().cloned()
    }

    pub fn select_instance(&mut self, instance_id: &str) -> Result<Instance, String> {
        if let Some(found) = self.config.instances.iter().find(|i| i.id == instance_id) {
            let instance = found.clone();
            self.config.selected_instance_id = Some(instance_id.to_string());
            self.save()?;
            Ok(instance)
        } else {
            Err(format!("Instance '{}' not found", instance_id))
        }
    }

    pub fn create_instance(
        &mut self,
        name: &str,
        version_id: &str,
        loader: &str,
        fabric_version: Option<String>,
    ) -> Result<Instance, String> {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err("Instance name cannot be empty".to_string());
        }

        let mut instance = Instance::new(trimmed_name, version_id, loader);
        instance.fabric_version = fabric_version;

        self.ensure_instance_dirs(&instance.id);
        self.config.instances.push(instance.clone());
        self.config.selected_instance_id = Some(instance.id.clone());
        self.save()?;
        Ok(instance)
    }

    pub fn update_instance(&mut self, updated: Instance) -> Result<Instance, String> {
        if let Some(inst) = self.config.instances.iter_mut().find(|i| i.id == updated.id) {
            *inst = updated.clone();
            self.save()?;
            Ok(updated)
        } else {
            Err(format!("Instance '{}' not found for update", updated.id))
        }
    }

    pub fn duplicate_instance(&mut self, instance_id: &str, new_name: &str) -> Result<Instance, String> {
        let original = self.config.instances.iter().find(|i| i.id == instance_id)
            .cloned()
            .ok_or_else(|| format!("Instance '{}' not found", instance_id))?;

        let trimmed_name = new_name.trim();
        let target_name = if trimmed_name.is_empty() {
            format!("{} (Copy)", original.name)
        } else {
            trimmed_name.to_string()
        };

        let mut duplicated = Instance::new(&target_name, &original.version_id, &original.loader);
        duplicated.fabric_version = original.fabric_version.clone();
        duplicated.java_path = original.java_path.clone();
        duplicated.memory_gb = original.memory_gb;
        duplicated.resolution_width = original.resolution_width;
        duplicated.resolution_height = original.resolution_height;
        duplicated.fullscreen = original.fullscreen;
        duplicated.jvm_args = original.jvm_args.clone();
        duplicated.icon = original.icon.clone();

        self.ensure_instance_dirs(&duplicated.id);

        // Copy instance folders (config, mods, resourcepacks)
        let orig_dir = self.paths.instance_dir(&original.id);
        let new_dir = self.paths.instance_dir(&duplicated.id);

        for folder in &["config", "mods", "resourcepacks"] {
            let src = orig_dir.join(folder);
            let dst = new_dir.join(folder);
            if src.exists() {
                let _ = crate::launcher::backup::WorldPackageService::copy_dir_all(&src, &dst);
            }
        }

        self.config.instances.push(duplicated.clone());
        self.save()?;
        Ok(duplicated)
    }

    pub fn delete_instance(&mut self, instance_id: &str) -> Result<(), String> {
        if self.config.instances.len() <= 1 {
            return Err("Cannot delete the only remaining instance".to_string());
        }

        self.config.instances.retain(|i| i.id != instance_id);
        if self.config.selected_instance_id.as_deref() == Some(instance_id) {
            self.config.selected_instance_id = self.config.instances.first().map(|i| i.id.clone());
        }

        // Remove folder
        let dir = self.paths.instance_dir(instance_id);
        let _ = fs::remove_dir_all(dir);

        self.save()
    }

    pub fn update_last_played(&mut self, instance_id: &str) -> Result<(), String> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let now_sec = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

        if let Some(inst) = self.config.instances.iter_mut().find(|i| i.id == instance_id) {
            inst.last_played_at = Some(format!("{}", now_sec));
            self.save()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_instance_manager_lifecycle() {
        let temp_dir = std::env::temp_dir().join("volume_test_instances");
        let paths = MinecraftPaths::new(temp_dir);
        let mut mgr = InstanceManager::new(paths);

        let initial = mgr.get_instances();
        assert!(!initial.is_empty(), "Should initialize with default instance");

        let created = mgr.create_instance("Fabric Performance", "1.21.1", "fabric", Some("0.16.10".to_string()))
            .expect("Should create instance");
        assert_eq!(created.name, "Fabric Performance");
        assert_eq!(created.loader, "fabric");
        assert_eq!(created.fabric_version.as_deref(), Some("0.16.10"));

        let selected = mgr.select_instance(&created.id).expect("Should select instance");
        assert_eq!(selected.id, created.id);

        let active = mgr.get_selected_instance().expect("Should get active instance");
        assert_eq!(active.id, created.id);

        // Test update
        let mut to_update = active.clone();
        to_update.memory_gb = Some(6);
        to_update.resolution_width = Some(1920);
        let updated = mgr.update_instance(to_update).expect("Should update instance");
        assert_eq!(updated.memory_gb, Some(6));

        // Test duplicate
        let dup = mgr.duplicate_instance(&created.id, "Fabric Copy").expect("Should duplicate instance");
        assert_eq!(dup.name, "Fabric Copy");
        assert_eq!(dup.memory_gb, Some(6));

        mgr.delete_instance(&dup.id).expect("Should delete duplicated instance");
        mgr.delete_instance(&created.id).expect("Should delete instance");
        let remaining = mgr.get_instances();
        assert_eq!(remaining.len(), initial.len());
    }
}
