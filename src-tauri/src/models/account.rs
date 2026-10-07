use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct OfflineAccount {
    pub id: String,
    pub username: String,
    pub uuid: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played_at: Option<String>,
    #[serde(default = "default_avatar_type")]
    pub avatar_type: String, // "default", "custom", "minecraft_skin"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skin_path: Option<String>,
    #[serde(default = "default_skin_model")]
    pub skin_model: Option<String>, // "classic" | "slim"
    #[serde(default = "default_profile_icon")]
    pub profile_icon: Option<String>, // "moon", "star", "sun", "flame", "leaf", "sword"
}

impl Default for OfflineAccount {
    fn default() -> Self {
        Self {
            id: String::new(),
            username: "DevExplorer".to_string(),
            uuid: String::new(),
            created_at: String::new(),
            last_played_at: None,
            avatar_type: default_avatar_type(),
            avatar_path: None,
            avatar_updated_at: None,
            skin_path: None,
            skin_model: default_skin_model(),
            profile_icon: default_profile_icon(),
        }
    }
}

pub fn default_avatar_type() -> String {
    "default".to_string()
}

pub fn default_skin_model() -> Option<String> {
    Some("classic".to_string())
}

pub fn default_profile_icon() -> Option<String> {
    Some("moon".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AccountsConfig {
    pub accounts: Vec<OfflineAccount>,
    pub selected_account_id: String,
}

impl Default for AccountsConfig {
    fn default() -> Self {
        let default_account = OfflineAccount::new("DevExplorer");
        Self {
            selected_account_id: default_account.id.clone(),
            accounts: vec![default_account],
        }
    }
}

impl OfflineAccount {
    pub fn new(username: &str) -> Self {
        let uuid = generate_offline_uuid(username);
        let id = format!("offline-{}", uuid);
        let created_at = current_iso_timestamp();
        Self {
            id,
            username: username.to_string(),
            uuid,
            created_at,
            last_played_at: None,
            avatar_type: default_avatar_type(),
            avatar_path: None,
            avatar_updated_at: None,
            skin_path: None,
            skin_model: default_skin_model(),
            profile_icon: default_profile_icon(),
        }
    }
}

/// Generates a standard Minecraft offline player UUID:
/// In Java: UUID.nameUUIDFromBytes(("OfflinePlayer:" + username).getBytes(StandardCharsets.UTF_8))
/// This is a Type 3 (MD5-based) UUID with IETF RFC 4122 variant.
pub fn generate_offline_uuid(username: &str) -> String {
    let source = format!("OfflinePlayer:{}", username);
    let digest = md5::compute(source.as_bytes());
    let mut bytes = digest.0;

    // Set UUID version to 3 (name-based MD5) on byte 6: 0011xxxx
    bytes[6] = (bytes[6] & 0x0f) | 0x30;

    // Set UUID variant to IETF RFC 4122 (variant 2) on byte 8: 10xxxxxx
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3],
        bytes[4], bytes[5],
        bytes[6], bytes[7],
        bytes[8], bytes[9],
        bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Validates standard Minecraft offline username rules:
/// - 3 to 16 characters
/// - Alphanumeric and underscore only
/// - No spaces or control characters
pub fn validate_username(username: &str) -> Result<(), String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Err("Username is required.".to_string());
    }

    if trimmed.len() != username.len() {
        return Err("Username cannot begin or end with whitespace.".to_string());
    }

    if username.len() < 3 || username.len() > 16 {
        return Err("Username must be between 3 and 16 characters long.".to_string());
    }

    for c in username.chars() {
        if !c.is_ascii_alphanumeric() && c != '_' {
            return Err("Username may only contain letters, numbers, and underscores.".to_string());
        }
    }

    Ok(())
}

pub fn current_iso_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let total_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let sec = total_secs % 60;
    let total_mins = total_secs / 60;
    let min = total_mins % 60;
    let total_hours = total_mins / 60;
    let hour = total_hours % 24;
    let total_days = total_hours / 24;

    // Convert days since Jan 1 1970 to Year-Month-Day
    let mut days = total_days as i64;
    let mut year = 1970;
    loop {
        let leap = is_leap_year(year);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }

    let leap = is_leap_year(year);
    let days_in_months = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30,
        31, 31, 30, 31, 30, 31,
    ];

    let mut month = 1;
    for &dim in &days_in_months {
        if days < dim {
            break;
        }
        days -= dim;
        month += 1;
    }
    let day = days + 1;

    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hour, min, sec)
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offline_uuid_deterministic() {
        let u1 = generate_offline_uuid("DevExplorer");
        let u2 = generate_offline_uuid("DevExplorer");
        assert_eq!(u1, u2, "Same username must produce the identical UUID");

        let u3 = generate_offline_uuid("Rudra");
        assert_ne!(u1, u3, "Different usernames must produce different UUIDs");

        // Verify standard UUID formatting (8-4-4-4-12 = 36 chars)
        assert_eq!(u1.len(), 36);
        assert_eq!(u1.chars().filter(|&c| c == '-').count(), 4);

        // Version 3 character is at index 14
        assert_eq!(u1.chars().nth(14), Some('3'));

        // Variant character is at index 19 (should be 8, 9, a, or b)
        let variant_char = u1.chars().nth(19).unwrap();
        assert!(
            variant_char == '8' || variant_char == '9' || variant_char == 'a' || variant_char == 'b',
            "Variant character must match RFC 4122"
        );
    }

    #[test]
    fn test_username_validation() {
        assert!(validate_username("DevExplorer").is_ok());
        assert!(validate_username("Rudra").is_ok());
        assert!(validate_username("Steve_123").is_ok());
        assert!(validate_username("Explorer42").is_ok());

        // Too short (< 3)
        assert!(validate_username("ab").is_err());
        assert!(validate_username("").is_err());

        // Too long (> 16)
        assert!(validate_username("VeryLongUsername123456").is_err());

        // Invalid characters
        assert!(validate_username("player name").is_err());
        assert!(validate_username("player-name").is_err());
        assert!(validate_username("name!").is_err());
        assert!(validate_username("name@home").is_err());
        assert!(validate_username(" DevExplorer ").is_err());
    }
}
