import { useEffect, useState } from 'react';
import type { RawgSearchHit } from '../../services/rawgApi.js';
import type { Game } from '../../types/index.js';
import { GameForm } from '../forms/GameForm.js';
import { RawgSearch } from '../forms/RawgSearch.js';
import { blankForm, formFromRawg, formToGame } from '../forms/gameFormState.js';
import { Sheet } from './Sheet.js';

interface AddGameSheetProps {
  open: boolean;
  onClose: () => void;
  onAdd: (game: Game) => void;
  existingIds: Set<string>;
}

export function AddGameSheet({ open, onClose, onAdd, existingIds }: AddGameSheetProps) {
  const [step, setStep] = useState<'search' | 'form'>('search');
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    if (open) {
      setStep('search');
      setForm(blankForm());
    }
  }, [open]);

  const pick = (r: RawgSearchHit): void => {
    setForm(formFromRawg(r));
    setStep('form');
  };
  const skipToManual = (): void => {
    setForm({ ...blankForm(), state: 'rumored' });
    setStep('form');
  };

  const handleSave = (): void => {
    if (!form.title.trim()) return;
    const newGame = formToGame(form);
    if (existingIds.has(newGame.id)) {
      newGame.id = `${newGame.id}-${Math.random().toString(36).slice(2, 5)}`;
    }
    onAdd(newGame);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === 'search' ? 'Add a game' : 'New game'}
      leftAction={
        <button
          type="button"
          onClick={
            step === 'form'
              ? () => {
                  setStep('search');
                }
              : onClose
          }
          className="text-zinc-400 text-[14px]"
        >
          {step === 'form' ? 'Back' : 'Cancel'}
        </button>
      }
      rightAction={
        step === 'form' && (
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
      {step === 'search' ? (
        <RawgSearch onPick={pick} onSkip={skipToManual} />
      ) : (
        <GameForm form={form} setForm={setForm} />
      )}
    </Sheet>
  );
}
