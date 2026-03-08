use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use rand::Rng;

pub fn generate_folder_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill(&mut key);
    key
}

pub fn derive_kek_from_password(password: &str) -> (Vec<u8>, String) {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt).unwrap();
    let hash_bytes = hash.hash.unwrap().as_bytes().to_vec();
    (hash_bytes, salt.to_string())
}

pub fn derive_kek_from_password_and_salt(password: &str, salt_str: &str) -> Vec<u8> {
    let salt = SaltString::from_b64(salt_str).unwrap();
    let argon2 = Argon2::default();
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
