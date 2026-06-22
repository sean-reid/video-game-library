import { ConfirmPanel } from '../common/ConfirmPanel.js';
import { Sheet } from './Sheet.js';

interface ImportConfirmSheetProps {
  open: boolean;
  count: number | null;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

// Two states share a sheet: a parsed-and-staged import waiting on the
// user, or a parse-error surface. `count != null` means we have a
// candidate library ready to apply; `error != null` means the file
// couldn't be parsed. Either way the action is "OK, dismiss".
export function ImportConfirmSheet({
  open,
  count,
  error,
  onConfirm,
  onClose,
}: ImportConfirmSheetProps) {
  if (error) {
    return (
      <Sheet open={open} onClose={onClose} title="Couldn't import">
        <ConfirmPanel
          title="Couldn't import"
          body={error}
          confirmLabel="OK"
          destructive={false}
          onConfirm={onClose}
          onCancel={onClose}
        />
      </Sheet>
    );
  }
  if (count == null) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Replace library?">
      <ConfirmPanel
        title="Replace library?"
        body={`Apply ${String(count)} games from the imported file. Your current local library will be replaced. Export first if you want a safety copy.`}
        confirmLabel="Replace"
        onConfirm={onConfirm}
        onCancel={onClose}
      />
    </Sheet>
  );
}
