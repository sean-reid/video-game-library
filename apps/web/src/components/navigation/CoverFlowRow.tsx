import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

const COVER_FLOW_LEFT_PAD = 20; // matches px-5 of the section header
const COVER_FLOW_GAP = 8;

interface CoverFlowRowProps<T> {
  items: T[];
  renderItem: (item: T) => ReactNode;
  idKey?: keyof T & string;
  cardWidth?: number;
  flowKey?: string;
}

// Cover-Flow style horizontal scroller. The card whose LEFT edge sits at
// the row's left edge is the "focused" one (flat, full size). Cards to its
// right are tilted inward and stacked back. Snap-scroll lands each card
// flush with the left.
export function CoverFlowRow<T extends { id?: string | number | null }>(
  props: CoverFlowRowProps<T>,
) {
  const { items, renderItem, cardWidth = 168, flowKey } = props;
  const idKey = props.idKey ?? ('id');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const updateTransforms = (): void => {
    const container = containerRef.current;
    if (!container) return;
    const focusX = container.scrollLeft + COVER_FLOW_LEFT_PAD;
    for (const [, el] of Object.entries(cardRefs.current)) {
      if (!el) continue;
      const offset = (el.offsetLeft - focusX) / el.offsetWidth;
      const abs = Math.min(Math.abs(offset), 4);

      // Focused card: NO transform at all + highest z-index + explicit
      // pointer-events so taps definitely go through. Setting transform to ''
      // removes the inline value entirely, pulling the card out of any 3D
      // containing block iOS might otherwise hit-test through.
      if (abs < 0.04) {
        el.style.transform = '';
        el.style.opacity = '1';
        el.style.zIndex = '50';
        el.style.pointerEvents = 'auto';
        el.style.position = 'relative';
        continue;
      }
      el.style.position = '';

      const rotateY = Math.max(-55, Math.min(55, -offset * 30));
      const scale = Math.max(0.76, 1 - abs * 0.1);
      const translateZ = -Math.min(140, abs * 45);
      const pullStart = 1;
      const pullAmount = Math.max(0, abs - pullStart) * 42;
      const translateX = offset > 0 ? -Math.min(64, pullAmount) : Math.min(64, pullAmount);
      const opacity = Math.max(0.4, 1 - abs * 0.22);
      el.style.transform = `translate3d(${String(translateX)}px, 0, ${String(translateZ)}px) rotateY(${String(rotateY)}deg) scale(${String(scale)})`;
      el.style.opacity = String(opacity);
      el.style.zIndex = abs < 1.2 ? '20' : '10';
    }
  };

  const setRightPadding = (): void => {
    const c = containerRef.current;
    const inner = innerRef.current;
    if (!c || !inner) return;
    const n = items.length;
    const naturalContent = n * cardWidth + Math.max(0, n - 1) * COVER_FLOW_GAP;
    // Trailing room = clientWidth - cardWidth so the last card can scroll
    // its left edge to focus.
    const tail = Math.max(40, c.clientWidth - cardWidth + 40);
    inner.style.width = `${String(naturalContent + tail)}px`;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let rafId: number | null = null;
    const onScroll = (): void => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        updateTransforms();
        rafId = null;
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    setRightPadding();
    requestAnimationFrame(() => {
      setRightPadding();
      updateTransforms();
    });
    const ro = new ResizeObserver(() => {
      setRightPadding();
      requestAnimationFrame(updateTransforms);
    });
    ro.observe(container);
    return () => {
      container.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [items]);

  return (
    <div
      ref={containerRef}
      data-flowkey={flowKey}
      className="overflow-x-auto no-scrollbar"
      style={{
        scrollSnapType: 'x mandatory',
        scrollBehavior: 'smooth',
        scrollPaddingInlineStart: `${String(COVER_FLOW_LEFT_PAD)}px`,
        paddingLeft: `${String(COVER_FLOW_LEFT_PAD)}px`,
        paddingTop: '6px',
        paddingBottom: '14px',
        perspective: '1200px',
      }}
    >
      <div
        ref={innerRef}
        className="flex items-center"
        style={{ gap: `${String(COVER_FLOW_GAP)}px` }}
      >
        {items.map((item) => {
          const id = String(item[idKey] ?? '');
          return (
            <div
              key={id}
              ref={(el) => {
                cardRefs.current[id] = el;
              }}
              className="shrink-0"
              style={{
                width: `${String(cardWidth)}px`,
                scrollSnapAlign: 'start',
                transition: 'transform 140ms ease-out, opacity 140ms ease-out',
                transformOrigin: 'left center',
                touchAction: 'manipulation',
              }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
