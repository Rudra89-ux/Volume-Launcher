use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceWorldInfo {
    pub folder_name: String,
    pub display_name: String,
    pub size_bytes: u64,
    pub last_modified: u64,
    pub backup_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldBackupInfo {
    pub backup_id: String,
    pub world_folder_name: String,
    pub timestamp: u64,
    pub size_bytes: u64,
    pub path: String,
}

pub struct WorldPackageService;

impl WorldPackageService {
    /// Computes SHA-256 hash of a file on disk.
    pub fn compute_sha256(path: &Path) -> Result<String, String> {
        let mut file = File::open(path)
            .map_err(|e| format!("Failed to open file for SHA-256: {}", e))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = file.read(&mut buffer)
                .map_err(|e| format!("Error reading for hash: {}", e))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }
        Ok(hex::encode(hasher.finalize()))
    }

    /// Packs an instance world save directory into a standalone `.vworld` ZIP archive.
    pub fn pack_world(world_dir: &Path, output_zip: &Path) -> Result<(String, u64), String> {
        if !world_dir.exists() {
            return Err(format!("World directory does not exist: {}", world_dir.display()));
        }

        if let Some(parent) = output_zip.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let file = File::create(output_zip)
            .map_err(|e| format!("Failed to create world archive: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        Self::add_dir_to_zip(&mut zip, world_dir, world_dir, options)?;
        zip.finish().map_err(|e| format!("Failed to finalize world ZIP: {}", e))?;

        let size = fs::metadata(output_zip)
            .map_err(|e| format!("Failed to get archive size: {}", e))?.len();
        let hash = Self::compute_sha256(output_zip)?;
        Ok((hash, size))
    }

    fn add_dir_to_zip<W: Write + std::io::Seek>(
        zip: &mut zip::ZipWriter<W>,
        current_dir: &Path,
        root_dir: &Path,
        options: zip::write::SimpleFileOptions,
    ) -> Result<(), String> {
        let entries = fs::read_dir(current_dir)
            .map_err(|e| format!("Failed to read world dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            let rel_path = path.strip_prefix(root_dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .replace('\\', "/");

            if path.is_dir() {
                zip.add_directory(&rel_path, options)
                    .map_err(|e| format!("Failed to add directory entry: {}", e))?;
                Self::add_dir_to_zip(zip, &path, root_dir, options)?;
            } else if path.is_file() {
                zip.start_file(&rel_path, options)
                    .map_err(|e| format!("Failed to start ZIP file entry: {}", e))?;
                let mut f = File::open(&path)
                    .map_err(|e| format!("Failed to open world file: {}", e))?;
                let mut buf = Vec::new();
                f.read_to_end(&mut buf)
                    .map_err(|e| format!("Failed to read world file bytes: {}", e))?;
                zip.write_all(&buf)
                    .map_err(|e| format!("Failed to write ZIP file entry: {}", e))?;
            }
        }
        Ok(())
    }

    /// Restores a world from a `.vworld` archive into the target instance saves directory.
    /// Strictly protects against Path Traversal and creates automatic backups before replacement.
    pub fn unpack_world(archive_path: &Path, target_world_dir: &Path) -> Result<Option<PathBuf>, String> {
        let file = File::open(archive_path)
            .map_err(|e| format!("Failed to open world archive: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read world ZIP: {}", e))?;

        // 1. Path traversal security audit
        for i in 0..archive.len() {
            let entry = archive.by_index(i)
                .map_err(|e| format!("Corrupt entry in world archive: {}", e))?;
            let name = entry.name();
            if name.contains("..") || name.starts_with('/') || name.starts_with('\\') || name.contains(':') {
                return Err(format!("Security violation: world archive contains illegal path '{}'", name));
            }
        }

        // 2. Create backup if local world already exists
        let backup_path = if target_world_dir.exists() {
            Some(Self::create_backup(target_world_dir)?)
        } else {
            None
        };

        // 3. Extract to a temporary directory first (Atomic extraction)
        let temp_extract = target_world_dir.with_extension("tmp_extract");
        let _ = fs::remove_dir_all(&temp_extract);
        fs::create_dir_all(&temp_extract)
            .map_err(|e| format!("Failed to create temp extraction dir: {}", e))?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)
                .map_err(|e| format!("Failed to read archive entry: {}", e))?;
            let outpath = match entry.enclosed_name() {
                Some(path) => temp_extract.join(path),
                None => continue,
            };

            if entry.is_dir() {
                fs::create_dir_all(&outpath)
                    .map_err(|e| format!("Failed to create extracted directory: {}", e))?;
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = fs::create_dir_all(p);
                }
                let mut outfile = File::create(&outpath)
                    .map_err(|e| format!("Failed to create extracted file: {}", e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to extract file contents: {}", e))?;
            }
        }

        // 4. Move temp_extract to target_world_dir
        let _ = fs::remove_dir_all(target_world_dir);
        fs::rename(&temp_extract, target_world_dir)
            .map_err(|e| format!("Failed to finalize restored world directory: {}", e))?;

        Ok(backup_path)
    }

    /// Creates an automated timestamped backup of the given world directory.
    pub fn create_backup(world_dir: &Path) -> Result<PathBuf, String> {
        if !world_dir.exists() {
            return Err("World directory does not exist".to_string());
        }

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let parent = world_dir.parent().unwrap_or(world_dir);
        let dir_name = world_dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("world");

        let backup_dir = parent.join(format!("{}.backup_{}", dir_name, timestamp));
        Self::copy_dir_all(world_dir, &backup_dir)?;
        Ok(backup_dir)
    }

    /// Lists all backups for a given world in the saves directory.
    pub fn list_backups(saves_dir: &Path, world_folder_name: &str) -> Vec<WorldBackupInfo> {
        let mut list = Vec::new();
        let prefix = format!("{}.backup_", world_folder_name);

        if let Ok(entries) = fs::read_dir(saves_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&prefix) && entry.path().is_dir() {
                    let timestamp_str = name.trim_start_matches(&prefix);
                    let timestamp = timestamp_str.parse::<u64>().unwrap_or(0);
                    let size_bytes = calculate_dir_size(&entry.path()).unwrap_or(0);
                    list.push(WorldBackupInfo {
                        backup_id: name.clone(),
                        world_folder_name: world_folder_name.to_string(),
                        timestamp,
                        size_bytes,
                        path: entry.path().to_string_lossy().to_string(),
                    });
                }
            }
        }

        list.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        list
    }

    /// Restores a world from a local backup directory.
    pub fn restore_backup(backup_dir: &Path, target_world_dir: &Path) -> Result<(), String> {
        if !backup_dir.exists() {
            return Err("Backup directory does not exist".to_string());
        }

        // Before restoring, safety backup of existing world if it has data
        if target_world_dir.exists() {
            let _ = Self::create_backup(target_world_dir);
            let _ = fs::remove_dir_all(target_world_dir);
        }

        Self::copy_dir_all(backup_dir, target_world_dir)
    }

    /// Deletes a backup directory.
    pub fn delete_backup(backup_dir: &Path) -> Result<(), String> {
        if !backup_dir.exists() {
            return Err("Backup directory not found".to_string());
        }
        fs::remove_dir_all(backup_dir).map_err(|e| format!("Failed to delete backup: {}", e))
    }

    pub fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
        fs::create_dir_all(dst)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
            let path = entry.path();
            let dest_path = dst.join(entry.file_name());
            if path.is_dir() {
                Self::copy_dir_all(&path, &dest_path)?;
            } else {
                fs::copy(&path, &dest_path)
                    .map_err(|e| format!("Failed to copy file: {}", e))?;
            }
        }
        Ok(())
    }
}

pub fn calculate_dir_size(path: &Path) -> Result<u64, std::io::Error> {
    let mut total = 0;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += calculate_dir_size(&p)?;
            } else if let Ok(meta) = p.metadata() {
                total += meta.len();
            }
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_world_packaging_and_atomic_restore_safety() {
        let temp_root = std::env::temp_dir().join(format!("vol_world_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let world_dir = temp_root.join("Alpha_World");
        fs::create_dir_all(&world_dir).unwrap();
        fs::write(world_dir.join("level.dat"), b"MINECRAFT_WORLD_DATA_V1").unwrap();
        fs::write(world_dir.join("session.lock"), b"LOCK").unwrap();

        // 1. Pack world to .vworld
        let archive_path = temp_root.join("alpha.vworld");
        let (hash, size) = WorldPackageService::pack_world(&world_dir, &archive_path).unwrap();
        assert!(!hash.is_empty());
        assert!(size > 0);
        assert!(archive_path.exists());

        // 2. Unpack to target world
        let target_dir = temp_root.join("Restored_World");
        let backup = WorldPackageService::unpack_world(&archive_path, &target_dir).unwrap();
        assert!(backup.is_none()); // Was brand new, no backup needed
        assert!(target_dir.join("level.dat").exists());
        assert_eq!(fs::read(target_dir.join("level.dat")).unwrap(), b"MINECRAFT_WORLD_DATA_V1");

        // 3. Unpack again over existing world - should create automatic backup!
        fs::write(target_dir.join("level.dat"), b"MODIFIED_BEFORE_RESTORE").unwrap();
        let backup2 = WorldPackageService::unpack_world(&archive_path, &target_dir).unwrap();
        assert!(backup2.is_some());
        let backup_path = backup2.unwrap();
        assert!(backup_path.exists());
        assert_eq!(fs::read(backup_path.join("level.dat")).unwrap(), b"MODIFIED_BEFORE_RESTORE");
        assert_eq!(fs::read(target_dir.join("level.dat")).unwrap(), b"MINECRAFT_WORLD_DATA_V1");

        // 4. Manual backup creation & listing
        let manual_backup = WorldPackageService::create_backup(&target_dir).unwrap();
        assert!(manual_backup.exists());
        let backups = WorldPackageService::list_backups(&temp_root, "Restored_World");
        assert!(backups.len() >= 2);

        let _ = fs::remove_dir_all(&temp_root);
    }
}
