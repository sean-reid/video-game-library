import type { Dispatch, SetStateAction } from 'react';
import { CATEGORIES } from '../../data/constants.js';
import type { RatingCategory } from '../../types/index.js';
import { TIER, gradientFor } from '../../utils/gameHelpers.js';
import { Icon } from '../common/Icon.js';
import { FormSection } from './inputs/FormSection.js';
import { RatingSliderRow } from './inputs/RatingSliderRow.js';
import { StateSelector } from './inputs/StateSelector.js';
import { TextArea } from './inputs/TextArea.js';
import { TextInput } from './inputs/TextInput.js';
import { Toggle } from './inputs/Toggle.js';
import { blankRating, ratingTotal, type GameFormState } from './gameForm.js';

interface GameFormProps {
  form: GameFormState;
  setForm: Dispatch<SetStateAction<GameFormState>>;
  onDelete?: () => void;
}

export function GameForm({ form, setForm, onDelete }: GameFormProps) {
  const setField =
    <K extends keyof GameFormState>(k: K) =>
    (v: GameFormState[K]) => {
      setForm((f) => ({ ...f, [k]: v }));
    };
  const setRating = (key: RatingCategory, value: number): void => {
    setForm((f) => ({
      ...f,
      rating: { ...(f.rating ?? blankRating()), [key]: value },
    }));
  };
  const total = form.rating ? ratingTotal(form.rating) : 0;
  const tier = total >= 80 ? TIER(total) : null;
  const color = tier?.color ?? '#d4a574';

  return (
    <div className="pb-8">
      <div
        className="relative h-36 grain"
        style={
          form.coverImage
            ? { background: '#0a0a0c' }
            : { background: gradientFor({ title: form.title || '?', platform: form.platform }) }
        }
      >
        {form.coverImage && (
          <img
            src={form.coverImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-3 px-4">
          <div className="serif text-[26px] leading-tight text-white">
            {form.title || 'Untitled'}
          </div>
        </div>
      </div>

      <FormSection label="State">
        <StateSelector value={form.state} onChange={setField('state')} />
      </FormSection>

      <FormSection label="Title">
        <TextInput
          value={form.title}
          onChange={(e) => {
            setField('title')(e.target.value);
          }}
          placeholder="Game title"
        />
      </FormSection>

      <FormSection label="Release year & platform">
        <div className="grid grid-cols-2 gap-2">
          <TextInput
            type="number"
            inputMode="numeric"
            value={form.year}
            onChange={(e) => {
              setField('year')(e.target.value);
            }}
            placeholder="Year"
          />
          <TextInput
            value={form.platform}
            onChange={(e) => {
              setField('platform')(e.target.value);
            }}
            placeholder="Console (e.g. PS5)"
          />
        </div>
      </FormSection>

      {form.state === 'upcoming' && (
        <FormSection label="Expected release">
          <TextInput
            value={form.expectedDate}
            onChange={(e) => {
              setField('expectedDate')(e.target.value);
            }}
            placeholder='e.g. "6/25", "Fall 2026", "H1 2026", "2027"'
          />
        </FormSection>
      )}

      {form.state === 'recommended' && (
        <FormSection label="Time to beat (hours)">
          <TextInput
            type="number"
            inputMode="numeric"
            value={form.timeToBeat}
            onChange={(e) => {
              setField('timeToBeat')(e.target.value);
            }}
            placeholder="Optional"
          />
        </FormSection>
      )}

      {form.state === 'played' && (
        <>
          <FormSection label="Completion">
            <div className="grid grid-cols-1 gap-2">
              <Toggle
                label="Story finished"
                value={form.completion.story ?? false}
                onChange={(v) => {
                  setField('completion')({ ...form.completion, story: v });
                }}
              />
              <Toggle
                label="Platinum / 100%"
                value={form.completion.platinum ?? false}
                onChange={(v) => {
                  setField('completion')({ ...form.completion, platinum: v });
                }}
              />
              <Toggle
                label="Replayed"
                value={form.completion.replayed ?? false}
                onChange={(v) => {
                  setField('completion')({ ...form.completion, replayed: v });
                }}
              />
            </div>
          </FormSection>

          <FormSection
            label={`Rating · Total ${String(total)}/100${tier ? ` · ${tier.label}` : ''}`}
          >
            <div className="space-y-1">
              {CATEGORIES.map((c) => (
                <RatingSliderRow
                  key={c.key}
                  label={c.label}
                  value={form.rating?.[c.key as RatingCategory] ?? 0}
                  onChange={(v) => {
                    setRating(c.key as RatingCategory, v);
                  }}
                  color={color}
                />
              ))}
            </div>
          </FormSection>

          <FormSection label="Top 50 rank (optional)">
            <TextInput
              type="number"
              inputMode="numeric"
              value={form.topListRank}
              onChange={(e) => {
                setField('topListRank')(e.target.value);
              }}
              placeholder="Leave blank if not in Top 50. Set explicitly to break ties."
            />
          </FormSection>
        </>
      )}

      <FormSection label="Notes">
        <TextArea
          rows={3}
          value={form.notes}
          onChange={(e) => {
            setField('notes')(e.target.value);
          }}
          placeholder='e.g. "Pre-ordered • Amazon", or any reminder'
        />
      </FormSection>

      {onDelete && (
        <div className="px-4 pt-6 pb-2">
          <button
            type="button"
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-500/10 text-red-300 text-[14px] font-medium hover:bg-red-500/15"
          >
            <Icon name="trash" className="w-4 h-4" />
            Delete this game
          </button>
        </div>
      )}
    </div>
  );
}
