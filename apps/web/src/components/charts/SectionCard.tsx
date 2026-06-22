import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, children }: SectionCardProps) {
  return (
    <div className="mx-4 mt-5">
      <div className="px-1 mb-2">
        <div className="serif text-[20px] text-white">{title}</div>
        {subtitle && <div className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</div>}
      </div>
      <div className="glass rounded-2xl p-4">{children}</div>
    </div>
  );
}
