import type { ReactNode } from 'react';

interface ConfirmPanelProps {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  // Destructive actions render the confirm button red. Defaults to true
  // since every current caller is destructive (delete, disconnect, restore).
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Two-button in-sheet confirm step, used in place of `window.confirm` for
// destructive actions inside a Sheet. The Sheet's own chrome surrounds it;
// this just owns the message + buttons. The Sheet should swap its content
// to this panel rather than rendering it alongside the normal content.
export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmPanelProps) {
  return (
    <div className="px-4 py-8 flex flex-col items-center text-center">
      <div className="serif text-[22px] text-white leading-tight">{title}</div>
      <div className="text-[14px] text-zinc-400 mt-3 leading-relaxed max-w-xs">{body}</div>
      <div className="flex flex-col gap-2 w-full max-w-xs mt-7">
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className={`w-full py-3 rounded-2xl text-[14px] font-semibold ${
            destructive ? 'bg-red-500/15 text-red-200 hover:bg-red-500/25' : 'bg-white text-ink-950'
          }`}
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 rounded-2xl bg-white/5 text-zinc-300 text-[14px]"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
