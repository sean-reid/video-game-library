import { STATE_META } from '../../../data/constants.js';
import type { GameState } from '../../../types/index.js';

const ALL_STATES: GameState[] = ['rumored', 'upcoming', 'recommended', 'playing', 'played'];

interface StateSelectorProps {
  value: GameState;
  onChange: (next: GameState) => void;
}

export function StateSelector({ value, onChange }: StateSelectorProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
      {ALL_STATES.map((s) => {
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => {
              onChange(s);
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium tracking-wide transition-all ${
              on ? 'bg-white text-ink-950' : 'glass-light text-zinc-300'
            }`}
          >
            {STATE_META[s].label}
          </button>
        );
      })}
    </div>
  );
}
