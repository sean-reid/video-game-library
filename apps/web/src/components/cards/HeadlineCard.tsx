import { useState } from 'react';
import type { Game, Headline } from '../../types/index.js';
import { timeAgo } from '../../utils/dateUtils.js';
import { Icon } from '../common/Icon.js';

export const SOURCE_COLORS: Record<string, string> = {
  'Nintendo Life': '#dc2626',
  'PlayStation Blog': '#3b82f6',
  Polygon: '#a855f7',
  IGN: '#ef4444',
  Engadget: '#10b981',
  Kotaku: '#f59e0b',
};

interface HeadlineCardProps {
  article: Headline;
  onOpen: (article: Headline) => void;
  libraryMatch?: Game | null;
  isRead?: boolean;
}

export function HeadlineCard({ article, onOpen, libraryMatch, isRead }: HeadlineCardProps) {
  const sourceColor = SOURCE_COLORS[article.source] ?? '#a1a1aa';
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = article.coverImage && !imageFailed;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(article);
      }}
      className={`w-full text-left p-3 flex items-start gap-3 hover:bg-white/5 active:bg-white/10 transition-colors ${
        isRead ? 'opacity-45' : ''
      }`}
    >
      <div
        className="w-20 h-20 rounded-xl overflow-hidden shrink-0"
        style={{ background: showImage ? '#0a0a0c' : `${sourceColor}26` /* ~15% alpha */ }}
      >
        {showImage && article.coverImage ? (
          <img
            src={article.coverImage}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => {
              setImageFailed(true);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl select-none">
            🎮
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: sourceColor }}
          >
            {article.source}
          </span>
          <span className="text-[10px] text-zinc-500 tabular-nums">·</span>
          <span className="text-[10px] text-zinc-500 tabular-nums">
            {timeAgo(article.publishedAt)}
          </span>
          {libraryMatch && (
            <span
              title={`In your library: ${libraryMatch.title}`}
              className="ml-1 flex items-center"
            >
              <Icon name="star" filled className="w-3 h-3" style={{ color: '#e2b878' }} />
            </span>
          )}
          {isRead && (
            <span className="ml-1 text-[9px] uppercase tracking-wider text-zinc-600 font-semibold">
              Read
            </span>
          )}
        </div>
        <div className="serif text-[15px] text-white leading-snug mt-0.5 line-clamp-2">
          {article.title}
        </div>
        <div className="text-[12px] text-zinc-400 mt-1 line-clamp-2 leading-snug">
          {article.excerpt}
        </div>
      </div>
    </button>
  );
}
