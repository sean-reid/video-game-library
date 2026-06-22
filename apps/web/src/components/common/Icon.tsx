import type { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'library'
  | 'news'
  | 'back'
  | 'search'
  | 'plus'
  | 'star'
  | 'check'
  | 'trophy'
  | 'replay'
  | 'clock'
  | 'chevron'
  | 'arrowUp'
  | 'arrowDown'
  | 'edit'
  | 'trash'
  | 'download'
  | 'upload'
  | 'settings'
  | 'close'
  | 'play'
  | 'pause'
  | 'skipBack15'
  | 'skipForward15';

interface IconProps {
  name: IconName;
  className?: string;
  style?: CSSProperties;
  filled?: boolean;
}

const PATHS: Record<IconName, ReactNode> = {
  library: (
    <>
      <rect x="3" y="3" width="7" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="11" rx="1.5" />
      <rect x="14" y="17" width="7" height="4" rx="1.5" />
    </>
  ),
  news: (
    <>
      <path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5z" />
      <path d="M19 7h1a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2" />
      <path d="M8 9h7M8 13h7M8 17h4" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 3 2.5 6 6.5.5-5 4.5L17.5 21 12 17.5 6.5 21l1.5-7-5-4.5 6.5-.5L12 3z" />,
  check: <path d="m5 12 5 5L20 7" />,
  trophy: (
    <>
      <path d="M7 4h10v3a5 5 0 0 1-10 0V4z" />
      <path d="M7 4H4v3a3 3 0 0 0 3 3M17 4h3v3a3 3 0 0 1-3 3M10 14h4v4h-4zM8 21h8" />
    </>
  ),
  replay: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  arrowUp: <path d="m6 15 6-6 6 6" />,
  arrowDown: <path d="m6 9 6 6 6-6" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5M12 15V3" />
    </>
  ),
  upload: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5M12 3v12" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h13M4 12h7M4 18h11" />
      <circle cx="20" cy="6" r="1.5" fill="currentColor" />
      <circle cx="14" cy="12" r="1.5" fill="currentColor" />
      <circle cx="18" cy="18" r="1.5" fill="currentColor" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  play: <path d="M5 3l14 9-14 9V3z" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="0.5" />
      <rect x="14" y="5" width="4" height="14" rx="0.5" />
    </>
  ),
  // Skip-back / skip-forward 15s: circular arrow + "15" in the middle
  skipBack15: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
      <text
        x="12.5"
        y="15"
        fontSize="7"
        fontWeight="700"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontFamily="Inter"
      >
        15
      </text>
    </>
  ),
  skipForward15: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
      <text
        x="12"
        y="15"
        fontSize="7"
        fontWeight="700"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontFamily="Inter"
      >
        15
      </text>
    </>
  ),
};

export function Icon({ name, className = 'w-5 h-5', style, filled }: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
