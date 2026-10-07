use std::fs;
use std::path::Path;
use std::process::Command;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use crate::models::{LocalMod, ResourcePackItem};
use crate::minecraft::paths::MinecraftPaths;

pub struct ModManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateInfo {
    pub file_name: String,
    pub mod_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ModrinthManifestEntry {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    #[serde(rename = "modName")]
    pub mod_name: String,
    #[serde(rename = "currentVersion")]
    pub current_version: String,
}

pub const COMPANION_JAR_BYTES: &[u8] = include_bytes!("../../templates/volume-companion-1.0.jar");
pub const OFFLINE_SKINS_JAR_BYTES: &[u8] = include_bytes!("../../templates/offline-skins-26.3.jar");

impl ModManager {
    fn manifest_path(paths: &MinecraftPaths, instance_id: &str) -> std::path::PathBuf {
        paths.instance_mods_dir(instance_id).join(".modrinth_manifest.json")
    }

    fn read_manifest(paths: &MinecraftPaths, instance_id: &str) -> HashMap<String, ModrinthManifestEntry> {
        let path = Self::manifest_path(paths, instance_id);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(map) = serde_json::from_str::<HashMap<String, ModrinthManifestEntry>>(&content) {
                    return map;
                }
            }
        }
        HashMap::new()
    }

    fn save_manifest(paths: &MinecraftPaths, instance_id: &str, map: &HashMap<String, ModrinthManifestEntry>) {
        let path = Self::manifest_path(paths, instance_id);
        if let Ok(content) = serde_json::to_string_pretty(map) {
            let _ = fs::write(path, content);
        }
    }

    /// Lists all mods in the specified instance's `mods/` directory.
    pub fn list_mods(paths: &MinecraftPaths, instance_id: &str) -> Result<Vec<LocalMod>, String> {
        let mods_dir = paths.instance_mods_dir(instance_id);
        if !mods_dir.exists() {
            let _ = fs::create_dir_all(&mods_dir);
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(&mods_dir)
            .map_err(|e| format!("Failed to read mods directory: {}", e))?;

        let manifest = Self::read_manifest(paths, instance_id);
        let mut mods = Vec::new();

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();

            if file_name.starts_with('.') {
                continue;
            }

            if file_name.ends_with(".jar") || file_name.ends_with(".jar.disabled") {
                let enabled = file_name.ends_with(".jar");
                let mut mod_info = Self::parse_mod_jar(&path, &file_name, enabled);

                let clean_name = file_name.trim_end_matches(".disabled");
                if let Some(meta) = manifest.get(clean_name) {
                    mod_info.modrinth_project_id = Some(meta.project_id.clone());
                }

                mods.push(mod_info);
            }
        }

        // Sort alphabetically by name
        mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(mods)
    }

    /// Reads and parses `fabric.mod.json` inside a mod jar, falling back to file heuristics.
    fn parse_mod_jar(path: &Path, file_name: &str, enabled: bool) -> LocalMod {
        let default_name = file_name.trim_end_matches(".disabled").trim_end_matches(".jar");
        let (fallback_id, fallback_name, fallback_version) = Self::heuristic_name_version(default_name);

        if let Ok(file) = fs::File::open(path) {
            if let Ok(mut archive) = zip::ZipArchive::new(file) {
                // Try fabric.mod.json
                if let Ok(mut mod_json_entry) = archive.by_name("fabric.mod.json") {
                    let mut content = String::new();
                    use std::io::Read;
                    if mod_json_entry.read_to_string(&mut content).is_ok() {
                        if let Ok(val) = serde_json::from_str::<Value>(&content) {
                            let id = val.get("id").and_then(|v| v.as_str()).unwrap_or(&fallback_id).to_string();
                            let name = val.get("name").and_then(|v| v.as_str()).unwrap_or(&fallback_name).to_string();
                            let version = val.get("version").and_then(|v| v.as_str()).unwrap_or(&fallback_version).to_string();
                            let description = val.get("description").and_then(|v| v.as_str()).unwrap_or("No description provided.").to_string();

                            let mut authors = Vec::new();
                            if let Some(arr) = val.get("authors").and_then(|v| v.as_array()) {
                                for a in arr {
                                    if let Some(s) = a.as_str() {
                                        authors.push(s.to_string());
                                    } else if let Some(s) = a.get("name").and_then(|n| n.as_str()) {
                                        authors.push(s.to_string());
                                    }
                                }
                            }

                            let mut dependencies = Vec::new();
                            if let Some(deps) = val.get("depends").and_then(|v| v.as_object()) {
                                for (k, _) in deps {
                                    dependencies.push(k.clone());
                                }
                            }

                            let mut warning = None;
                            if let Some(env) = val.get("environment").and_then(|v| v.as_str()) {
                                if env == "server" {
                                    warning = Some("Warning: This mod is marked as a server-only mod.".to_string());
                                }
                            }

                            return LocalMod {
                                id,
                                name,
                                version,
                                loader: "Fabric".to_string(),
                                file_name: file_name.to_string(),
                                enabled,
                                description,
                                authors,
                                dependencies,
                                compatibility_warning: warning,
                                modrinth_project_id: None,
                                update_available: None,
                            };
                        }
                    }
                }
            }
        }

        // Fallback info
        LocalMod {
            id: fallback_id,
            name: fallback_name,
            version: fallback_version,
            loader: "Unknown".to_string(),
            file_name: file_name.to_string(),
            enabled,
            description: "Local mod package.".to_string(),
            authors: Vec::new(),
            dependencies: Vec::new(),
            compatibility_warning: Some("Notice: Missing or unrecognized fabric.mod.json metadata in archive.".to_string()),
            modrinth_project_id: None,
            update_available: None,
        }
    }

    fn heuristic_name_version(filename_base: &str) -> (String, String, String) {
        let parts: Vec<&str> = filename_base.split(['-', '_']).collect();
        if parts.len() > 1 {
            let name = parts[0].to_string();
            let version = parts[1..].join(".");
            let id = name.to_lowercase();
            (id, name, version)
        } else {
            (filename_base.to_lowercase(), filename_base.to_string(), "1.0.0".to_string())
        }
    }

    /// Toggles a mod between enabled (`.jar`) and disabled (`.jar.disabled`).
    pub fn toggle_mod(paths: &MinecraftPaths, instance_id: &str, file_name: &str) -> Result<LocalMod, String> {
        let mods_dir = paths.instance_mods_dir(instance_id);
        let current_path = mods_dir.join(file_name);

        if !current_path.exists() {
            return Err(format!("Mod file '{}' not found", file_name));
        }

        let new_file_name = if file_name.ends_with(".jar.disabled") {
            file_name.trim_end_matches(".disabled").to_string()
        } else if file_name.ends_with(".jar") {
            format!("{}.disabled", file_name)
        } else {
            return Err("Invalid mod file extension".to_string());
        };

        let new_path = mods_dir.join(&new_file_name);
        let mut renamed = false;
        let mut last_err = None;
        for _ in 0..10 {
            match fs::rename(&current_path, &new_path) {
                Ok(_) => {
                    renamed = true;
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
                    std::thread::sleep(std::time::Duration::from_millis(150));
                }
            }
        }
        if !renamed {
            return Err(format!("Failed to rename mod file: {}", last_err.map(|e| e.to_string()).unwrap_or_default()));
        }

        let enabled = new_file_name.ends_with(".jar");
        Ok(Self::parse_mod_jar(&new_path, &new_file_name, enabled))
    }

    /// Deletes a mod file from disk.
    pub fn delete_mod(paths: &MinecraftPaths, instance_id: &str, file_name: &str) -> Result<(), String> {
        let mods_dir = paths.instance_mods_dir(instance_id);
        let target_path = mods_dir.join(file_name);

        if !target_path.exists() {
            return Err(format!("Mod file '{}' not found", file_name));
        }

        fs::remove_file(&target_path)
            .map_err(|e| format!("Failed to delete mod file: {}", e))?;

        // Update manifest
        let mut manifest = Self::read_manifest(paths, instance_id);
        manifest.remove(file_name.trim_end_matches(".disabled"));
        Self::save_manifest(paths, instance_id, &manifest);

        Ok(())
    }

    /// Opens the mods directory in the system file explorer.
    pub fn open_mods_folder(paths: &MinecraftPaths, instance_id: &str) -> Result<(), String> {
        let mods_dir = paths.instance_mods_dir(instance_id);
        let _ = fs::create_dir_all(&mods_dir);

        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&mods_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file explorer: {}", e))?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("xdg-open")
                .arg(&mods_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file explorer: {}", e))?;
        }

        Ok(())
    }

    /// Generates a valid Fabric verification mod JAR containing compiled ModInitializer bytecode.
    pub fn generate_verification_mod_jar(target_path: &Path) -> Result<(), String> {
        let file = fs::File::create(target_path)
            .map_err(|e| format!("Failed to create verification mod JAR: {}", e))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // 1. fabric.mod.json
        zip.start_file("fabric.mod.json", options)
            .map_err(|e| format!("Failed to write fabric.mod.json: {}", e))?;
        let mod_json = r#"{
  "schemaVersion": 1,
  "id": "volume-test-mod",
  "version": "1.0.0",
  "name": "Volume Test Mod",
  "description": "Legitimate verification mod for Volume Launcher",
  "authors": ["Volume Launcher Team"],
  "contact": {},
  "license": "MIT",
  "environment": "*",
  "entrypoints": {
    "preLaunch": [
      "com.volumelauncher.testmod.VolumeTestMod"
    ],
    "main": [
      "com.volumelauncher.testmod.VolumeTestMod"
    ],
    "client": [
      "com.volumelauncher.testmod.VolumeTestMod"
    ]
  }
}"#;
        use std::io::Write;
        zip.write_all(mod_json.as_bytes())
            .map_err(|e| format!("Failed to write fabric.mod.json bytes: {}", e))?;

        // 2. Class file (normal bytecode, no XOR obfuscation)
        zip.start_file("com/volumelauncher/testmod/VolumeTestMod.class", options)
            .map_err(|e| format!("Failed to write class file: {}", e))?;
        zip.write_all(VERIFICATION_CLASS_BYTES)
            .map_err(|e| format!("Failed to write class bytes: {}", e))?;

        zip.finish().map_err(|e| format!("Failed to finalize verification mod JAR: {}", e))?;
        Ok(())
    }

    /// Ensures that the Volume Fabric Companion Mod is installed in the instance mods directory.
    pub fn ensure_companion_mod(mods_dir: &Path) -> Result<(), String> {
        let _ = fs::create_dir_all(mods_dir);

        let companion_jar_path = mods_dir.join("volume-companion-1.0.jar");
        if !companion_jar_path.exists() || fs::metadata(&companion_jar_path).map(|m| m.len()).unwrap_or(0) != COMPANION_JAR_BYTES.len() as u64 {
            fs::write(&companion_jar_path, COMPANION_JAR_BYTES)
                .map_err(|e| format!("Failed to write companion mod JAR: {}", e))?;
        }

        // Clean up legacy offline-skins mod to prevent missing fabric-api dependency error
        let offline_skins_path = mods_dir.join("offline-skins-26.3.jar");
        if offline_skins_path.exists() {
            let _ = fs::remove_file(offline_skins_path);
        }

        Ok(())
    }

    /// Disables or removes the Volume Companion mod from the instance mods directory.
    pub fn disable_companion_mod(mods_dir: &Path) {
        let companion_jar_path = mods_dir.join("volume-companion-1.0.jar");
        if companion_jar_path.exists() {
            let _ = fs::remove_file(companion_jar_path);
        }
        let disabled_companion_jar_path = mods_dir.join("volume-companion-1.0.jar.disabled");
        if disabled_companion_jar_path.exists() {
            let _ = fs::remove_file(disabled_companion_jar_path);
        }
    }

    /// Queries the Modrinth API for Minecraft mods matching query and compatibility parameters.
    pub async fn search_modrinth(
        query: &str,
        loader: Option<&str>,
        game_version: Option<&str>,
        project_type: Option<&str>,
    ) -> Result<Vec<ModrinthProjectHit>, String> {
        let client = reqwest::Client::builder()
            .user_agent("VolumeLauncher/1.0 (contact@volumelauncher.app)")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let p_type = project_type.unwrap_or("mod");
        let mut facets = vec![vec![format!("project_type:{}", p_type)]];
        if let Some(l) = loader {
            if !l.is_empty() && p_type == "mod" {
                facets.push(vec![format!("categories:{}", l.to_lowercase())]);
            }
        }
        if let Some(gv) = game_version {
            if !gv.is_empty() {
                facets.push(vec![format!("versions:{}", gv)]);
            }
        }

        let facets_json = serde_json::to_string(&facets).unwrap_or_default();
        let mut req = client.get("https://api.modrinth.com/v2/search")
            .query(&[("limit", "25")]);

        if !query.trim().is_empty() {
            req = req.query(&[("query", query.trim())]);
        }
        if !facets.is_empty() {
            req = req.query(&[("facets", &facets_json)]);
        }

        let resp = req.send().await
            .map_err(|e| format!("Modrinth search error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth search returned status: {}", resp.status()));
        }

        let val: Value = resp.json().await
            .map_err(|e| format!("Failed to parse Modrinth JSON: {}", e))?;

        let mut list = Vec::new();
        if let Some(hits) = val.get("hits").and_then(|h| h.as_array()) {
            for hit in hits {
                let project_id = hit.get("project_id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let title = hit.get("title").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let description = hit.get("description").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let author = hit.get("author").and_then(|v| v.as_str()).unwrap_or_default().to_string();
                let icon_url = hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string());
                let downloads = hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0);
                let follows = hit.get("follows").and_then(|v| v.as_u64()).unwrap_or(0);

                let categories: Vec<String> = hit.get("categories")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();

                let versions: Vec<String> = hit.get("versions")
                    .and_then(|v| v.as_array())
                    .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                    .unwrap_or_default();

                let matches_loader = loader.map_or(true, |l| l.is_empty() || p_type != "mod" || categories.iter().any(|c| c.eq_ignore_ascii_case(l)));
                let matches_version = game_version.map_or(true, |v| v.is_empty() || versions.iter().any(|ver| ver == v));
                let is_compatible = matches_loader && matches_version;

                list.push(ModrinthProjectHit {
                    project_id,
                    title,
                    description,
                    author,
                    icon_url,
                    downloads,
                    follows,
                    categories,
                    versions,
                    is_compatible,
                });
            }
        }

        Ok(list)
    }

    /// Installs one or more local .jar mod files into the specified instance's mods directory.
    pub fn install_local_mods(
        paths: &MinecraftPaths,
        instance_id: &str,
        source_paths: &[String],
    ) -> Result<Vec<LocalMod>, String> {
        let mods_dir = paths.instance_mods_dir(instance_id);
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods directory: {}", e))?;

        let mut installed = Vec::new();
        for src in source_paths {
            let src_path = Path::new(src);
            if !src_path.exists() {
                return Err(format!("Source mod file not found: {}", src));
            }
            let filename = match src_path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n,
                None => continue,
            };

            if !filename.ends_with(".jar") {
                return Err(format!("File '{}' is not a valid Minecraft mod .jar", filename));
            }

            // Verify it is a valid zip archive
            let file = fs::File::open(src_path)
                .map_err(|e| format!("Failed to open mod JAR '{}': {}", filename, e))?;
            zip::ZipArchive::new(file)
                .map_err(|e| format!("File '{}' is corrupted or not a valid ZIP/JAR archive: {}", filename, e))?;

            let dest_path = mods_dir.join(filename);
            fs::copy(src_path, &dest_path)
                .map_err(|e| format!("Failed to copy '{}' to instance mods folder: {}", filename, e))?;

            let mod_info = Self::parse_mod_jar(&dest_path, filename, true);
            installed.push(mod_info);
        }

        Ok(installed)
    }

    /// Downloads and installs a compatible mod from Modrinth directly into the instance mods directory,
    /// automatically resolving and installing any required dependencies (e.g. Fabric API) transactionally.
    pub async fn install_modrinth_mod(
        paths: &MinecraftPaths,
        instance_id: &str,
        project_id: &str,
        loader: &str,
        game_version: &str,
    ) -> Result<LocalMod, String> {
        let client = reqwest::Client::builder()
            .user_agent("VolumeLauncher/1.0 (contact@volumelauncher.app)")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let normalized_loader = if loader.eq_ignore_ascii_case("vanilla") {
            "fabric".to_string()
        } else {
            loader.to_lowercase()
        };

        let loaders_json = serde_json::to_string(&vec![normalized_loader.clone()]).unwrap_or_default();
        let gv_json = serde_json::to_string(&vec![game_version]).unwrap_or_default();

        let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);
        let resp = client.get(&url)
            .query(&[("loaders", &loaders_json), ("game_versions", &gv_json)])
            .send().await
            .map_err(|e| format!("Modrinth version request failed for {}: {}", project_id, e))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth version request returned HTTP status: {}", resp.status()));
        }

        let versions_arr: Value = resp.json().await
            .map_err(|e| format!("Failed to parse version JSON: {}", e))?;

        let first_version: Value = match versions_arr.as_array().and_then(|a| a.first().cloned()) {
            Some(v) => v,
            None => {
                // If not found with exact game_version, try querying without version restriction as fallback
                let fallback_resp = client.get(&url)
                    .query(&[("loaders", &loaders_json)])
                    .send().await
                    .map_err(|e| format!("Fallback query failed: {}", e))?;

                let fallback_arr: Value = fallback_resp.json().await
                    .unwrap_or(Value::Array(Vec::new()));

                match fallback_arr.as_array().and_then(|a| a.first().cloned()) {
                    Some(fv) => fv,
                    None => {
                        return Err(format!(
                            "No compatible version found for mod '{}' on {} {}. (Note: Minecraft mods require Fabric loader).",
                            project_id, normalized_loader, game_version
                        ));
                    }
                }
            }
        };

        let version_id = first_version.get("id").and_then(|v| v.as_str()).unwrap_or_default().to_string();
        let version_number = first_version.get("version_number").and_then(|v| v.as_str()).unwrap_or("1.0.0").to_string();
        let mod_title = first_version.get("name").and_then(|n| n.as_str()).unwrap_or(project_id).to_string();

        // 1. Dependency Resolution: check for required dependencies
        if let Some(deps) = first_version.get("dependencies").and_then(|d| d.as_array()) {
            for dep in deps {
                let dep_type = dep.get("dependency_type").and_then(|t| t.as_str()).unwrap_or_default();
                if dep_type == "required" {
                    if let Some(dep_proj_id) = dep.get("project_id").and_then(|p| p.as_str()) {
                        let manifest = Self::read_manifest(paths, instance_id);
                        let already_installed = manifest.values().any(|m| m.project_id == dep_proj_id);
                        if !already_installed {
                            // Recursively install required dependency
                            let _ = Box::pin(Self::install_modrinth_mod(paths, instance_id, dep_proj_id, &normalized_loader, game_version)).await;
                        }
                    }
                }
            }
        }

        // 2. Download Primary Mod File
        let files = first_version.get("files")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "No files found in version metadata".to_string())?;

        let primary_file = files.iter()
            .find(|f| f.get("primary").and_then(|p| p.as_bool()).unwrap_or(false))
            .or_else(|| files.first())
            .ok_or_else(|| "No valid file entry found".to_string())?;

        let download_url = primary_file.get("url")
            .and_then(|u| u.as_str())
            .ok_or_else(|| "File URL missing".to_string())?;

        let filename = primary_file.get("filename")
            .and_then(|n| n.as_str())
            .ok_or_else(|| "File name missing".to_string())?;

        let sha512_expected = primary_file.get("hashes").and_then(|h| h.get("sha512")).and_then(|s| s.as_str());
        let sha1_expected = primary_file.get("hashes").and_then(|h| h.get("sha1")).and_then(|s| s.as_str());

        let mods_dir = paths.instance_mods_dir(instance_id);
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Failed to create mods dir: {}", e))?;

        let dest_path = mods_dir.join(filename);
        let temp_path = mods_dir.join(format!("{}.download", filename));

        let bytes = client.get(download_url)
            .send().await
            .map_err(|e| format!("Failed to download mod JAR from {}: {}", download_url, e))?
            .bytes().await
            .map_err(|e| format!("Failed to read mod JAR bytes: {}", e))?;

        // Verify checksum integrity
        if let Some(expected_sha512) = sha512_expected {
            use sha2::{Sha512, Digest};
            let mut hasher = Sha512::new();
            hasher.update(&bytes);
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected_sha512) {
                return Err(format!("Integrity verification failed for {}: SHA-512 mismatch", filename));
            }
        } else if let Some(expected_sha1) = sha1_expected {
            use sha1::{Sha1, Digest};
            let mut hasher = Sha1::new();
            hasher.update(&bytes);
            let actual = hex::encode(hasher.finalize());
            if !actual.eq_ignore_ascii_case(expected_sha1) {
                return Err(format!("Integrity verification failed for {}: SHA-1 mismatch", filename));
            }
        }

        // Write to temporary download file first (Atomic transaction)
        fs::write(&temp_path, &bytes)
            .map_err(|e| format!("Failed to save temporary download: {}", e))?;

        // Atomically rename to destination
        fs::rename(&temp_path, &dest_path)
            .map_err(|e| format!("Failed to finalize mod installation: {}", e))?;

        // 3. Save to manifest for update tracking
        let mut manifest = Self::read_manifest(paths, instance_id);
        manifest.insert(filename.to_string(), ModrinthManifestEntry {
            project_id: project_id.to_string(),
            version_id,
            mod_name: mod_title,
            current_version: version_number,
        });
        Self::save_manifest(paths, instance_id, &manifest);

        let mut parsed = Self::parse_mod_jar(&dest_path, filename, true);
        parsed.modrinth_project_id = Some(project_id.to_string());
        Ok(parsed)
    }

    /// Checks for updates for all installed mods that have Modrinth tracking.
    pub async fn check_mod_updates(
        paths: &MinecraftPaths,
        instance_id: &str,
        loader: &str,
        game_version: &str,
    ) -> Result<Vec<ModUpdateInfo>, String> {
        let manifest = Self::read_manifest(paths, instance_id);
        if manifest.is_empty() {
            return Ok(Vec::new());
        }

        let client = reqwest::Client::builder()
            .user_agent("VolumeLauncher/1.0 (contact@volumelauncher.app)")
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let loaders_json = serde_json::to_string(&vec![loader.to_lowercase()]).unwrap_or_default();
        let gv_json = serde_json::to_string(&vec![game_version]).unwrap_or_default();

        let mut updates = Vec::new();

        for (file_name, entry) in manifest {
            let url = format!("https://api.modrinth.com/v2/project/{}/version", entry.project_id);
            if let Ok(resp) = client.get(&url)
                .query(&[("loaders", &loaders_json), ("game_versions", &gv_json)])
                .send().await
            {
                if resp.status().is_success() {
                    if let Ok(val) = resp.json::<Value>().await {
                        if let Some(first_ver) = val.as_array().and_then(|a| a.first()) {
                            let latest_ver_num = first_ver.get("version_number").and_then(|v| v.as_str()).unwrap_or_default();
                            if !latest_ver_num.is_empty() && latest_ver_num != entry.current_version {
                                updates.push(ModUpdateInfo {
                                    file_name: file_name.clone(),
                                    mod_name: entry.mod_name.clone(),
                                    current_version: entry.current_version.clone(),
                                    latest_version: latest_ver_num.to_string(),
                                    project_id: entry.project_id.clone(),
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(updates)
    }

    /// Updates a single mod by project ID.
    pub async fn update_mod(
        paths: &MinecraftPaths,
        instance_id: &str,
        project_id: &str,
        loader: &str,
        game_version: &str,
    ) -> Result<LocalMod, String> {
        let manifest = Self::read_manifest(paths, instance_id);
        for (file_name, entry) in &manifest {
            if entry.project_id == project_id {
                let _ = Self::delete_mod(paths, instance_id, file_name);
                break;
            }
        }

        Self::install_modrinth_mod(paths, instance_id, project_id, loader, game_version).await
    }

    // ========================================================================
    // RESOURCE PACKS
    // ========================================================================

    pub fn list_resourcepacks(paths: &MinecraftPaths, instance_id: &str) -> Result<Vec<ResourcePackItem>, String> {
        let rp_dir = paths.instance_dir(instance_id).join("resourcepacks");
        if !rp_dir.exists() {
            let _ = fs::create_dir_all(&rp_dir);
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(&rp_dir)
            .map_err(|e| format!("Failed to read resourcepacks: {}", e))?;

        let mut list = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default()
                .to_string();

            if file_name.ends_with(".zip") || file_name.ends_with(".zip.disabled") || path.is_dir() {
                let enabled = !file_name.ends_with(".disabled");
                let size_bytes = if path.is_file() {
                    fs::metadata(&path).map(|m| m.len()).unwrap_or(0)
                } else {
                    crate::launcher::backup::calculate_dir_size(&path).unwrap_or(0)
                };

                let name = file_name.trim_end_matches(".disabled").trim_end_matches(".zip").to_string();
                let mut desc = "Resource pack archive.".to_string();
                let mut pack_format = None;

                // Attempt to read pack.mcmeta if zip
                if path.is_file() {
                    if let Ok(file) = fs::File::open(&path) {
                        if let Ok(mut zip) = zip::ZipArchive::new(file) {
                            if let Ok(mut meta_entry) = zip.by_name("pack.mcmeta") {
                                use std::io::Read;
                                let mut content = String::new();
                                if meta_entry.read_to_string(&mut content).is_ok() {
                                    if let Ok(json) = serde_json::from_str::<Value>(&content) {
                                        if let Some(p) = json.get("pack") {
                                            if let Some(d) = p.get("description").and_then(|v| v.as_str()) {
                                                desc = d.to_string();
                                            }
                                            if let Some(f) = p.get("pack_format").and_then(|v| v.as_u64()) {
                                                pack_format = Some(f as u32);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                list.push(ResourcePackItem {
                    file_name: file_name.clone(),
                    name,
                    description: desc,
                    pack_format,
                    enabled,
                    size_bytes,
                });
            }
        }

        list.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(list)
    }

    pub fn toggle_resourcepack(paths: &MinecraftPaths, instance_id: &str, file_name: &str) -> Result<ResourcePackItem, String> {
        let rp_dir = paths.instance_dir(instance_id).join("resourcepacks");
        let current_path = rp_dir.join(file_name);

        if !current_path.exists() {
            return Err(format!("Resource pack '{}' not found", file_name));
        }

        let new_file_name = if file_name.ends_with(".disabled") {
            file_name.trim_end_matches(".disabled").to_string()
        } else {
            format!("{}.disabled", file_name)
        };

        let new_path = rp_dir.join(&new_file_name);
        fs::rename(&current_path, &new_path)
            .map_err(|e| format!("Failed to toggle resource pack: {}", e))?;

        let packs = Self::list_resourcepacks(paths, instance_id)?;
        packs.into_iter().find(|p| p.file_name == new_file_name)
            .ok_or_else(|| "Resource pack not found after toggle".to_string())
    }

    pub fn delete_resourcepack(paths: &MinecraftPaths, instance_id: &str, file_name: &str) -> Result<(), String> {
        let rp_dir = paths.instance_dir(instance_id).join("resourcepacks");
        let target_path = rp_dir.join(file_name);

        if !target_path.exists() {
            return Err(format!("Resource pack '{}' not found", file_name));
        }

        if target_path.is_dir() {
            fs::remove_dir_all(&target_path)
        } else {
            fs::remove_file(&target_path)
        }.map_err(|e| format!("Failed to delete resource pack: {}", e))
    }

    pub fn open_resourcepacks_folder(paths: &MinecraftPaths, instance_id: &str) -> Result<(), String> {
        let rp_dir = paths.instance_dir(instance_id).join("resourcepacks");
        let _ = fs::create_dir_all(&rp_dir);

        #[cfg(target_os = "windows")]
        {
            Command::new("explorer")
                .arg(&rp_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file explorer: {}", e))?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            Command::new("xdg-open")
                .arg(&rp_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file explorer: {}", e))?;
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthProjectHit {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub title: String,
    pub description: String,
    pub author: String,
    #[serde(rename = "iconUrl")]
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u64,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
    #[serde(rename = "isCompatible")]
    pub is_compatible: bool,
}

pub const VERIFICATION_CLASS_BYTES: &[u8] = &[
    202, 254, 186, 190, 0, 0, 0, 52, 0, 33, 1, 0, 40, 99, 111, 109, 47, 118, 111, 108, 117, 109, 101, 108, 97, 117,
    110, 99, 104, 101, 114, 47, 116, 101, 115, 116, 109, 111, 100, 47, 86, 111, 108, 117, 109, 101, 84, 101, 115,
    116, 77, 111, 100, 7, 0, 1, 1, 0, 16, 106, 97, 118, 97, 47, 108, 97, 110, 103, 47, 79, 98, 106, 101, 99, 116,
    7, 0, 3, 1, 0, 31, 110, 101, 116, 47, 102, 97, 98, 114, 105, 99, 109, 99, 47, 97, 112, 105, 47, 77, 111, 100,
    73, 110, 105, 116, 105, 97, 108, 105, 122, 101, 114, 7, 0, 5, 1, 0, 37, 110, 101, 116, 47, 102, 97, 98, 114,
    105, 99, 109, 99, 47, 97, 112, 105, 47, 67, 108, 105, 101, 110, 116, 77, 111, 100, 73, 110, 105, 116, 105, 97,
    108, 105, 122, 101, 114, 7, 0, 7, 1, 0, 54, 110, 101, 116, 47, 102, 97, 98, 114, 105, 99, 109, 99, 47, 108,
    111, 97, 100, 101, 114, 47, 97, 112, 105, 47, 101, 110, 116, 114, 121, 112, 111, 105, 110, 116, 47, 80, 114,
    101, 76, 97, 117, 110, 99, 104, 69, 110, 116, 114, 121, 112, 111, 105, 110, 116, 7, 0, 9, 1, 0, 6, 60, 105,
    110, 105, 116, 62, 1, 0, 3, 40, 41, 86, 1, 0, 4, 67, 111, 100, 101, 12, 0, 11, 0, 12, 10, 0, 4, 0, 14, 1, 0, 12,
    111, 110, 73, 110, 105, 116, 105, 97, 108, 105, 122, 101, 1, 0, 18, 111, 110, 73, 110, 105, 116, 105, 97, 108,
    105, 122, 101, 67, 108, 105, 101, 110, 116, 1, 0, 11, 111, 110, 80, 114, 101, 76, 97, 117, 110, 99, 104, 1, 0,
    16, 106, 97, 118, 97, 47, 108, 97, 110, 103, 47, 83, 121, 115, 116, 101, 109, 7, 0, 19, 1, 0, 3, 111, 117, 116,
    1, 0, 21, 76, 106, 97, 118, 97, 47, 105, 111, 47, 80, 114, 105, 110, 116, 83, 116, 114, 101, 97, 109, 59, 12,
    0, 21, 0, 22, 9, 0, 20, 0, 23, 1, 0, 38, 91, 86, 111, 108, 117, 109, 101, 84, 101, 115, 116, 77, 111, 100, 93,
    32, 73, 78, 73, 84, 73, 65, 76, 73, 90, 65, 84, 73, 79, 78, 95, 83, 85, 67, 67, 69, 83, 83, 8, 0, 25, 1, 0, 19,
    106, 97, 118, 97, 47, 105, 111, 47, 80, 114, 105, 110, 116, 83, 116, 114, 101, 97, 109, 7, 0, 27, 1, 0, 7, 112,
    114, 105, 110, 116, 108, 110, 1, 0, 21, 40, 76, 106, 97, 118, 97, 47, 108, 97, 110, 103, 47, 83, 116, 114, 105,
    110, 103, 59, 41, 86, 12, 0, 29, 0, 30, 10, 0, 28, 0, 31, 0, 33, 0, 2, 0, 4, 0, 3, 0, 6, 0, 8, 0, 10, 0, 0, 0, 4,
    0, 1, 0, 11, 0, 12, 0, 1, 0, 13, 0, 0, 0, 17, 0, 1, 0, 1, 0, 0, 0, 5, 42, 183, 0, 15, 177, 0, 0, 0, 0, 0, 1, 0,
    16, 0, 12, 0, 1, 0, 13, 0, 0, 0, 21, 0, 2, 0, 1, 0, 0, 0, 9, 178, 0, 24, 18, 26, 182, 0, 32, 177, 0, 0, 0, 0, 0,
    1, 0, 17, 0, 12, 0, 1, 0, 13, 0, 0, 0, 21, 0, 2, 0, 1, 0, 0, 0, 9, 178, 0, 24, 18, 26, 182, 0, 32, 177, 0, 0, 0,
    0, 0, 1, 0, 18, 0, 12, 0, 1, 0, 13, 0, 0, 0, 21, 0, 2, 0, 1, 0, 0, 0, 9, 178, 0, 24, 18, 26, 182, 0, 32, 177, 0,
    0, 0, 0, 0, 0
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mod_heuristic_parsing() {
        let (id, name, version) = ModManager::heuristic_name_version("Sodium-0.6.2");
        assert_eq!(id, "sodium");
        assert_eq!(name, "Sodium");
        assert_eq!(version, "0.6.2");

        let (id2, name2, version2) = ModManager::heuristic_name_version("iris-1.7.3");
        assert_eq!(id2, "iris");
        assert_eq!(name2, "iris");
        assert_eq!(version2, "1.7.3");
    }

    #[test]
    fn test_mod_packaging_and_toggle_lifecycle() {
        use std::io::Write;
        let temp_dir = std::env::temp_dir().join(format!("vol_mod_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let paths = MinecraftPaths::new(&temp_dir);
        let instance_id = "test_instance";
        let mods_dir = paths.instance_mods_dir(instance_id);
        fs::create_dir_all(&mods_dir).unwrap();

        // 1. Create a valid Fabric mod JAR with fabric.mod.json
        let mod_path = mods_dir.join("test-mod-1.2.3.jar");
        let file = fs::File::create(&mod_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("fabric.mod.json", options).unwrap();
        let fabric_json = r#"{
            "schemaVersion": 1,
            "id": "testmod",
            "name": "Test Fabric Mod",
            "version": "1.2.3",
            "description": "A verified test mod",
            "authors": ["TestAuthor"],
            "environment": "*"
        }"#;
        zip.write_all(fabric_json.as_bytes()).unwrap();
        zip.finish().unwrap();

        // 2. List mods and verify parsed metadata
        let mods = ModManager::list_mods(&paths, instance_id).unwrap();
        assert_eq!(mods.len(), 1);
        assert_eq!(mods[0].id, "testmod");
        assert_eq!(mods[0].name, "Test Fabric Mod");
        assert_eq!(mods[0].version, "1.2.3");
        assert_eq!(mods[0].authors, vec!["TestAuthor".to_string()]);
        assert!(mods[0].enabled);
        assert!(mods[0].compatibility_warning.is_none());

        // 3. Toggle mod to disabled (.jar.disabled)
        let toggled_off = ModManager::toggle_mod(&paths, instance_id, "test-mod-1.2.3.jar").unwrap();
        assert_eq!(toggled_off.file_name, "test-mod-1.2.3.jar.disabled");
        assert!(!toggled_off.enabled);
        assert!(mods_dir.join("test-mod-1.2.3.jar.disabled").exists());
        assert!(!mods_dir.join("test-mod-1.2.3.jar").exists());

        // 4. Toggle mod back to enabled (.jar)
        let toggled_on = ModManager::toggle_mod(&paths, instance_id, "test-mod-1.2.3.jar.disabled").unwrap();
        assert_eq!(toggled_on.file_name, "test-mod-1.2.3.jar");
        assert!(toggled_on.enabled);
        assert!(mods_dir.join("test-mod-1.2.3.jar").exists());

        // 5. Create a server-only mod to test compatibility warning
        let server_mod_path = mods_dir.join("server-only-1.0.jar");
        let s_file = fs::File::create(&server_mod_path).unwrap();
        let mut s_zip = zip::ZipWriter::new(s_file);
        s_zip.start_file("fabric.mod.json", options).unwrap();
        let server_json = r#"{
            "schemaVersion": 1,
            "id": "servermod",
            "name": "Server Only Mod",
            "version": "1.0",
            "environment": "server"
        }"#;
        s_zip.write_all(server_json.as_bytes()).unwrap();
        s_zip.finish().unwrap();

        let mods2 = ModManager::list_mods(&paths, instance_id).unwrap();
        let s_mod = mods2.iter().find(|m| m.id == "servermod").unwrap();
        assert!(s_mod.compatibility_warning.is_some());
        assert!(s_mod.compatibility_warning.as_ref().unwrap().contains("server-only"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn test_modrinth_search_api_and_compatibility_filter() {
        let results = ModManager::search_modrinth("sodium", Some("fabric"), Some("26.3"), None).await;
        match results {
            Ok(hits) => {
                assert!(!hits.is_empty(), "Modrinth search for 'sodium' must return results");
                let sodium_hit = hits.iter().find(|h| h.title.to_lowercase().contains("sodium")).unwrap_or(&hits[0]);
                assert!(!sodium_hit.project_id.is_empty());
                assert!(sodium_hit.categories.iter().any(|c| c.eq_ignore_ascii_case("fabric")));
                assert!(sodium_hit.is_compatible);
            }
            Err(e) => {
                println!("Modrinth search skipped/failed: {}", e);
            }
        }
    }

    #[test]
    fn test_install_local_mods_and_companion_mod() {
        use std::io::Write;
        let temp_dir = std::env::temp_dir().join(format!("vol_install_mod_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let paths = MinecraftPaths::new(&temp_dir);
        let instance_id = "test_inst_local";
        let inst_mods_dir = paths.instance_mods_dir(instance_id);

        // 1. Ensure companion mod generates properly
        fs::create_dir_all(&inst_mods_dir).unwrap();
        ModManager::ensure_companion_mod(&inst_mods_dir).unwrap();
        let companion_jar = inst_mods_dir.join("volume-companion-1.0.jar");
        assert!(companion_jar.exists(), "volume-companion-1.0.jar must exist");

        // Verify companion JAR content
        let c_file = fs::File::open(&companion_jar).unwrap();
        let mut c_archive = zip::ZipArchive::new(c_file).unwrap();
        assert!(c_archive.by_name("fabric.mod.json").is_ok());
        assert!(c_archive.by_name("com/volumelauncher/companion/VolumeCompanion.class").is_ok());
        assert!(c_archive.by_name("com/volumelauncher/companion/mixin/AvatarRendererNameTagMixin.class").is_ok());

        assert!(!inst_mods_dir.join("offline-skins-26.3.jar").exists());

        // 2. Create an external mod JAR in a separate staging folder
        let staging_dir = temp_dir.join("staging");
        fs::create_dir_all(&staging_dir).unwrap();
        let ext_jar = staging_dir.join("sample-mod-2.0.0.jar");
        let ext_file = fs::File::create(&ext_jar).unwrap();
        let mut ext_zip = zip::ZipWriter::new(ext_file);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        ext_zip.start_file("fabric.mod.json", options).unwrap();
        let fabric_json = r#"{
            "schemaVersion": 1,
            "id": "samplemod",
            "name": "Sample Mod",
            "version": "2.0.0"
        }"#;
        ext_zip.write_all(fabric_json.as_bytes()).unwrap();
        ext_zip.finish().unwrap();

        // 3. Install external mod into instance
        let installed = ModManager::install_local_mods(
            &paths,
            instance_id,
            &[ext_jar.to_string_lossy().to_string()],
        ).unwrap();

        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].id, "samplemod");
        assert_eq!(installed[0].name, "Sample Mod");
        assert_eq!(installed[0].version, "2.0.0");
        assert!(inst_mods_dir.join("sample-mod-2.0.0.jar").exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
