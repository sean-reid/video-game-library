import { useState } from 'react';

export interface GistUnlockFormProps {
  busy: boolean;
  busyAction: 'unlock' | null;
  onUnlock: (passphrase: string) => void;
}

// Inline unlock UI shown when a stored (encrypted) Gist config is present
// but the in-memory vault is locked. Owns the passphrase input locally so
// it never leaks to the parent until the user actually submits.
export function GistUnlockForm({ busy, busyAction, onUnlock }: GistUnlockFormProps) {
  const [passphrase, setPassphrase] = useState('');

  return (
    <div className="mt-3">
      <input
        type="password"
        value={passphrase}
        onChange={(e) => {
          setPassphrase(e.target.value);
        }}
        placeholder="Passphrase"
        className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2"
        autoComplete="current-password"
      />
      <button
        type="button"
        onClick={() => {
          onUnlock(passphrase);
        }}
        disabled={busy || !passphrase}
        className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
      >
        {busyAction === 'unlock' ? 'Unlocking…' : 'Unlock to sync'}
      </button>
    </div>
  );
}
