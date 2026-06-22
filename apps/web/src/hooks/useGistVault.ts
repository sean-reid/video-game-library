import { useCallback, useState } from 'react';
import { decryptSecret, encryptSecret } from '../services/cryptoStorage.js';
import { clearGistConfig, loadGistConfig, saveGistConfig } from '../services/gistApi.js';
import type { StoredGistConfig, UnlockedGistConfig } from '../types/index.js';

export interface ConnectArgs {
  token: string;
  passphrase: string;
  gistId: string;
  gistUrl?: string;
}

export interface UseGistVaultResult {
  stored: StoredGistConfig | null;
  unlocked: UnlockedGistConfig | null;
  isLocked: boolean;
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  connect: (args: ConnectArgs) => Promise<void>;
  disconnect: () => void;
  touchSyncedAt: () => void;
}

// Owns the persisted (encrypted) Gist config plus the in-memory (decrypted)
// token. Auto-sync gates on `unlocked` so a locked session writes nothing.
export function useGistVault(): UseGistVaultResult {
  const [stored, setStored] = useState<StoredGistConfig | null>(loadGistConfig);
  const [unlocked, setUnlocked] = useState<UnlockedGistConfig | null>(null);

  const unlock = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!stored) return false;
      const token = await decryptSecret(stored.encrypted, passphrase);
      if (token == null) return false;
      const next: UnlockedGistConfig = {
        token,
        gistId: stored.gistId,
        ...(stored.gistUrl != null ? { gistUrl: stored.gistUrl } : {}),
        ...(stored.lastSyncedAt != null ? { lastSyncedAt: stored.lastSyncedAt } : {}),
      };
      setUnlocked(next);
      return true;
    },
    [stored],
  );

  const lock = useCallback(() => {
    setUnlocked(null);
  }, []);

  const connect = useCallback(async (args: ConnectArgs): Promise<void> => {
    const encrypted = await encryptSecret(args.token, args.passphrase);
    const now = Date.now();
    const next: StoredGistConfig = {
      version: 2,
      encrypted,
      gistId: args.gistId,
      ...(args.gistUrl != null ? { gistUrl: args.gistUrl } : {}),
      lastSyncedAt: now,
    };
    saveGistConfig(next);
    setStored(next);
    setUnlocked({
      token: args.token,
      gistId: args.gistId,
      ...(args.gistUrl != null ? { gistUrl: args.gistUrl } : {}),
      lastSyncedAt: now,
    });
  }, []);

  const disconnect = useCallback(() => {
    clearGistConfig();
    setStored(null);
    setUnlocked(null);
  }, []);

  const touchSyncedAt = useCallback(() => {
    const now = Date.now();
    setStored((prev) => {
      if (!prev) return prev;
      const next: StoredGistConfig = { ...prev, lastSyncedAt: now };
      saveGistConfig(next);
      return next;
    });
    setUnlocked((prev) => (prev ? { ...prev, lastSyncedAt: now } : prev));
  }, []);

  return {
    stored,
    unlocked,
    isLocked: stored != null && unlocked == null,
    unlock,
    lock,
    connect,
    disconnect,
    touchSyncedAt,
  };
}
