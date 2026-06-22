import { describe, expect, it } from 'vitest';
import { parseAtom, parseRSS } from '../../src/parsers/rss';

describe('parseRSS', () => {
  it('parses items with title, link, description, pubDate', () => {
    const xml = `
      <rss><channel>
        <item>
          <title>Hello</title>
          <link>https://example.com/post</link>
          <description>A short desc</description>
          <pubDate>Mon, 02 Jun 2026 17:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;
    const items = parseRSS(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Hello',
      url: 'https://example.com/post',
      excerpt: 'A short desc',
      publishedAt: '2026-06-02T17:00:00.000Z',
    });
  });

  it('falls back to content:encoded when description is missing', () => {
    const xml = `
      <rss><channel>
        <item>
          <title>X</title>
          <link>https://x</link>
          <content:encoded><![CDATA[<p>Full body</p>]]></content:encoded>
        </item>
      </channel></rss>
    `;
    const items = parseRSS(xml);
    expect(items[0]?.excerpt).toBe('Full body');
  });

  it('extracts cover image from enclosure, then media, then inline img', () => {
    const enclosure = parseRSS(`
      <rss><channel><item>
        <title>A</title><link>https://a</link>
        <description>d</description>
        <enclosure url="https://cdn/enc.jpg" />
      </item></channel></rss>
    `)[0];
    expect(enclosure?.coverImage).toBe('https://cdn/enc.jpg');

    const media = parseRSS(`
      <rss><channel><item>
        <title>B</title><link>https://b</link>
        <description>d</description>
        <media:content url="https://cdn/media.jpg" />
      </item></channel></rss>
    `)[0];
    expect(media?.coverImage).toBe('https://cdn/media.jpg');

    const inline = parseRSS(`
      <rss><channel><item>
        <title>C</title><link>https://c</link>
        <description><![CDATA[<img src="https://cdn/inline.jpg" />text]]></description>
      </item></channel></rss>
    `)[0];
    expect(inline?.coverImage).toBe('https://cdn/inline.jpg');
  });

  it('returns empty array when no items', () => {
    expect(parseRSS('<rss><channel></channel></rss>')).toEqual([]);
  });

  it('truncates long descriptions to 220 chars with ellipsis', () => {
    const long = 'x'.repeat(500);
    const xml = `<rss><channel><item><title>T</title><link>l</link><description>${long}</description></item></channel></rss>`;
    expect(parseRSS(xml)[0]?.excerpt.length).toBeLessThanOrEqual(221);
    expect(parseRSS(xml)[0]?.excerpt.endsWith('…')).toBe(true);
  });
});

describe('parseAtom', () => {
  it('parses YouTube-style atom entries with media:description', () => {
    const xml = `
      <feed>
        <entry>
          <yt:videoId>abc123</yt:videoId>
          <title>Episode 1</title>
          <link href="https://youtube.com/watch?v=abc123" />
          <published>2026-06-02T17:00:00Z</published>
          <media:description>0:00 Intro
1:23 Chapter</media:description>
        </entry>
      </feed>
    `;
    const items = parseAtom(xml);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'abc123',
      title: 'Episode 1',
      url: 'https://youtube.com/watch?v=abc123',
      publishedAt: '2026-06-02T17:00:00.000Z',
    });
    expect(items[0]?.description).toContain('0:00 Intro');
  });

  it('falls back to updated when published is missing', () => {
    const xml = `<feed><entry><title>X</title><link href="u" /><updated>2026-01-01T00:00:00Z</updated></entry></feed>`;
    expect(parseAtom(xml)[0]?.publishedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('returns empty array when no entries', () => {
    expect(parseAtom('<feed></feed>')).toEqual([]);
  });
});
