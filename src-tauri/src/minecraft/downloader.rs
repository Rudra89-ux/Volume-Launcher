use std::path::{Path, PathBuf};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::time::Duration;
use reqwest::Client;
use futures_util::StreamExt;
use sha1::{Sha1, Digest};

#[derive(Clone)]
pub struct Downloader {
    client: Client,
    max_retries: u32,
}

impl Downloader {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(45))
            .connect_timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            max_retries: 3,
        }
    }

    /// Verifies if a file exists and matches the expected SHA-1 hash and optionally size.
    pub fn verify_file<P: AsRef<Path>>(path: P, expected_sha1: &str, expected_size: Option<u64>) -> bool {
        let p = path.as_ref();
        if !p.exists() {
            return false;
        }

        if let Some(expected_sz) = expected_size {
            if let Ok(meta) = fs::metadata(p) {
                if meta.len() != expected_sz {
                    return false;
                }
            } else {
                return false;
            }
        }

        if expected_sha1.is_empty() {
            return true;
        }

        let mut file = match File::open(p) {
            Ok(f) => f,
            Err(_) => return false,
        };

        let mut hasher = Sha1::new();
        let mut buffer = [0u8; 8192];

        loop {
            match file.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => hasher.update(&buffer[..n]),
                Err(_) => return false,
            }
        }

        let hash_result = hex::encode(hasher.finalize());
        hash_result.eq_ignore_ascii_case(expected_sha1)
    }

    /// Downloads a file with streaming, retries, SHA-1 verification, and atomic rename.
    /// If the target file already exists and passes SHA-1 verification, it is skipped.
    pub async fn download_file<P: AsRef<Path>, F>(
        &self,
        url: &str,
        target_path: P,
        expected_sha1: Option<&str>,
        expected_size: Option<u64>,
        mut on_progress: F,
    ) -> Result<bool, String>
    where
        F: FnMut(u64, u64) + Send,
    {
        let target = target_path.as_ref();

        // 1. Existing-file detection: skip if already verified
        if let Some(sha1) = expected_sha1 {
            if Self::verify_file(target, sha1, expected_size) {
                if let Some(sz) = expected_size {
                    on_progress(sz, sz);
                }
                return Ok(true); // already exists & verified
            }
        }

        // Ensure parent directory exists
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        // Temporary download path: <target>.download
        let temp_path: PathBuf = target.with_extension(format!("{}.download", target.extension().and_then(|s| s.to_str()).unwrap_or("tmp")));

        let mut last_error = String::from("Unknown download error");

        for attempt in 1..=self.max_retries {
            // Remove any stale temp file before download attempt
            if temp_path.exists() {
                let _ = fs::remove_file(&temp_path);
            }

            match self.execute_streaming_download(url, &temp_path, expected_size, &mut on_progress).await {
                Ok(bytes_written) => {
                    // Check size if specified
                    if let Some(expected_sz) = expected_size {
                        if bytes_written != expected_sz {
                            let _ = fs::remove_file(&temp_path);
                            last_error = format!("File size mismatch: got {}, expected {}", bytes_written, expected_sz);
                            tokio::time::sleep(Duration::from_millis(500 * attempt as u64)).await;
                            continue;
                        }
                    }

                    // Check SHA-1 if specified
                    if let Some(sha1) = expected_sha1 {
                        if !Self::verify_file(&temp_path, sha1, None) {
                            let _ = fs::remove_file(&temp_path);
                            last_error = format!("SHA-1 verification failed for {}", url);
                            tokio::time::sleep(Duration::from_millis(500 * attempt as u64)).await;
                            continue;
                        }
                    }

                    // Atomic move / rename from temp to target
                    if target.exists() {
                        let _ = fs::remove_file(target);
                    }

                    if let Err(e) = fs::rename(&temp_path, target) {
                        // Fallback to copy and remove if cross-device link error
                        if let Err(copy_err) = fs::copy(&temp_path, target) {
                            let _ = fs::remove_file(&temp_path);
                            return Err(format!("Atomic move failed: {} (copy error: {})", e, copy_err));
                        }
                        let _ = fs::remove_file(&temp_path);
                    }

                    return Ok(false); // newly downloaded
                }
                Err(err) => {
                    last_error = err;
                    if temp_path.exists() {
                        let _ = fs::remove_file(&temp_path);
                    }
                    tokio::time::sleep(Duration::from_millis(600 * attempt as u64)).await;
                }
            }
        }

        Err(format!("Download failed after {} retries for {}: {}", self.max_retries, url, last_error))
    }

    async fn execute_streaming_download<F>(
        &self,
        url: &str,
        temp_path: &Path,
        expected_size: Option<u64>,
        on_progress: &mut F,
    ) -> Result<u64, String>
    where
        F: FnMut(u64, u64) + Send,
    {
        let res = self.client.get(url)
            .send()
            .await
            .map_err(|e| format!("HTTP request error for {}: {}", url, e))?;

        if !res.status().is_success() {
            return Err(format!("HTTP status {}: {}", res.status(), url));
        }

        let total_size = res.content_length().or(expected_size).unwrap_or(0);

        let mut file = File::create(temp_path)
            .map_err(|e| format!("Failed to create temporary file {}: {}", temp_path.display(), e))?;

        let mut stream = res.bytes_stream();
        let mut downloaded_bytes: u64 = 0;

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Error while streaming chunk: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Error writing chunk to file: {}", e))?;
            downloaded_bytes += chunk.len() as u64;
            on_progress(downloaded_bytes, total_size);
        }

        file.flush().map_err(|e| format!("Error flushing file: {}", e))?;
        Ok(downloaded_bytes)
    }

    /// Fetches JSON directly from a URL.
    pub async fn fetch_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T, String> {
        let res = self.client.get(url)
            .send()
            .await
            .map_err(|e| format!("Failed to request JSON from {}: {}", url, e))?;

        if !res.status().is_success() {
            return Err(format!("HTTP {} fetching {}", res.status(), url));
        }

        res.json::<T>()
            .await
            .map_err(|e| format!("Failed to parse JSON from {}: {}", url, e))
    }
}
