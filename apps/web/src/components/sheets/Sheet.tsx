import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  children: ReactNode;
}

export function Sheet({ open, onClose, title, leftAction, rightAction, children }: SheetProps) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="relative mt-auto bg-ink-950 rounded-t-3xl border-t border-white/10 max-w-md mx-auto w-full flex flex-col"
        style={{ height: '92vh' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
          <div className="w-16">{leftAction}</div>
          <div className="serif text-[18px] text-white">{title}</div>
          <div className="w-16 flex justify-end">{rightAction}</div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
