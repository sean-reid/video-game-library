import { useEffect, useState } from 'react';
import {
  clearGistConfig,
  createGist,
  fetchGistLibrary,
  saveGistConfig,
  updateGist,
} from '../../services/gistApi.js';
import type { Game, GistSyncConfig } from '../../types/index.js';
import { timeAgo } from '../../utils/dateUtils.js';
import { Icon } from '../common/Icon.js';
import { Sheet } from './Sheet.js';

type ConnectMode = 'new' | 'existing';
type BusyAction = '' | 'setup' | 'connect' | 'sync' | 'restore';

interface BackupSheetProps {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  games: Game[];
  setGames: (games: Game[]) => void;
  gistConfig: GistSyncConfig | null;
  setGistConfig: (config: GistSyncConfig | null) => void;
}

export function BackupSheet({
  open,
  onClose,
  onExport,
  onImport,
  games,
  setGames,
  gistConfig,
  setGistConfig,
}: BackupSheetProps) {
  const [tokenInput, setTokenInput] = useState('');
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
      setConnectMode('new');
    }
  }, [open]);

  const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const setupGist = async (): Promise<void> => {
    const token = tokenInput.trim();
    if (!token) return;
    setBusy(true);
    setBusyAction('setup');
    setError(null);
    setSuccess(null);
    try {
      const gist = await createGist(token, games);
      const config: GistSyncConfig = {
        token,
        gistId: gist.id,
        gistUrl: gist.html_url ?? '',
        lastSyncedAt: Date.now(),
      };
      saveGistConfig(config);
      setGistConfig(config);
      setTokenInput('');
      setSuccess('Connected! Your library is backed up.');
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
    if (!token || !id) return;
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
      const config: GistSyncConfig = {
        token,
        gistId: id,
        gistUrl: `https://gist.github.com/${id}`,
        lastSyncedAt: Date.now(),
      };
      saveGistConfig(config);
      setGistConfig(config);
      setTokenInput('');
      setGistIdInput('');
      setSuccess(`Connected and restored ${String(data.length)} games.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const syncNow = async (): Promise<void> => {
    if (!gistConfig) return;
    setBusy(true);
    setBusyAction('sync');
    setError(null);
    setSuccess(null);
    try {
      await updateGist(gistConfig.token, gistConfig.gistId, games);
      const next: GistSyncConfig = { ...gistConfig, lastSyncedAt: Date.now() };
      saveGistConfig(next);
      setGistConfig(next);
      setSuccess('Synced.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const restore = async (): Promise<void> => {
    if (!gistConfig) return;
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
      const data = await fetchGistLibrary(gistConfig.token, gistConfig.gistId);
      setGames(data);
      const next: GistSyncConfig = { ...gistConfig, lastSyncedAt: Date.now() };
      saveGistConfig(next);
      setGistConfig(next);
      setSuccess(`Restored ${String(data.length)} games.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const disconnect = (): void => {
    if (
      !window.confirm(
        'Disconnect Gist sync? Your Gist will remain on GitHub but the app will stop syncing to it. You can reconnect anytime.',
      )
    ) {
      return;
    }
    clearGistConfig();
    setGistConfig(null);
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
        {gistConfig ? (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-[18px] mt-0.5">☁️</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="serif text-[16px] text-white">GitHub Gist sync</div>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <div className="text-[12px] text-zinc-400 mt-0.5">
                  Auto-synced{' '}
                  <span className="tabular-nums">
                    {gistConfig.lastSyncedAt
                      ? timeAgo(new Date(gistConfig.lastSyncedAt).toISOString())
                      : 'never'}
                  </span>
                  . Saves 5 sec after every change.
                </div>
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
                    onClick={disconnect}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-[12px] font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                </div>
                {gistConfig.gistUrl && (
                  <a
                    href={gistConfig.gistUrl}
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
                      Auto-sync your library to a private GitHub Gist. Survives clearing Safari
                      data, restores easily to a new device. Paste a GitHub token with{' '}
                      <strong className="text-zinc-300">Gists: Read &amp; write</strong>{' '}
                      permission.
                    </>
                  ) : (
                    <>
                      Connect to a Gist you already have (e.g. when setting up a new phone). Your
                      local library will be replaced by what&apos;s in the Gist.
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

                {connectMode === 'new' ? (
                  <button
                    type="button"
                    onClick={() => {
                      void setupGist();
                    }}
                    disabled={busy || !tokenInput.trim()}
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
                    disabled={busy || !tokenInput.trim() || !gistIdInput.trim()}
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
