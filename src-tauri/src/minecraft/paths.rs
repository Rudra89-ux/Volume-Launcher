use std::path::{Path, PathBuf};
use std::fs;

#[derive(Debug, Clone)]
pub struct MinecraftPaths {
    pub root: PathBuf,
}

impl MinecraftPaths {
    pub fn new<P: AsRef<Path>>(root: P) -> Self {
        Self {
            root: root.as_ref().to_path_buf(),
        }
    }

    pub fn default_root() -> PathBuf {
        if let Some(data) = dirs::data_dir() {
            data.join("VolumeLauncher").join("minecraft")
        } else {
            PathBuf::from("minecraft_data")
        }
    }

    pub fn ensure_directories(&self) -> Result<(), std::io::Error> {
        fs::create_dir_all(self.versions_dir())?;
        fs::create_dir_all(self.libraries_dir())?;
        fs::create_dir_all(self.assets_indexes_dir())?;
        fs::create_dir_all(self.assets_objects_dir())?;
        fs::create_dir_all(self.natives_dir())?;
        fs::create_dir_all(self.logs_dir())?;
        fs::create_dir_all(self.launcher_dir())?;
        fs::create_dir_all(self.instances_dir())?;
        Ok(())
    }

    pub fn versions_dir(&self) -> PathBuf {
        self.root.join("versions")
    }

    pub fn version_dir(&self, version_id: &str) -> PathBuf {
        // Sanitize version_id to prevent path traversal
        let safe_id = sanitize_filename(version_id);
        self.versions_dir().join(safe_id)
    }

    pub fn version_json(&self, version_id: &str) -> PathBuf {
        let safe_id = sanitize_filename(version_id);
        self.version_dir(version_id).join(format!("{}.json", safe_id))
    }

    pub fn version_jar(&self, version_id: &str) -> PathBuf {
        let safe_id = sanitize_filename(version_id);
        self.version_dir(version_id).join(format!("{}.jar", safe_id))
    }

    pub fn libraries_dir(&self) -> PathBuf {
        self.root.join("libraries")
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.root.join("assets")
    }

    pub fn assets_indexes_dir(&self) -> PathBuf {
        self.assets_dir().join("indexes")
    }

    pub fn asset_index_file(&self, index_name: &str) -> PathBuf {
        let safe_name = sanitize_filename(index_name);
        self.assets_indexes_dir().join(format!("{}.json", safe_name))
    }

    pub fn assets_objects_dir(&self) -> PathBuf {
        self.assets_dir().join("objects")
    }

    pub fn asset_object_file(&self, hash: &str) -> PathBuf {
        if hash.len() < 2 {
            return self.assets_objects_dir().join(hash);
        }
        let prefix = &hash[0..2];
        self.assets_objects_dir().join(prefix).join(hash)
    }

    pub fn natives_dir(&self) -> PathBuf {
        self.root.join("natives")
    }

    pub fn version_natives_dir(&self, version_id: &str) -> PathBuf {
        let safe_id = sanitize_filename(version_id);
        self.natives_dir().join(safe_id)
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn launcher_dir(&self) -> PathBuf {
        self.root.join("launcher")
    }

    pub fn manifest_cache_file(&self) -> PathBuf {
        self.launcher_dir().join("version_manifest_v2.json")
    }

    pub fn settings_file(&self) -> PathBuf {
        self.launcher_dir().join("settings.json")
    }

    pub fn accounts_file(&self) -> PathBuf {
        self.launcher_dir().join("accounts.json")
    }

    pub fn instances_dir(&self) -> PathBuf {
        self.root.join("instances")
    }

    pub fn instance_dir(&self, instance_id: &str) -> PathBuf {
        let safe_id = sanitize_filename(instance_id);
        self.instances_dir().join(safe_id)
    }

    pub fn instance_mods_dir(&self, instance_id: &str) -> PathBuf {
        self.instance_dir(instance_id).join("mods")
    }

    pub fn instances_file(&self) -> PathBuf {
        self.launcher_dir().join("instances.json")
    }
}

pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}
