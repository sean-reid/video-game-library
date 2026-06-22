import { useEffect, useState } from 'react';
import type { Game } from '../../types/index.js';
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

  useEffect(() => {
    if (open && game) setForm(formFromGame(game));
  }, [open, game]);

  if (!game) return null;

  const handleSave = (): void => {
    if (!form.title.trim()) return;
    onSave(formToGame(form, game.id));
    onClose();
  };
  const handleDelete = (): void => {
    if (window.confirm(`Delete "${game.title}"? This cannot be undone.`)) {
      onDelete(game.id);
      onClose();
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit game"
      leftAction={
        <button type="button" onClick={onClose} className="text-zinc-400 text-[14px]">
          Cancel
        </button>
      }
      rightAction={
        <button
          type="button"
          onClick={handleSave}
          className="text-[14px] font-semibold"
          style={{ color: '#d4a574' }}
        >
          Save
        </button>
      }
    >
      <GameForm form={form} setForm={setForm} onDelete={handleDelete} />
    </Sheet>
  );
}
