use std::fs;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, AtomicU64, Ordering};
use tokio::sync::Semaphore;
use crate::models::{
    Library, AssetIndex, InstallProgress, VerificationResult, VersionMetadata
};
use crate::minecraft::paths::MinecraftPaths;
use crate::minecraft::downloader::Downloader;
use crate::minecraft::manifest::ManifestService;
use crate::minecraft::fabric::{FabricService, maven_to_path};

pub const MOJANG_RESOURCES_BASE: &str = "https://resources.download.minecraft.net";

pub struct Installer {
    downloader: Downloader,
    paths: MinecraftPaths,
    manifest_service: ManifestService,
    fabric_service: FabricService,
}

impl Installer {
    pub fn new(paths: MinecraftPaths) -> Self {
        Self {
            downloader: Downloader::new(),
            paths: paths.clone(),
            manifest_service: ManifestService::new(paths.clone()),
            fabric_service: FabricService::new(paths),
        }
    }

    fn emit_progress<F: Fn(InstallProgress)>(
        on_progress: &F,
        version: &str,
        stage: &str,
        current: usize,
        total: usize,
        bytes_downloaded: u64,
        bytes_total: u64,
        current_file: &str,
        message: Option<String>,
    ) {
        let payload = InstallProgress {
            version: version.to_string(),
            stage: stage.to_string(),
            current,
            total,
            bytes_downloaded,
            bytes_total,
            current_file: current_file.to_string(),
            message,
        };
        on_progress(payload);
    }

    pub fn is_library_allowed_on_windows(library: &Library) -> bool {
        if let Some(rules) = &library.rules {
            let mut allowed = false;
            for rule in rules {
                let matches_os = match &rule.os {
                    Some(os) => os.name.as_deref() == Some("windows"),
                    None => true,
                };
                if matches_os {
                    allowed = rule.action == "allow";
                }
            }
            allowed
        } else {
            true
        }
    }

    /// Resolves metadata for either Vanilla or Fabric versions.
    pub async fn resolve_metadata(&self, version_id: &str) -> Result<VersionMetadata, String> {
        let version_json_path = self.paths.version_json(version_id);

        if version_id.starts_with("fabric-loader-") {
            let after_prefix = version_id.trim_start_matches("fabric-loader-");
            let parts: Vec<&str> = after_prefix.split('-').collect();
            if parts.len() >= 2 {
                let loader = parts[0];
                let game = parts[1..].join("-");
                let fabric_meta = self.fabric_service.fetch_fabric_profile_json(&game, loader).await?;
                let vanilla_meta = self.manifest_service.get_version_metadata(&game).await?;
                let merged = FabricService::merge_with_vanilla(&fabric_meta, &vanilla_meta);

                // Persist merged metadata
                let _ = fs::create_dir_all(self.paths.version_dir(version_id));
                if let Ok(json_str) = serde_json::to_string_pretty(&merged) {
                    let _ = fs::write(&version_json_path, json_str);
                }

                return Ok(merged);
            }
        }

        self.manifest_service.get_version_metadata(version_id).await
    }

    pub async fn install_version<F>(&self, version_id: &str, on_progress: F) -> Result<(), String>
    where
        F: Fn(InstallProgress) + Send + Sync + 'static,
    {
        self.paths.ensure_directories().map_err(|e| e.to_string())?;
        let progress_cb = Arc::new(on_progress);

        // 1. Manifest & Metadata stage
        Self::emit_progress(
            &*progress_cb, version_id, "manifest", 0, 1, 0, 0,
            "version.json", Some("Resolving version metadata...".to_string())
        );

        let metadata = self.resolve_metadata(version_id).await
            .map_err(|e| format!("Could not download version metadata for {}: {}", version_id, e))?;

        let base_version_id = metadata.inherits_from.as_deref().unwrap_or(version_id);

        // 2. Client JAR stage (if inherits_from, client jar is from base version)
        Self::emit_progress(
            &*progress_cb, version_id, "client", 0, 1, 0, 0,
            &format!("{}.jar", base_version_id), Some("Downloading Minecraft client JAR...".to_string())
        );

        if let Some(downloads) = &metadata.downloads {
            if let Some(client_artifact) = &downloads.client {
                let client_jar_path = self.paths.version_jar(base_version_id);
                let _ = fs::create_dir_all(self.paths.version_dir(base_version_id));

                let p_cb = progress_cb.clone();
                let v_id = version_id.to_string();
                self.downloader.download_file(
                    &client_artifact.url,
                    &client_jar_path,
                    Some(&client_artifact.sha1),
                    Some(client_artifact.size),
                    move |downloaded, total| {
                        Self::emit_progress(
                            &*p_cb, &v_id, "client", 1, 1,
                            downloaded, total,
                            &format!("{}.jar", v_id), None
                        );
                    }
                ).await.map_err(|e| format!("Client JAR download failed: {}", e))?;
            }
        }

        // 3. Libraries stage
        let mut libraries_to_download: Vec<(String, std::path::PathBuf, Option<String>, u64, String)> = Vec::new();
        let mut native_jars_to_extract = Vec::new();

        for lib in &metadata.libraries {
            if !Self::is_library_allowed_on_windows(lib) {
                continue;
            }

            let mut handled = false;

            if let Some(downloads) = &lib.downloads {
                // Main artifact
                if let Some(artifact) = &downloads.artifact {
                    if let Some(rel_path) = &artifact.path {
                        let target = self.paths.libraries_dir().join(rel_path);
                        libraries_to_download.push((
                            artifact.url.clone(),
                            target,
                            Some(artifact.sha1.clone()),
                            artifact.size,
                            rel_path.clone(),
                        ));
                        handled = true;
                    }
                }

                // Windows native classifiers (e.g. natives-windows)
                if let Some(classifiers) = &downloads.classifiers {
                    for (classifier_key, classifier_artifact) in classifiers {
                        if classifier_key.contains("windows") {
                            let rel_path = classifier_artifact.path.clone().unwrap_or_else(|| {
                                format!("{}-{}.jar", lib.name.replace(':', "-"), classifier_key)
                            });
                            let target = self.paths.libraries_dir().join(&rel_path);
                            libraries_to_download.push((
                                classifier_artifact.url.clone(),
                                target.clone(),
                                Some(classifier_artifact.sha1.clone()),
                                classifier_artifact.size,
                                rel_path,
                            ));
                            native_jars_to_extract.push(target);
                            handled = true;
                        }
                    }
                }
            }

            // Fallback for Maven libraries (e.g. Fabric libraries)
            if !handled {
                if let Some((rel_path, _filename)) = maven_to_path(&lib.name) {
                    let target = self.paths.libraries_dir().join(&rel_path);
                    let url = if let Some(base_url) = &lib.url {
                        let base = base_url.trim_end_matches('/');
                        format!("{}/{}", base, rel_path.trim_start_matches('/'))
                    } else {
                        format!("https://libraries.minecraft.net/{}", rel_path.trim_start_matches('/'))
                    };

                    libraries_to_download.push((
                        url,
                        target,
                        None,
                        0,
                        rel_path,
                    ));
                }
            }
        }

        let total_libs = libraries_to_download.len();
        let completed_libs = Arc::new(AtomicUsize::new(0));
        let bytes_libs = Arc::new(AtomicU64::new(0));
        let total_lib_bytes: u64 = libraries_to_download.iter().map(|item| item.3).sum();

        Self::emit_progress(
            &*progress_cb, version_id, "libraries", 0, total_libs, 0, total_lib_bytes,
            "libraries", Some(format!("Downloading {} required libraries...", total_libs))
        );

        // Concurrently download libraries
        let semaphore = Arc::new(Semaphore::new(10));
        let mut lib_tasks = Vec::new();

        for (url, target, sha1, size, rel_name) in libraries_to_download {
            let sem = semaphore.clone();
            let dl = self.downloader.clone();
            let p_cb = progress_cb.clone();
            let ver_id = version_id.to_string();
            let comp = completed_libs.clone();
            let b_dl = bytes_libs.clone();
            let tot_bytes = total_lib_bytes;
            let tot_libs = total_libs;

            lib_tasks.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                dl.download_file(&url, &target, sha1.as_deref(), if size > 0 { Some(size) } else { None }, |_, _| {}).await
                    .map_err(|e| format!("Library download failed for {}: {}", rel_name, e))?;

                let current_c = comp.fetch_add(1, Ordering::SeqCst) + 1;
                let current_b = b_dl.fetch_add(size, Ordering::SeqCst) + size;

                if current_c % 5 == 0 || current_c == tot_libs {
                    Self::emit_progress(
                        &*p_cb, &ver_id, "libraries", current_c, tot_libs,
                        current_b, tot_bytes, &rel_name, None
                    );
                }
                Ok::<(), String>(())
            }));
        }

        for task in lib_tasks {
            match task.await {
                Ok(res) => res?,
                Err(e) => return Err(format!("Library task join error: {}", e)),
            }
        }

        // 4. Extract native DLL libraries if any
        if !native_jars_to_extract.is_empty() {
            Self::emit_progress(
                &*progress_cb, version_id, "natives", 0, native_jars_to_extract.len(),
                0, 0, "natives", Some("Extracting native binaries...".to_string())
            );

            let natives_dir = self.paths.version_natives_dir(base_version_id);
            let _ = fs::create_dir_all(&natives_dir);

            for jar_path in &native_jars_to_extract {
                if jar_path.exists() {
                    if let Ok(file) = fs::File::open(jar_path) {
                        if let Ok(mut archive) = zip::ZipArchive::new(file) {
                            for i in 0..archive.len() {
                                if let Ok(mut entry) = archive.by_index(i) {
                                    let name = entry.name().to_string();
                                    if !name.starts_with("META-INF") && (name.ends_with(".dll") || name.ends_with(".so") || name.ends_with(".dylib")) {
                                        let file_name = std::path::Path::new(&name)
                                            .file_name()
                                            .and_then(|n| n.to_str())
                                            .unwrap_or(&name);
                                        let dest = natives_dir.join(file_name);
                                        if let Ok(mut outfile) = fs::File::create(&dest) {
                                            let _ = std::io::copy(&mut entry, &mut outfile);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 5. Assets stage
        if let Some(asset_index_ref) = &metadata.asset_index {
            Self::emit_progress(
                &*progress_cb, version_id, "assets", 0, 1, 0, asset_index_ref.size,
                &format!("{}.json", asset_index_ref.id), Some("Downloading asset index...".to_string())
            );

            let index_file_path = self.paths.asset_index_file(&asset_index_ref.id);
            self.downloader.download_file(
                &asset_index_ref.url,
                &index_file_path,
                Some(&asset_index_ref.sha1),
                Some(asset_index_ref.size),
                |_, _| {}
            ).await.map_err(|e| format!("Asset index download failed: {}", e))?;

            // Parse asset index
            let index_json = fs::read_to_string(&index_file_path)
                .map_err(|e| format!("Failed to read asset index file: {}", e))?;
            let asset_index: AssetIndex = serde_json::from_str(&index_json)
                .map_err(|e| format!("Failed to parse asset index JSON: {}", e))?;

            let mut assets_to_download = Vec::new();
            for (_name, obj) in &asset_index.objects {
                let target = self.paths.asset_object_file(&obj.hash);
                // Only queue if not already on disk with correct sha1
                if !Downloader::verify_file(&target, &obj.hash, Some(obj.size)) {
                    let prefix = if obj.hash.len() >= 2 { &obj.hash[0..2] } else { &obj.hash };
                    let url = format!("{}/{}/{}", MOJANG_RESOURCES_BASE, prefix, obj.hash);
                    assets_to_download.push((url, target, obj.hash.clone(), obj.size));
                }
            }

            let total_assets = assets_to_download.len();
            if total_assets > 0 {
                let total_asset_bytes: u64 = assets_to_download.iter().map(|item| item.3).sum();
                let completed_assets = Arc::new(AtomicUsize::new(0));
                let bytes_assets = Arc::new(AtomicU64::new(0));

                Self::emit_progress(
                    &*progress_cb, version_id, "assets", 0, total_assets, 0, total_asset_bytes,
                    "assets", Some(format!("Downloading {} game assets & sounds...", total_assets))
                );

                let asset_sem = Arc::new(Semaphore::new(16));
                let mut asset_tasks = Vec::new();

                for (url, target, sha1, size) in assets_to_download {
                    let sem = asset_sem.clone();
                    let dl = self.downloader.clone();
                    let p_cb = progress_cb.clone();
                    let ver_id = version_id.to_string();
                    let comp = completed_assets.clone();
                    let b_dl = bytes_assets.clone();
                    let tot_bytes = total_asset_bytes;
                    let tot_count = total_assets;

                    asset_tasks.push(tokio::spawn(async move {
                        let _permit = sem.acquire().await.map_err(|e| e.to_string())?;
                        dl.download_file(&url, &target, Some(&sha1), Some(size), |_, _| {}).await
                            .map_err(|e| format!("Asset download failed for {}: {}", sha1, e))?;

                        let c = comp.fetch_add(1, Ordering::SeqCst) + 1;
                        let b = b_dl.fetch_add(size, Ordering::SeqCst) + size;

                        if c % 30 == 0 || c == tot_count {
                            Self::emit_progress(
                                &*p_cb, &ver_id, "assets", c, tot_count,
                                b, tot_bytes, &sha1, None
                            );
                        }
                        Ok::<(), String>(())
                    }));
                }

                for task in asset_tasks {
                    match task.await {
                        Ok(res) => res?,
                        Err(e) => return Err(format!("Asset task join error: {}", e)),
                    }
                }
            }
        }

        // 6. Complete stage
        Self::emit_progress(
            &*progress_cb, version_id, "complete", 100, 100, 0, 0,
            "complete", Some(format!("Minecraft {} installation complete and verified!", version_id))
        );

        Ok(())
    }

    /// Verifies all files (client jar, libraries, assets) for an installed Minecraft version.
    pub async fn verify_installation(&self, version_id: &str) -> Result<VerificationResult, String> {
        let metadata = self.resolve_metadata(version_id).await
            .map_err(|e| format!("Could not load metadata for verification: {}", e))?;

        let base_id = metadata.inherits_from.as_deref().unwrap_or(version_id);
        let mut total = 0;
        let mut verified = 0;
        let mut missing = 0;
        let mut corrupt = 0;
        let mut details = Vec::new();

        // 1. Check client JAR
        let client_jar = self.paths.version_jar(base_id);
        total += 1;
        if !client_jar.exists() {
            missing += 1;
            details.push(format!("Missing client JAR: {}.jar", base_id));
        } else if let Some(downloads) = &metadata.downloads {
            if let Some(artifact) = &downloads.client {
                if Downloader::verify_file(&client_jar, &artifact.sha1, Some(artifact.size)) {
                    verified += 1;
                } else {
                    corrupt += 1;
                    details.push(format!("Corrupt client JAR: {}.jar", base_id));
                }
            } else {
                verified += 1;
            }
        } else {
            verified += 1;
        }

        // 2. Check libraries
        for lib in &metadata.libraries {
            if !Self::is_library_allowed_on_windows(lib) {
                continue;
            }

            if let Some(downloads) = &lib.downloads {
                if let Some(artifact) = &downloads.artifact {
                    if let Some(rel) = &artifact.path {
                        total += 1;
                        let lib_path = self.paths.libraries_dir().join(rel);
                        if !lib_path.exists() {
                            missing += 1;
                            details.push(format!("Missing library: {}", rel));
                        } else if Downloader::verify_file(&lib_path, &artifact.sha1, Some(artifact.size)) {
                            verified += 1;
                        } else {
                            corrupt += 1;
                            details.push(format!("Corrupt library: {}", rel));
                        }
                    }
                }
            } else if let Some((rel, _)) = maven_to_path(&lib.name) {
                total += 1;
                let lib_path = self.paths.libraries_dir().join(&rel);
                if !lib_path.exists() {
                    missing += 1;
                    details.push(format!("Missing library: {}", rel));
                } else {
                    verified += 1;
                }
            }
        }

        // 3. Check asset index & sample assets
        if let Some(asset_ref) = &metadata.asset_index {
            total += 1;
            let index_path = self.paths.asset_index_file(&asset_ref.id);
            if !index_path.exists() {
                missing += 1;
                details.push(format!("Missing asset index: {}.json", asset_ref.id));
            } else if Downloader::verify_file(&index_path, &asset_ref.sha1, Some(asset_ref.size)) {
                verified += 1;
                // Spot-check objects
                if let Ok(content) = fs::read_to_string(&index_path) {
                    if let Ok(idx) = serde_json::from_str::<AssetIndex>(&content) {
                        for (_name, obj) in &idx.objects {
                            total += 1;
                            let obj_path = self.paths.asset_object_file(&obj.hash);
                            if !obj_path.exists() {
                                missing += 1;
                            } else if Downloader::verify_file(&obj_path, &obj.hash, Some(obj.size)) {
                                verified += 1;
                            } else {
                                corrupt += 1;
                            }
                        }
                    }
                }
            } else {
                corrupt += 1;
                details.push(format!("Corrupt asset index: {}.json", asset_ref.id));
            }
        }

        let is_valid = missing == 0 && corrupt == 0;
        Ok(VerificationResult {
            total_files: total,
            verified_files: verified,
            missing_files: missing,
            corrupt_files: corrupt,
            is_valid,
            details,
        })
    }

    /// Repairs installation by re-running the installation pipeline which only downloads missing/corrupt files.
    pub async fn repair_installation<F>(&self, version_id: &str, on_progress: F) -> Result<(), String>
    where
        F: Fn(InstallProgress) + Send + Sync + 'static,
    {
        self.install_version(version_id, on_progress).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_real_version_installation() {
        let temp_dir = std::env::temp_dir().join("volume_test_mc_install");
        let paths = MinecraftPaths::new(temp_dir.clone());
        let installer = Installer::new(paths.clone());

        let test_version = "1.12.2";
        let result = installer.install_version(test_version, |p| {
            if let Some(msg) = p.message {
                println!("[PROGRESS] {} - {}", p.stage, msg);
            }
        }).await;
        assert!(result.is_ok(), "Installation failed: {:?}", result.err());

        // Verify files on disk
        let client_jar = paths.version_jar(test_version);
        assert!(client_jar.exists(), "Client JAR must exist");
        assert!(client_jar.metadata().unwrap().len() > 8_000_000, "Client JAR must be > 8MB");

        let client_json = paths.version_json(test_version);
        assert!(client_json.exists(), "Version JSON must exist");

        println!("Successfully installed and verified Minecraft {}!", test_version);
    }
}
