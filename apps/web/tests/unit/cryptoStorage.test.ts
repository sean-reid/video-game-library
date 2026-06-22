import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../../src/services/cryptoStorage.js';

describe('cryptoStorage', () => {
  it('roundtrips a secret through encrypt/decrypt with the same passphrase', async () => {
    const blob = await encryptSecret('github_pat_secretvalue', 'correct horse battery staple');
    const recovered = await decryptSecret(blob, 'correct horse battery staple');
    expect(recovered).toBe('github_pat_secretvalue');
  });

  it('returns null when the passphrase is wrong', async () => {
    const blob = await encryptSecret('github_pat_secretvalue', 'correct horse battery staple');
    const recovered = await decryptSecret(blob, 'wrong passphrase');
    expect(recovered).toBeNull();
  });

  it('produces distinct ciphertexts for the same plaintext (random salt + iv)', async () => {
    const a = await encryptSecret('same plaintext', 'same passphrase');
    const b = await encryptSecret('same plaintext', 'same passphrase');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  });
});
