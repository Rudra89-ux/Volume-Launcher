use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use crate::models::JavaInfo;

pub struct JavaDetector;

impl JavaDetector {
    /// Discovers all available Java runtimes on the system.
    pub fn get_available_javas() -> Vec<JavaInfo> {
        let mut candidates = Vec::new();

        // 1. Check JAVA_HOME
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let p = PathBuf::from(java_home);
            candidates.push(p.join("bin").join("javaw.exe"));
            candidates.push(p.join("bin").join("java.exe"));
        }

        // 2. Check PATH
        if let Ok(path_var) = std::env::var("PATH") {
            for entry in std::env::split_paths(&path_var) {
                candidates.push(entry.join("javaw.exe"));
                candidates.push(entry.join("java.exe"));
            }
        }

        // 3. Check Program Files Java locations
        let program_files = std::env::var("ProgramFiles").unwrap_or_else(|_| r#"C:\Program Files"#.to_string());
        let pf_dirs = [
            format!(r#"{}\Java"#, program_files),
            format!(r#"{}\Eclipse Adoptium"#, program_files),
            format!(r#"{}\Microsoft"#, program_files),
            format!(r#"{}\BellSoft"#, program_files),
            format!(r#"{}\Amazon Corretto"#, program_files),
            format!(r#"{}\Zulu"#, program_files),
            format!(r#"{}\Semeru"#, program_files),
        ];

        for base_dir in &pf_dirs {
            let p = Path::new(base_dir);
            if p.exists() && p.is_dir() {
                if let Ok(entries) = fs::read_dir(p) {
                    for entry in entries.flatten() {
                        let sub = entry.path();
                        if sub.is_dir() {
                            candidates.push(sub.join("bin").join("javaw.exe"));
                            candidates.push(sub.join("bin").join("java.exe"));
                        }
                    }
                }
            }
        }

        // 4. Check user profile locations (e.g. Lunar Client JREs, Minecraft runtime caches)
        if let Some(user_dir) = dirs::home_dir() {
            let lunar_jre = user_dir.join(".lunarclient").join("jre");
            if lunar_jre.exists() && lunar_jre.is_dir() {
                if let Ok(entries) = fs::read_dir(&lunar_jre) {
                    for entry in entries.flatten() {
                        let hash_dir = entry.path();
                        if hash_dir.is_dir() {
                            if let Ok(sub_entries) = fs::read_dir(&hash_dir) {
                                for sub in sub_entries.flatten() {
                                    let jre_dir = sub.path();
                                    candidates.push(jre_dir.join("bin").join("javaw.exe"));
                                    candidates.push(jre_dir.join("bin").join("java.exe"));
                                }
                            }
                        }
                    }
                }
            }

            // Official Minecraft Launcher runtime cache if present
            let mc_runtime = user_dir.join("AppData").join("Local").join("Packages")
                .join("Microsoft.4297127D64EC6_8wekyb3d8bbwe").join("LocalCache").join("Local").join("runtime");
            if mc_runtime.exists() && mc_runtime.is_dir() {
                if let Ok(entries) = fs::read_dir(&mc_runtime) {
                    for entry in entries.flatten() {
                        let comp_dir = entry.path();
                        candidates.push(comp_dir.join("windows-x64").join("bin").join("javaw.exe"));
                        candidates.push(comp_dir.join("windows-x64").join("bin").join("java.exe"));
                    }
                }
            }
        }

        // Deduplicate and probe candidates
        let mut results = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        for candidate in candidates {
            if candidate.exists() && candidate.is_file() {
                let canonical = candidate.canonicalize().unwrap_or(candidate);
                let path_str = canonical.to_string_lossy().to_string();

                if seen_paths.insert(path_str.clone()) {
                    if let Some(info) = Self::probe_java(&canonical) {
                        results.push(info);
                    }
                }
            }
        }

        // Sort by major version descending
        results.sort_by(|a, b| b.major_version.cmp(&a.major_version));
        results
    }

    /// Tests a specific Java executable by running `-version` and parsing the output.
    pub fn probe_java<P: AsRef<Path>>(java_path: P) -> Option<JavaInfo> {
        let p = java_path.as_ref();
        let output = Command::new(p)
            .arg("-version")
            .output()
            .ok()?;

        // Java outputs version information to stderr
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let combined = format!("{}\n{}", stderr, stdout);

        let (version_str, major) = Self::parse_version(&combined)?;

        Some(JavaInfo {
            path: p.to_string_lossy().to_string(),
            version: version_str,
            major_version: major,
            is_valid: true,
        })
    }

    /// Parses the version string and extracts the major version.
    fn parse_version(raw: &str) -> Option<(String, u32)> {
        // Look for `version "..."` or `build "..."`
        for line in raw.lines() {
            if line.contains("version \"") || line.contains("build ") {
                if let Some(start) = line.find('"') {
                    if let Some(end) = line[start + 1..].find('"') {
                        let v_str = &line[start + 1..start + 1 + end];
                        let major = Self::extract_major_version(v_str);
                        return Some((v_str.to_string(), major));
                    }
                }
            }
        }
        None
    }

    fn extract_major_version(v_str: &str) -> u32 {
        if v_str.starts_with("1.") {
            // Legacy Java 1.8 -> 8, 1.7 -> 7
            let parts: Vec<&str> = v_str.split('.').collect();
            if parts.len() > 1 {
                if let Ok(m) = parts[1].parse::<u32>() {
                    return m;
                }
            }
            8
        } else {
            // Modern Java: "21.0.4", "17.0.2", "25-ea"
            let first_segment = v_str.split(['.', '-', '+']).next().unwrap_or("0");
            first_segment.parse::<u32>().unwrap_or(21)
        }
    }

    /// Detects a Java installation meeting the required major version.
    pub fn detect_java(required_major: Option<u32>, custom_path: Option<&str>) -> Result<JavaInfo, String> {
        // 1. Check custom path if provided
        if let Some(custom) = custom_path {
            if !custom.trim().is_empty() {
                let p = Path::new(custom);
                if p.exists() {
                    if let Some(info) = Self::probe_java(p) {
                        if let Some(req) = required_major {
                            if info.major_version == req {
                                return Ok(info);
                            }
                        } else {
                            return Ok(info);
                        }
                    }
                }
            }
        }

        let all = Self::get_available_javas();

        // 2. Prioritize exact major version match (e.g. Java 21 for 1.20.5+)
        if let Some(req) = required_major {
            if let Some(found) = all.iter().find(|j| j.major_version == req) {
                return Ok(found.clone());
            }
        }

        // 3. Fallback to custom path if >= required
        if let Some(custom) = custom_path {
            if !custom.trim().is_empty() {
                let p = Path::new(custom);
                if p.exists() {
                    if let Some(info) = Self::probe_java(p) {
                        if let Some(req) = required_major {
                            if info.major_version >= req {
                                return Ok(info);
                            }
                        }
                    }
                }
            }
        }

        if all.is_empty() {
            return Err("No Java installations detected on the system. Please install Java 21 LTS or specify the Java path in Settings.".to_string());
        }

        if let Some(req) = required_major {
            if let Some(found) = all.iter().find(|j| j.major_version >= req) {
                return Ok(found.clone());
            }
            return Err(format!(
                "Minecraft requires Java {}, but detected version is Java {}. Please install Java {}.",
                req, all[0].major_version, req
            ));
        }

        Ok(all[0].clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_java_detection() {
        let javas = JavaDetector::get_available_javas();
        println!("Detected {} Java runtimes:", javas.len());
        for j in &javas {
            println!("  Found Java {} at {}", j.major_version, j.path);
        }
        assert!(!javas.is_empty(), "Expected to detect at least one Java installation");
    }
}
