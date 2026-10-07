use std::fs;
use crate::models::{VersionManifest, VersionMetadata, FrontendVersionInfo};
use crate::minecraft::paths::MinecraftPaths;
use crate::minecraft::downloader::Downloader;

pub const MOJANG_MANIFEST_URL: &str = "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json";

pub struct ManifestService {
    downloader: Downloader,
    paths: MinecraftPaths,
}

impl ManifestService {
    pub fn new(paths: MinecraftPaths) -> Self {
        Self {
            downloader: Downloader::new(),
            paths,
        }
    }

    /// Retrieves the official version manifest from Mojang or reads from local cache.
    pub async fn get_manifest(&self, force_refresh: bool) -> Result<VersionManifest, String> {
        self.paths.ensure_directories().map_err(|e| e.to_string())?;
        let cache_path = self.paths.manifest_cache_file();

        // If not force refresh and cache exists, check age or read
        if !force_refresh && cache_path.exists() {
            if let Ok(content) = fs::read_to_string(&cache_path) {
                if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                    return Ok(manifest);
                }
            }
        }

        // Try downloading latest manifest from Mojang
        match self.downloader.fetch_json::<VersionManifest>(MOJANG_MANIFEST_URL).await {
            Ok(manifest) => {
                // Cache manifest to disk
                if let Ok(json_str) = serde_json::to_string_pretty(&manifest) {
                    let _ = fs::write(&cache_path, json_str);
                }
                Ok(manifest)
            }
            Err(err) => {
                // If download failed, fallback to cached manifest if available
                if cache_path.exists() {
                    if let Ok(content) = fs::read_to_string(&cache_path) {
                        if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                            return Ok(manifest);
                        }
                    }
                }
                Err(format!("Could not retrieve Minecraft version manifest: {}", err))
            }
        }
    }

    /// Returns available versions mapped with their installation status.
    pub async fn get_version_list(&self) -> Result<Vec<FrontendVersionInfo>, String> {
        let manifest = self.get_manifest(false).await?;
        let mut list = Vec::new();

        for summary in manifest.versions {
            let is_installed = self.is_version_installed(&summary.id);
            let display_name = format!("MINECRAFT {}", summary.id);

            // Nicely formatted release date
            let release_date = summary.release_time
                .split('T')
                .next()
                .unwrap_or(&summary.release_time)
                .to_string();

            let type_str = summary.version_type.clone();
            let description = if type_str == "release" {
                format!("Official Mojang release of Minecraft {}.", summary.id)
            } else {
                format!("Mojang development snapshot for experimental testing.")
            };

            list.push(FrontendVersionInfo {
                id: summary.id,
                name: display_name,
                version_type: type_str,
                installed: is_installed,
                release_date,
                size: "Client ~500 MB".to_string(),
                description,
            });
        }

        Ok(list)
    }

    /// Checks if a version's client jar and json exist and are non-empty.
    pub fn is_version_installed(&self, version_id: &str) -> bool {
        let jar_path = self.paths.version_jar(version_id);
        let json_path = self.paths.version_json(version_id);

        if !jar_path.exists() || !json_path.exists() {
            return false;
        }

        let jar_ok = fs::metadata(&jar_path).map(|m| m.len() > 100_000).unwrap_or(false);
        let json_ok = fs::metadata(&json_path).map(|m| m.len() > 100).unwrap_or(false);

        jar_ok && json_ok
    }

    /// Retrieves version metadata, downloading and caching if not already stored locally.
    pub async fn get_version_metadata(&self, version_id: &str) -> Result<VersionMetadata, String> {
        self.paths.ensure_directories().map_err(|e| e.to_string())?;
        let json_path = self.paths.version_json(version_id);

        if json_path.exists() {
            if let Ok(content) = fs::read_to_string(&json_path) {
                if let Ok(meta) = serde_json::from_str::<VersionMetadata>(&content) {
                    return Ok(meta);
                }
            }
        }

        // Find version url in manifest
        let manifest = self.get_manifest(false).await?;
        let summary = manifest.versions
            .iter()
            .find(|v| v.id == version_id)
            .ok_or_else(|| format!("Minecraft version '{}' not found in manifest.", version_id))?;

        let meta = self.downloader.fetch_json::<VersionMetadata>(&summary.url).await
            .map_err(|e| format!("Could not download metadata for {}: {}", version_id, e))?;

        // Cache version json
        let version_dir = self.paths.version_dir(version_id);
        fs::create_dir_all(&version_dir).map_err(|e| e.to_string())?;

        if let Ok(meta_json) = serde_json::to_string_pretty(&meta) {
            let _ = fs::write(&json_path, meta_json);
        }

        Ok(meta)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_manifest_retrieval() {
        let temp_dir = std::env::temp_dir().join("volume_test_mc");
        let paths = MinecraftPaths::new(temp_dir);
        let service = ManifestService::new(paths);

        let manifest = service.get_manifest(true).await.expect("Failed to fetch manifest");
        println!("Latest release: {}", manifest.latest.release);
        println!("Latest snapshot: {}", manifest.latest.snapshot);
        println!("Total versions in manifest: {}", manifest.versions.len());

        assert!(!manifest.versions.is_empty());
        assert!(!manifest.latest.release.is_empty());

        let meta = service.get_version_metadata(&manifest.latest.release).await.expect("Failed to fetch metadata");
        println!("Metadata for {}: mainClass={}", meta.id, meta.main_class);
        assert_eq!(meta.id, manifest.latest.release);
    }
}
