import { useEffect, useState } from 'react';
import type { Game } from '../../types/index.js';
import { ConfirmPanel } from '../common/ConfirmPanel.js';
import { GameForm } from '../forms/GameForm.js';
import { blankForm, formFromGame, formToGame } from '../forms/gameFormState.js';
import { Sheet } from './Sheet.js';

interface EditGameSheetProps {
  open: boolean;
  game: Game | null;
  onClose: () => void;
  onSave: (game: Game) => void;
  onDelete: (id: string) => void;
}

export function EditGameSheet({ open, game, onClose, onSave, onDelete }: EditGameSheetProps) {
  const [form, setForm] = useState(blankForm);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (open && game) setForm(formFromGame(game));
    if (!open) setConfirmingDelete(false);
  }, [open, game]);

  if (!game) return null;

  const handleSave = (): void => {
    if (!form.title.trim()) return;
    onSave(formToGame(form, game.id));
    onClose();
  };
  const confirmDelete = (): void => {
    setConfirmingDelete(true);
  };
  const cancelDelete = (): void => {
    setConfirmingDelete(false);
  };
  const reallyDelete = (): void => {
    onDelete(game.id);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={confirmingDelete ? 'Delete game' : 'Edit game'}
      leftAction={
        confirmingDelete ? null : (
          <button type="button" onClick={onClose} className="text-zinc-400 text-[14px]">
            Cancel
          </button>
        )
      }
      rightAction={
        confirmingDelete ? null : (
          <button
            type="button"
            onClick={handleSave}
            disabled={!form.title.trim()}
            className="text-[14px] font-semibold disabled:opacity-40"
            style={{ color: '#d4a574' }}
          >
            Save
          </button>
        )
      }
    >
      {confirmingDelete ? (
        <ConfirmPanel
          title={`Delete "${game.title}"?`}
          body="This removes the game from your library. The action cannot be undone, though a connected Gist backup keeps a copy you can restore from."
          confirmLabel="Delete"
          onConfirm={reallyDelete}
          onCancel={cancelDelete}
        />
      ) : (
        <GameForm form={form} setForm={setForm} onDelete={confirmDelete} />
      )}
    </Sheet>
  );
}
