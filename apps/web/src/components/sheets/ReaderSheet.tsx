import DOMPurify, { type Config as PurifyConfig } from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import { fetchArticle } from '../../services/newsApi.js';
import type { ArticleResponse, Headline } from '../../types/index.js';
import { timeAgo } from '../../utils/dateUtils.js';
import { SOURCE_COLORS } from '../cards/HeadlineCard.js';
import { Sheet } from './Sheet.js';

// Defense-in-depth: even though the worker controls the article body, run
// it through DOMPurify before injecting into the DOM. Strips scripts, event
// handlers, javascript: URIs, and other XSS vectors regardless of source.
const PURIFY_CONFIG: PurifyConfig = {
  ALLOWED_TAGS: [
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'em',
    'figcaption',
    'figure',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'picture',
    'pre',
    'small',
    'source',
    'span',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
  ],
  ALLOWED_ATTR: ['href', 'src', 'srcset', 'sizes', 'alt', 'title', 'colspan', 'rowspan'],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|data:image\/)/i,
};

export function articleKey(article: Headline | null | undefined): string {
  return article?.id ?? article?.url ?? '';
}

interface ReaderSheetProps {
  open: boolean;
  item: Headline | null;
  onClose: () => void;
  onMarkRead?: (key: string) => void;
}

export function ReaderSheet({ open, item, onClose, onMarkRead }: ReaderSheetProps) {
  const [article, setArticle] = useState<ArticleResponse | null>(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!open || !item?.url) return;
    setLoadingArticle(true);
    setArticle(null);
    setArticleError(null);
    setImageFailed(false);
    fetchArticle(item.url)
      .then((data) => {
        setArticle(data);
      })
      .catch((e: unknown) => {
        setArticleError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoadingArticle(false);
      });
  }, [open, item]);

  const safeContent = useMemo(
    () => (article?.content ? DOMPurify.sanitize(article.content, PURIFY_CONFIG) : ''),
    [article?.content],
  );

  if (!open || !item) return null;
  const sourceColor = SOURCE_COLORS[item.source] ?? '#a1a1aa';
  const hero = article?.heroImage ?? item.coverImage;
  const showHero = !!hero && !imageFailed;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Article"
      leftAction={
        <button type="button" onClick={onClose} className="text-zinc-400 text-[14px]">
          Close
        </button>
      }
      rightAction={
        <button
          type="button"
          onClick={() => {
            onMarkRead?.(articleKey(item));
            onClose();
          }}
          className="text-[14px] font-semibold"
          style={{ color: '#d4a574' }}
        >
          Mark read
        </button>
      }
    >
      <div className="px-4 py-6">
        {showHero && hero ? (
          <div
            className="rounded-2xl overflow-hidden mb-4 aspect-[16/9]"
            style={{ background: '#0a0a0c' }}
          >
            <img
              src={hero}
              alt=""
              className="w-full h-full object-cover"
              onError={() => {
                setImageFailed(true);
              }}
            />
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden mb-4 aspect-[16/9] flex items-center justify-center text-6xl"
            style={{ background: `${sourceColor}26` }}
          >
            🎮
          </div>
        )}
        <div
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: sourceColor }}
        >
          {item.source} · {timeAgo(item.publishedAt)}
        </div>
        <h2 className="serif text-[26px] leading-tight text-white mt-2">{item.title}</h2>
        {article?.byline && (
          <div className="text-[12px] text-zinc-500 mt-2">By {article.byline}</div>
        )}

        {loadingArticle && (
          <div className="mt-6 space-y-3 animate-pulse">
            <div className="h-3 w-full bg-white/5 rounded" />
            <div className="h-3 w-11/12 bg-white/5 rounded" />
            <div className="h-3 w-10/12 bg-white/5 rounded" />
            <div className="h-3 w-9/12 bg-white/5 rounded" />
          </div>
        )}

        {articleError && (
          <div className="mt-6 glass rounded-2xl p-4">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Couldn&apos;t load the article body. Here&apos;s the excerpt:
            </p>
            <p className="text-zinc-300 mt-3 leading-relaxed">{item.excerpt}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-[13px] font-semibold"
              style={{ color: '#d4a574' }}
            >
              Read on {item.source} →
            </a>
          </div>
        )}

        {safeContent && (
          <div className="article-body mt-5" dangerouslySetInnerHTML={{ __html: safeContent }} />
        )}

        {article && !article.content && !loadingArticle && !articleError && (
          <div className="mt-6 glass rounded-2xl p-4">
            <p className="text-zinc-300 leading-relaxed">{item.excerpt}</p>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-[13px] font-semibold"
              style={{ color: '#d4a574' }}
            >
              Read full article on {item.source} →
            </a>
          </div>
        )}

        {article?.content && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-block text-[12px] text-zinc-500 hover:text-zinc-300"
          >
            View original on {item.source} →
          </a>
        )}
      </div>
    </Sheet>
  );
}
