import { useEffect, useState } from 'react';
import type { UseGistVaultResult } from '../../hooks/useGistVault.js';
import { createGist, fetchGistLibrary, updateGist } from '../../services/gistApi.js';
import type { Game } from '../../types/index.js';
import { ConfirmPanel } from '../common/ConfirmPanel.js';
import { Icon } from '../common/Icon.js';
import { GistConnectForm } from './backup/GistConnectForm.js';
import { GistConnectedPanel } from './backup/GistConnectedPanel.js';
import { GistUnlockForm } from './backup/GistUnlockForm.js';
import { Sheet } from './Sheet.js';

type BusyAction = '' | 'setup' | 'connect' | 'sync' | 'restore' | 'unlock';
type PendingConfirm =
  | { kind: 'connectExisting'; token: string; gistId: string; passphrase: string }
  | { kind: 'restore' }
  | { kind: 'disconnect' };

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
  const { stored, unlocked, isLocked, unlock, lock, connect, disconnect, touchSyncedAt } = vault;
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
      setPendingConfirm(null);
    }
  }, [open]);

  const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  const setupGist = async (token: string, passphrase: string): Promise<void> => {
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
      setSuccess('Connected! Your library is backed up and the token is encrypted.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const requestConnectExisting = (token: string, gistId: string, passphrase: string): void => {
    setPendingConfirm({ kind: 'connectExisting', token, gistId, passphrase });
  };
  const connectExisting = async (
    token: string,
    gistId: string,
    passphrase: string,
  ): Promise<void> => {
    setPendingConfirm(null);
    setBusy(true);
    setBusyAction('connect');
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchGistLibrary(token, gistId);
      setGames(data);
      await connect({
        token,
        passphrase,
        gistId,
        gistUrl: `https://gist.github.com/${gistId}`,
      });
      setSuccess(`Connected and restored ${String(data.length)} games.`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const handleUnlock = async (passphrase: string): Promise<void> => {
    if (!passphrase) return;
    setBusy(true);
    setBusyAction('unlock');
    setError(null);
    setSuccess(null);
    const ok = await unlock(passphrase);
    if (ok) {
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

  const requestRestore = (): void => {
    if (!unlocked) return;
    setPendingConfirm({ kind: 'restore' });
  };
  const restore = async (): Promise<void> => {
    setPendingConfirm(null);
    if (!unlocked) return;
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

  const requestDisconnect = (): void => {
    setPendingConfirm({ kind: 'disconnect' });
  };
  const handleDisconnect = (): void => {
    setPendingConfirm(null);
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

  if (pendingConfirm) {
    let title: string;
    let body: string;
    let confirmLabel: string;
    let onConfirm: () => void;
    if (pendingConfirm.kind === 'connectExisting') {
      const { token, gistId, passphrase } = pendingConfirm;
      title = 'Connect to existing Gist?';
      body = `Replace your local library with the version stored in Gist ${gistId.slice(0, 8)}… on connect. Your current local data will be lost. Export first if you want a safety copy.`;
      confirmLabel = 'Connect & restore';
      onConfirm = () => {
        void connectExisting(token, gistId, passphrase);
      };
    } else if (pendingConfirm.kind === 'restore') {
      title = 'Restore from Gist?';
      body =
        'Replace your local library with the version stored in your Gist. Your current local data will be lost. Export first if you want a safety copy.';
      confirmLabel = 'Restore';
      onConfirm = () => {
        void restore();
      };
    } else {
      title = 'Disconnect Gist sync?';
      body =
        'Your Gist will remain on GitHub but the app will stop syncing to it. You can reconnect anytime.';
      confirmLabel = 'Disconnect';
      onConfirm = handleDisconnect;
    }
    return (
      <Sheet open={open} onClose={onClose} title={title}>
        <ConfirmPanel
          title={title}
          body={body}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onCancel={() => {
            setPendingConfirm(null);
          }}
        />
      </Sheet>
    );
  }

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
            Your previous backup used a cleartext token. Reconnect below to encrypt it at rest with
            a passphrase.
          </div>
        )}

        {stored ? (
          <GistConnectedPanel
            stored={stored}
            isLocked={isLocked}
            busy={busy}
            busyAction={busyAction === 'sync' || busyAction === 'restore' ? busyAction : null}
            onSyncNow={() => {
              void syncNow();
            }}
            onRestore={requestRestore}
            onLock={lock}
            onDisconnect={requestDisconnect}
            lockedSlot={
              <GistUnlockForm
                busy={busy}
                busyAction={busyAction === 'unlock' ? 'unlock' : null}
                onUnlock={(passphrase) => {
                  void handleUnlock(passphrase);
                }}
              />
            }
          />
        ) : (
          <GistConnectForm
            busy={busy}
            busyAction={busyAction === 'setup' || busyAction === 'connect' ? busyAction : null}
            onSetupNew={(token, passphrase) => {
              void setupGist(token, passphrase);
            }}
            onConnectExisting={requestConnectExisting}
          />
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
