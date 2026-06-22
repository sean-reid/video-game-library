import type { ReactNode } from 'react';
import type { StoredGistConfig } from '../../../types/index.js';
import { timeAgo } from '../../../utils/dateUtils.js';

export type ConnectedPanelBusyAction = 'sync' | 'restore' | null;

export interface GistConnectedPanelProps {
  stored: StoredGistConfig;
  isLocked: boolean;
  busy: boolean;
  busyAction: ConnectedPanelBusyAction;
  onSyncNow: () => void;
  onRestore: () => void;
  onLock: () => void;
  onDisconnect: () => void;
  // Slot for the unlock UI when isLocked is true. Kept as a slot rather
  // than a coupled import so the locked state can be tested in isolation.
  lockedSlot: ReactNode;
}

// The "you have a backup" half of BackupSheet. Shows lock state, last-synced
// timestamp, and either the unlock form (locked) or the action buttons
// (unlocked: Sync now / Restore / Lock / Disconnect).
export function GistConnectedPanel({
  stored,
  isLocked,
  busy,
  busyAction,
  onSyncNow,
  onRestore,
  onLock,
  onDisconnect,
  lockedSlot,
}: GistConnectedPanelProps) {
  return (
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
              {stored.lastSyncedAt ? timeAgo(new Date(stored.lastSyncedAt).toISOString()) : 'never'}
            </span>
            . Auto-saves 5 seconds after any change while unlocked.
          </div>

          {isLocked && lockedSlot}

          {!isLocked && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={onSyncNow}
                disabled={busy}
                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
              >
                {busyAction === 'sync' ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                onClick={onRestore}
                disabled={busy}
                className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-[12px] font-medium disabled:opacity-50"
              >
                {busyAction === 'restore' ? 'Restoring…' : 'Restore from Gist'}
              </button>
              <button
                type="button"
                onClick={onLock}
                disabled={busy}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-50"
              >
                Lock
              </button>
              <button
                type="button"
                onClick={onDisconnect}
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
  );
}
