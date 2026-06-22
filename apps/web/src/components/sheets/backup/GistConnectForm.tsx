import { useState } from 'react';

export type ConnectMode = 'new' | 'existing';

export interface GistConnectFormProps {
  busy: boolean;
  busyAction: 'setup' | 'connect' | null;
  onSetupNew: (token: string, passphrase: string) => void;
  onConnectExisting: (token: string, gistId: string, passphrase: string) => void;
}

// First-run form for connecting to a Gist. Owns its own input state so the
// parent BackupSheet only sees a (token, passphrase[, gistId]) tuple at the
// moment the user confirms. Lives as its own file so BackupSheet doesn't
// mix three independent UIs in one body.
export function GistConnectForm({
  busy,
  busyAction,
  onSetupNew,
  onConnectExisting,
}: GistConnectFormProps) {
  const [mode, setMode] = useState<ConnectMode>('new');
  const [token, setToken] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [gistId, setGistId] = useState('');

  const submitNew = (): void => {
    if (!token.trim() || passphrase.length < 8) return;
    onSetupNew(token.trim(), passphrase);
  };
  const submitExisting = (): void => {
    if (!token.trim() || !gistId.trim() || passphrase.length < 8) return;
    onConnectExisting(token.trim(), gistId.trim(), passphrase);
  };

  const newDisabled = busy || !token.trim() || passphrase.length < 8;
  const existingDisabled = busy || !token.trim() || !gistId.trim() || passphrase.length < 8;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-[18px] mt-0.5">☁️</span>
        <div className="min-w-0 flex-1">
          <div className="serif text-[16px] text-white">GitHub Gist sync</div>
          <div className="text-[12px] text-zinc-400 mt-0.5 mb-3 leading-relaxed">
            {mode === 'new' ? (
              <>
                Auto-sync your library to a private GitHub Gist. Your token is encrypted in this
                browser with a passphrase you choose; we never see either. Paste a GitHub token with{' '}
                <strong className="text-zinc-300">Gists: Read &amp; write</strong> permission.
              </>
            ) : (
              <>
                Connect to a Gist you already have (e.g. when setting up a new phone). Your local
                library will be replaced by what&apos;s in the Gist.
              </>
            )}
          </div>

          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
            }}
            placeholder="github_pat_… or ghp_…"
            className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
            autoComplete="off"
          />

          {mode === 'existing' && (
            <input
              value={gistId}
              onChange={(e) => {
                setGistId(e.target.value);
              }}
              placeholder="Gist ID (the long string after /gist.github.com/…)"
              className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2 font-mono"
            />
          )}

          <input
            type="password"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
            }}
            placeholder="Passphrase (min 8 chars)"
            className="w-full bg-white/5 rounded-xl px-3 py-2 text-[14px] text-white placeholder-zinc-500 outline-none focus:bg-white/10 mb-2"
            autoComplete="new-password"
          />

          {mode === 'new' ? (
            <button
              type="button"
              onClick={submitNew}
              disabled={newDisabled}
              className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
            >
              {busyAction === 'setup' ? 'Setting up…' : 'Set up new backup'}
            </button>
          ) : (
            <button
              type="button"
              onClick={submitExisting}
              disabled={existingDisabled}
              className="w-full py-2 rounded-xl bg-white text-ink-950 text-[13px] font-semibold disabled:opacity-40"
            >
              {busyAction === 'connect' ? 'Connecting…' : 'Connect & restore'}
            </button>
          )}

          <div className="flex items-center justify-between gap-3 mt-2.5">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'new' ? 'existing' : 'new');
              }}
              className="text-[11px] text-zinc-500 underline text-left"
            >
              {mode === 'new'
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
  );
}
