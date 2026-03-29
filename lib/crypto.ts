/**
 * End-to-End Encryption Helpers for RafQR (Web Crypto API)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LEN = 256;
const ITERATIONS = 100000;

const getEncoder = () => new TextEncoder();

/**
 * Derive a crypto key from a password and salt
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = getEncoder();
  const passwordBuffer = enc.encode(password);
  
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary data (File/Blob/String)
 */
export async function encryptData(data: Blob | string, password: string): Promise<Blob> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const buffer = typeof data === 'string' 
    ? getEncoder().encode(data) 
    : await data.arrayBuffer();

  const encryptedContent = await window.crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    buffer
  );

  return new Blob([salt, iv, new Uint8Array(encryptedContent)]);
}

/**
 * Decrypt packaged data back to original
 */
export async function decryptData(blob: Blob, password: string): Promise<Blob | string> {
  const buffer = await blob.arrayBuffer();
  // Ensure we are working with Uint8Array safely
  const salt = new Uint8Array(buffer.slice(0, 16));
  const iv = new Uint8Array(buffer.slice(16, 28));
  const encryptedContent = buffer.slice(28);

  const key = await deriveKey(password, salt);

  try {
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      encryptedContent
    );
    
    return new Blob([new Uint8Array(decryptedContent)]);
  } catch (err) {
    throw new Error('Gagal mendekripsi data. Password mungkin salah.');
  }
}
