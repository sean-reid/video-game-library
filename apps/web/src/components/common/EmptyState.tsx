interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="px-6 py-12 text-center text-zinc-500">
      <div className="serif text-2xl text-zinc-400 mb-1">{title}</div>
      <div className="text-sm">{subtitle}</div>
    </div>
  );
}
