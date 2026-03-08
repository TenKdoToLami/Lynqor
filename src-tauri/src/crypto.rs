use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2, Params,
};
use rand::Rng;

const ARGON2_M_COST: u32 = 256 * 1024; // 256 MB of RAM
const ARGON2_T_COST: u32 = 4; // 4 iterations
const ARGON2_P_COST: u32 = 2; // 2 parallel threads

fn build_argon2() -> Argon2<'static> {
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(32))
        .expect("Invalid Argon2 params");
    Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params)
}

pub fn generate_folder_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill(&mut key);
    key
}

pub fn derive_kek_from_password(password: &str) -> (Vec<u8>, String) {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = build_argon2();
    let hash = argon2.hash_password(password.as_bytes(), &salt).unwrap();
    let hash_bytes = hash.hash.unwrap().as_bytes().to_vec();
    (hash_bytes, salt.to_string())
}

pub fn derive_kek_from_password_and_salt(password: &str, salt_str: &str) -> Vec<u8> {
    let salt = SaltString::from_b64(salt_str).unwrap();
    let argon2 = build_argon2();
    let hash = argon2.hash_password(password.as_bytes(), &salt).unwrap();
    hash.hash.unwrap().as_bytes().to_vec()
}

pub fn encrypt_aes_gcm(key: &[u8], plaintext: &[u8]) -> Vec<u8> {
    let cipher = Aes256Gcm::new(key.into());
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut ciphertext = cipher
        .encrypt(nonce, plaintext)
        .expect("encryption failure!");
    let mut result = nonce_bytes.to_vec();
    result.append(&mut ciphertext);
    result
}

pub fn decrypt_aes_gcm(key: &[u8], encrypted_data: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted_data.len() < 12 {
        return Err("Data too short".into());
    }
    let (nonce_bytes, ciphertext) = encrypted_data.split_at(12);
    let cipher = Aes256Gcm::new(key.into());
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())
}

/// Pad data to the nearest power-of-2 size (minimum 4 KB).
/// Format: [4-byte little-endian real length][original data][random padding]
pub fn pad_to_power_of_2(data: &[u8]) -> Vec<u8> {
    let real_len = data.len();
    let total_needed = real_len + 4; // 4 bytes for the length prefix
    let min_size = 4096; // minimum 4 KB
    let mut target = min_size;
    while target < total_needed {
        target *= 2;
    }

    let mut padded = Vec::with_capacity(target);
    padded.extend_from_slice(&(real_len as u32).to_le_bytes());
    padded.extend_from_slice(data);

    // Fill remaining space with random bytes
    let padding_len = target - padded.len();
    let mut padding = vec![0u8; padding_len];
    rand::thread_rng().fill(&mut padding[..]);
    padded.extend_from_slice(&padding);

    padded
}

/// Remove padding and extract the original data.
pub fn unpad_from_power_of_2(padded: &[u8]) -> Result<Vec<u8>, String> {
    if padded.len() < 4 {
        return Err("Padded data too short".into());
    }
    let real_len = u32::from_le_bytes([padded[0], padded[1], padded[2], padded[3]]) as usize;
    if 4 + real_len > padded.len() {
        return Err("Invalid padded data length".into());
    }
    Ok(padded[4..4 + real_len].to_vec())
}
