import { useEffect, useState } from 'react';
import type { UseGistVaultResult } from '../../hooks/useGistVault.js';
import { createGist, fetchGistLibrary, updateGist } from '../../services/gistApi.js';
import type { Game } from '../../types/index.js';
import { timeAgo } from '../../utils/dateUtils.js';
import { Icon } from '../common/Icon.js';
import { Sheet } from './Sheet.js';

type ConnectMode = 'new' | 'existing';
type BusyAction = '' | 'setup' | 'connect' | 'sync' | 'restore' | 'unlock';

interface BackupSheetProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  games: Game[];
  setGames: (games: Game[]) => void;
  vault: UseGistVaultResult;
  hadLegacyConfig: boolean;
}

export function BackupSheet({
  open,
  onClose,
  onExport,
  onImport,
  games,
  setGames,
  vault,
  hadLegacyConfig,
}: BackupSheetProps) {
  const { stored, unlocked, isLocked, unlock, lock, connect, disconnect, touchSyncedAt } =
    vault;
  const [tokenInput, setTokenInput] = useState('');
  const [passphraseInput, setPassphraseInput] = useState('');
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [gistIdInput, setGistIdInput] = useState('');
  const [connectMode, setConnectMode] = useState<ConnectMode>('new');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
      setTokenInput('');
      setGistIdInput('');
      setPassphraseInput('');
      setUnlockPassphrase('');
      setConnectMode('new');
    }
  }, [open]);

  const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const setupGist = async (): Promise<void> => {
    const token = tokenInput.trim();
    const passphrase = passphraseInput;
    if (!token || passphrase.length < 8) return;
    setBusy(true);
    setBusyAction('setup');
    setError(null);
    setSuccess(null);
    try {
      const gist = await createGist(token, games);
      await connect({
        token,
        passphrase,
        gistId: gist.id,
        ...(gist.html_url != null ? { gistUrl: gist.html_url } : {}),
      });
      setTokenInput('');
      setPassphraseInput('');
      setSuccess('Connected! Your library is backed up and the token is encrypted.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const connectExisting = async (): Promise<void> => {
    const token = tokenInput.trim();
    const id = gistIdInput.trim();
    const passphrase = passphraseInput;
    if (!token || !id || passphrase.length < 8) return;
    if (
      !window.confirm(
        `Replace your local library with the version stored in Gist ${id.slice(0, 8)}…? Your current local data will be lost (export first if you want a safety copy).`,
      )
    ) {
      return;
    }
    setBusy(true);
    setBusyAction('connect');
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchGistLibrary(token, id);
      setGames(data);
      await connect({
        token,
        passphrase,
        gistId: id,
        gistUrl: `https://gist.github.com/${id}`,
      });
      setTokenInput('');
      setGistIdInput('');
      setPassphraseInput('');
      setSuccess(`Connected and restored ${String(data.length)} games.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const handleUnlock = async (): Promise<void> => {
    if (!unlockPassphrase) return;
    setBusy(true);
    setBusyAction('unlock');
    setError(null);
    setSuccess(null);
    const ok = await unlock(unlockPassphrase);
    if (ok) {
      setUnlockPassphrase('');
      setSuccess('Unlocked. Sync will resume.');
    } else {
      setError('Wrong passphrase.');
    }
    setBusy(false);
    setBusyAction('');
  };

  const syncNow = async (): Promise<void> => {
    if (!unlocked) return;
    setBusy(true);
    setBusyAction('sync');
    setError(null);
    setSuccess(null);
    try {
      await updateGist(unlocked.token, unlocked.gistId, games);
      touchSyncedAt();
      setSuccess('Synced.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const restore = async (): Promise<void> => {
    if (!unlocked) return;
    if (
      !window.confirm(
        'Replace your local library with the version stored in your Gist? Your current local data will be lost (export first if you want a safety copy).',
      )
    ) {
      return;
    }
    setBusy(true);
    setBusyAction('restore');
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchGistLibrary(unlocked.token, unlocked.gistId);
      setGames(data);
      touchSyncedAt();
      setSuccess(`Restored ${String(data.length)} games.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const handleDisconnect = (): void => {
    if (
      !window.confirm(
        'Disconnect Gist sync? Your Gist will remain on GitHub but the app will stop syncing to it. You can reconnect anytime.',
      )
    ) {
      return;
    }
    disconnect();
    setSuccess('Disconnected.');
  };

  const handleExport = (): void => {
    onExport();
    onClose();
  };
  const handleImport = (): void => {
    onImport();
    onClose();
  };

  const setupDisabled = busy || !tokenInput.trim() || passphraseInput.length < 8;
  const connectDisabled =
    busy || !tokenInput.trim() || !gistIdInput.trim() || passphraseInput.length < 8;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Backup & data"
      leftAction={
        <button type="button" onClick={onClose} className="text-zinc-400 text-[14px]">
          Close
        </button>
      }
    >
      <div className="px-4 py-6 space-y-3">
        {hadLegacyConfig && !stored && (
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-[12px] text-amber-200 leading-relaxed">
            Your previous backup used a cleartext token. Reconnect below to encrypt it
            at rest with a passphrase.
          </div>
        )}

        {stored ? (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-[18px] mt-0.5">☁️</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="serif text-[16px] text-white">GitHub Gist sync</div>
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      isLocked ? 'bg-zinc-500' : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                  <span
                    className={`text-[10px] uppercase tracking-wider font-medium ${
                      isLocked ? 'text-zinc-400' : 'text-emerald-300'
                    }`}
                  >
                    {isLocked ? 'Locked' : 'Unlocked'}
                  </span>
                </div>
                <div className="text-[12px] text-zinc-400 mt-0.5">
                  Auto-synced{' '}
                  <span className="tabular-nums">
                    {stored.lastSyncedAt
                      ? timeAgo(new Date(stored.lastSyncedAt).toISOString())
                      : 'never'}
                  </span>
                  . Saves 5 sec after every change once unlocked.
                </div>

                {isLocked && (
                  <div className="mt-3">
                    <input
                      type="password"
                      value={unlockPassphrase}
                      onChange={(e) => {
                        setUnlockPassphrase(e.target.value);
                      }}
                      placeholder="Passphrase"
                      className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void handleUnlock();
                      }}
                      disabled={busy || !unlockPassphrase}
                      className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
                    >
                      {busyAction === 'unlock' ? 'Unlocking…' : 'Unlock to sync'}
                    </button>
                  </div>
                )}

                {!isLocked && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        void syncNow();
                      }}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
                    >
                      {busyAction === 'sync' ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void restore();
                      }}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
                    >
                      {busyAction === 'restore' ? 'Restoring…' : 'Restore from Gist'}
                    </button>
                    <button
                      type="button"
                      onClick={lock}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      Lock
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
                {stored.gistUrl && (
                  <a
                    href={stored.gistUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-500 underline mt-2.5 inline-block"
                  >
                    View gist on GitHub →
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-[18px] mt-0.5">☁️</span>
              <div className="min-w-0 flex-1">
                <div className="serif text-[16px] text-white">GitHub Gist sync</div>
                <div className="text-[12px] text-zinc-400 mt-0.5 mb-3 leading-relaxed">
                  {connectMode === 'new' ? (
                    <>
                      Auto-sync your library to a private GitHub Gist. Your token is
                      encrypted in this browser with a passphrase you choose; we never
                      see either. Paste a GitHub token with{' '}
                      <strong className="text-zinc-300">Gists: Read &amp; write</strong>{' '}
                      permission.
                    </>
                  ) : (
                    <>
                      Connect to a Gist you already have (e.g. when setting up a new
                      phone). Your local library will be replaced by what&apos;s in the
                      Gist.
                    </>
                  )}
                </div>

                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value);
                  }}
                  placeholder="github_pat_… or ghp_…"
                  className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
                  autoComplete="off"
                />

                {connectMode === 'existing' && (
                  <input
                    value={gistIdInput}
                    onChange={(e) => {
                      setGistIdInput(e.target.value);
                    }}
                    placeholder="Gist ID (the long string after /gist.github.com/…)"
                    className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
                  />
                )}

                <input
                  type="password"
                  value={passphraseInput}
                  onChange={(e) => {
                    setPassphraseInput(e.target.value);
                  }}
                  placeholder="Passphrase (min 8 chars)"
                  className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2"
                  autoComplete="new-password"
                />

                {connectMode === 'new' ? (
                  <button
                    type="button"
                    onClick={() => {
                      void setupGist();
                    }}
                    disabled={setupDisabled}
                    className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
                  >
                    {busyAction === 'setup' ? 'Setting up…' : 'Set up new backup'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      void connectExisting();
                    }}
                    disabled={connectDisabled}
                    className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
                  >
                    {busyAction === 'connect' ? 'Connecting…' : 'Connect & restore'}
                  </button>
                )}

                <div className="flex items-center justify-between gap-3 mt-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setConnectMode(connectMode === 'new' ? 'existing' : 'new');
                    }}
                    className="text-[11px] text-zinc-500 underline text-left"
                  >
                    {connectMode === 'new'
                      ? 'Have an existing Gist? Connect to it →'
                      : '← Create a new backup instead'}
                  </button>
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-zinc-500 underline shrink-0"
                  >
                    Get token →
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-[12px] text-red-300 leading-relaxed">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-[12px] text-emerald-300">
            {success}
          </div>
        )}

        <button
          type="button"
          onClick={handleExport}
          className="w-full glass rounded-2xl p-4 text-left flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <Icon name="download" className="w-5 h-5 mt-0.5 text-zinc-300" />
          <div className="min-w-0 flex-1">
            <div className="serif text-[16px] text-white">Export library</div>
            <div className="text-[12px] text-zinc-400 mt-0.5">
              Download your library as a JSON file. Good for one-off backups to iCloud Files.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleImport}
          className="w-full glass rounded-2xl p-4 text-left flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors"
        >
          <Icon name="upload" className="w-5 h-5 mt-0.5 text-zinc-300" />
          <div className="min-w-0 flex-1">
            <div className="serif text-[16px] text-white">Import from file</div>
            <div className="text-[12px] text-zinc-400 mt-0.5">
              Replace your library with a previously-exported JSON file.
            </div>
          </div>
        </button>
      </div>
    </Sheet>
  );
}
