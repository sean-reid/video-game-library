import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, leftAction, rightAction, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Lock body scroll while open, then capture the previously-focused element
  // so we can hand focus back to it on close.
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    lastFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus();
      lastFocusRef.current = null;
    };
  }, [open]);

  // Move focus into the panel on open so keyboard users land inside the
  // dialog rather than on the page behind it.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? panel).focus({ preventScroll: true });
  }, [open]);

  // Escape closes; Tab cycles focus inside the dialog (focus trap).
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mt-auto bg-ink-950 rounded-t-3xl border-t border-white/10 max-w-md mx-auto w-full flex flex-col outline-none"
        style={{ height: '92vh' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-4 pt-2 pb-3 border-b border-white/5">
          <div className="w-16">{leftAction}</div>
          <div id={titleId} className="serif text-[18px] text-white">
            {title}
          </div>
          <div className="w-16 flex justify-end">{rightAction}</div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
