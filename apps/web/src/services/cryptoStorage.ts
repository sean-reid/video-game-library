import type { EncryptedBlob } from '../types/index.js';

// Passphrase-derived AES-GCM, scoped to encrypting small secrets (the Gist
// PAT) before they land in localStorage. PBKDF2 cost is tuned high enough
// that brute-forcing a leaked blob is meaningfully expensive while still
// finishing under ~200ms on a modern phone.
const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH = 256;

function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const byte of view) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): ArrayBuffer {
  const out = new Uint8Array(new ArrayBuffer(n));
  crypto.getRandomValues(out);
  return out.buffer;
}

function bytesFromB64(s: string): ArrayBuffer {
  const decoded = b64decode(s);
  const out = new Uint8Array(new ArrayBuffer(decoded.length));
  out.set(decoded);
  return out.buffer;
}

async function deriveKey(passphrase: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptSecret(
  plaintext: string,
  passphrase: string,
): Promise<EncryptedBlob> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const data = enc.encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    ciphertext: b64encode(ciphertext),
    salt: b64encode(salt),
    iv: b64encode(iv),
  };
}

// Returns null when the passphrase is wrong (decryption throws). Callers
// surface this as "wrong passphrase" rather than letting the AES-GCM tag
// failure leak as a generic error.
export async function decryptSecret(
  blob: EncryptedBlob,
  passphrase: string,
): Promise<string | null> {
  try {
    const salt = bytesFromB64(blob.salt);
    const iv = bytesFromB64(blob.iv);
    const ciphertext = bytesFromB64(blob.ciphertext);
    const key = await deriveKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
