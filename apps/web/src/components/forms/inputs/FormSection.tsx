import type { ReactNode } from 'react';

interface FormSectionProps {
  label: string;
  children: ReactNode;
}

export function FormSection({ label, children }: FormSectionProps) {
  return (
    <div className="px-4 py-3 border-b border-white/5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-medium mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
