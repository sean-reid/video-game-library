interface RatingSliderRowProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  color: string;
}

export function RatingSliderRow({ label, value, onChange, color }: RatingSliderRowProps) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="text-[12px] uppercase tracking-wider text-zinc-400 w-20 shrink-0 font-medium">
        {label}
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="1"
        value={value || 0}
        onChange={(e) => {
          onChange(parseInt(e.target.value, 10));
        }}
        className="flex-1 accent-amber-300"
        style={{ accentColor: color }}
      />
      <div className="text-[13px] tabular-nums w-5 text-right text-zinc-200 font-medium">
        {value || 0}
      </div>
    </div>
  );
}
