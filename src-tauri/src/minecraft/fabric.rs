use serde::{Deserialize, Serialize};
use std::fs;
use crate::models::{VersionMetadata, Library};
use crate::minecraft::paths::MinecraftPaths;

pub const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricLoaderItem {
    pub separator: Option<String>,
    pub build: Option<u32>,
    pub maven: String,
    pub version: String,
    pub stable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FabricLoaderVersionResponse {
    pub loader: FabricLoaderItem,
}

pub struct FabricService {
    paths: MinecraftPaths,
    client: reqwest::Client,
}

impl FabricService {
    pub fn new(paths: MinecraftPaths) -> Self {
        Self {
            paths,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .unwrap_or_default(),
        }
    }

    /// Fetches all compatible Fabric loader versions for a given Minecraft game version.
    pub async fn get_loader_versions(&self, game_version: &str) -> Result<Vec<FabricLoaderItem>, String> {
        let url = format!("{}/versions/loader/{}", FABRIC_META_URL, game_version);
        let resp = self.client.get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to reach Fabric meta API: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Fabric meta returned status: {}", resp.status()));
        }

        let items: Vec<FabricLoaderVersionResponse> = resp.json()
            .await
            .map_err(|e| format!("Failed to parse Fabric loader versions: {}", e))?;

        let loaders: Vec<FabricLoaderItem> = items.into_iter().map(|item| item.loader).collect();
        Ok(loaders)
    }

    /// Gets the recommended / latest stable loader version for a Minecraft version.
    pub async fn get_recommended_loader(&self, game_version: &str) -> Result<String, String> {
        let loaders = self.get_loader_versions(game_version).await?;
        if loaders.is_empty() {
            return Err(format!("No Fabric loader versions available for Minecraft {}", game_version));
        }
        // Prefer latest stable, or first available
        if let Some(stable) = loaders.iter().find(|l| l.stable) {
            Ok(stable.version.clone())
        } else {
            Ok(loaders[0].version.clone())
        }
    }

    /// Fetches the official Fabric profile JSON for a game and loader version.
    pub async fn fetch_fabric_profile_json(&self, game_version: &str, loader_version: &str) -> Result<VersionMetadata, String> {
        let url = format!("{}/versions/loader/{}/{}/profile/json", FABRIC_META_URL, game_version, loader_version);
        let resp = self.client.get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to download Fabric profile JSON: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Fabric profile API returned status: {}", resp.status()));
        }

        let metadata: VersionMetadata = resp.json()
            .await
            .map_err(|e| format!("Failed to parse Fabric profile JSON: {}", e))?;

        // Save to disk in versions/<id>/<id>.json
        let version_dir = self.paths.version_dir(&metadata.id);
        let _ = fs::create_dir_all(&version_dir);
        let version_json_file = self.paths.version_json(&metadata.id);
        if let Ok(json_str) = serde_json::to_string_pretty(&metadata) {
            let _ = fs::write(version_json_file, json_str);
        }

        Ok(metadata)
    }

    /// Combines Fabric metadata with its base Vanilla metadata.
    pub fn merge_with_vanilla(fabric_meta: &VersionMetadata, vanilla_meta: &VersionMetadata) -> VersionMetadata {
        let mut merged = vanilla_meta.clone();

        // Use Fabric ID, mainClass, time
        merged.id = fabric_meta.id.clone();
        merged.main_class = fabric_meta.main_class.clone();
        merged.inherits_from = Some(vanilla_meta.id.clone());

        // Prepend Fabric libraries ahead of vanilla libraries
        let mut all_libraries: Vec<Library> = fabric_meta.libraries.clone();
        for van_lib in &vanilla_meta.libraries {
            // Avoid duplicates by library name
            if !all_libraries.iter().any(|l| l.name == van_lib.name) {
                all_libraries.push(van_lib.clone());
            }
        }
        merged.libraries = all_libraries;

        // Merge arguments if Fabric specifies any
        if let Some(fab_args) = &fabric_meta.arguments {
            let mut base_args = merged.arguments.unwrap_or(crate::models::VersionArguments {
                game: Some(Vec::new()),
                jvm: Some(Vec::new()),
            });

            if let Some(fab_jvm) = &fab_args.jvm {
                let mut current_jvm = base_args.jvm.unwrap_or_default();
                for arg in fab_jvm {
                    current_jvm.push(arg.clone());
                }
                base_args.jvm = Some(current_jvm);
            }

            if let Some(fab_game) = &fab_args.game {
                let mut current_game = base_args.game.unwrap_or_default();
                for arg in fab_game {
                    current_game.push(arg.clone());
                }
                base_args.game = Some(current_game);
            }

            merged.arguments = Some(base_args);
        }

        merged
    }
}

/// Converts a Maven coordinate into a relative file path.
/// e.g. "net.fabricmc:fabric-loader:0.16.10" -> "net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar"
pub fn maven_to_path(coordinate: &str) -> Option<(String, String)> {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let group = parts[0].replace('.', "/");
    let artifact = parts[1];
    let version = parts[2];
    let (classifier, ext) = if parts.len() > 3 {
        let last = parts[3];
        if last.contains('@') {
            let sub: Vec<&str> = last.split('@').collect();
            (format!("-{}", sub[0]), sub[1])
        } else {
            (format!("-{}", last), "jar")
        }
    } else {
        ("".to_string(), "jar")
    };

    let filename = format!("{}-{}{}.{}", artifact, version, classifier, ext);
    let rel_path = format!("{}/{}/{}/{}", group, artifact, version, filename);
    Some((rel_path, filename))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_maven_to_path_resolution() {
        let (rel, file) = maven_to_path("net.fabricmc:fabric-loader:0.16.10").unwrap();
        assert_eq!(file, "fabric-loader-0.16.10.jar");
        assert_eq!(rel, "net/fabricmc/fabric-loader/0.16.10/fabric-loader-0.16.10.jar");

        let (rel2, file2) = maven_to_path("org.ow2.asm:asm-commons:9.7.1").unwrap();
        assert_eq!(file2, "asm-commons-9.7.1.jar");
        assert_eq!(rel2, "org/ow2/asm/asm-commons/9.7.1/asm-commons-9.7.1.jar");
    }
}

