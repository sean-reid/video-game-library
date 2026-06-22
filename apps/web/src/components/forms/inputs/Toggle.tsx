interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onChange(!value);
      }}
      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl ${value ? 'bg-white/10' : 'bg-white/5'}`}
    >
      <span className="text-[14px] text-zinc-100">{label}</span>
      <div
        className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-gold' : 'bg-white/15'}`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value ? 'left-4' : 'left-0.5'}`}
        />
      </div>
    </button>
  );
}
