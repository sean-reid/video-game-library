import { describe, expect, it } from 'vitest';
import {
  cleanEntities,
  extractField,
  extractMeta,
  stripTags,
  truncate,
} from '../../src/utils/html';

describe('cleanEntities', () => {
  it('decodes named entities', () => {
    expect(cleanEntities('Tom &amp; Jerry &lt;3 &quot;cool&quot; &apos;quoted&apos;')).toBe(
      `Tom & Jerry <3 "cool" 'quoted'`,
    );
  });

  it('decodes numeric entities', () => {
    expect(cleanEntities('caf&#233;')).toBe('café');
  });

  it('decodes hex entities (case-insensitive)', () => {
    expect(cleanEntities('snow&#x2603;man')).toBe('snow☃man');
    expect(cleanEntities('snow&#X2603;man')).toBe('snow☃man');
  });

  it('treats &nbsp; as a regular space', () => {
    expect(cleanEntities('a&nbsp;b')).toBe('a b');
  });

  it('passes plain text through unchanged', () => {
    expect(cleanEntities('hello world')).toBe('hello world');
  });
});

describe('stripTags', () => {
  it('removes HTML tags', () => {
    expect(stripTags('<p>hello <b>world</b></p>')).toBe('hello world');
  });

  it('decodes entities while stripping', () => {
    expect(stripTags('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
  });

  it('collapses whitespace', () => {
    expect(stripTags('<p>foo</p>\n\n  <p>bar</p>')).toBe('foo bar');
  });

  it('returns empty string for empty input', () => {
    expect(stripTags('')).toBe('');
  });
});

describe('truncate', () => {
  it('returns input unchanged when within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis when over limit', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });

  it('trims trailing whitespace before the ellipsis', () => {
    expect(truncate('hello     world', 7)).toBe('hello…');
  });

  it('handles the exact-length case', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('extractField', () => {
  it('returns inner text of the first matching tag', () => {
    expect(extractField('<title>Hello</title>', 'title')).toBe('Hello');
  });

  it('unwraps CDATA sections', () => {
    expect(extractField('<title><![CDATA[Hello & World]]></title>', 'title')).toBe('Hello & World');
  });

  it('is case-insensitive on the tag name', () => {
    expect(extractField('<Title>Hello</Title>', 'title')).toBe('Hello');
  });

  it('handles attributes on the tag', () => {
    expect(extractField('<title type="text">Hello</title>', 'title')).toBe('Hello');
  });

  it('returns empty string when the tag is missing', () => {
    expect(extractField('<other>x</other>', 'title')).toBe('');
  });
});

describe('extractMeta', () => {
  it('reads property meta tag', () => {
    expect(extractMeta('<meta property="og:title" content="Hello">', 'og:title')).toBe('Hello');
  });

  it('reads name meta tag', () => {
    expect(extractMeta('<meta name="description" content="hi">', 'description')).toBe('hi');
  });

  it('handles content attribute before property attribute', () => {
    expect(extractMeta('<meta content="Hello" property="og:title">', 'og:title')).toBe('Hello');
  });

  it('returns null when the meta tag is missing', () => {
    expect(extractMeta('<title>x</title>', 'og:title')).toBeNull();
  });

  it('escapes colons and dots in the name', () => {
    expect(extractMeta('<meta name="article:author" content="Sean">', 'article:author')).toBe(
      'Sean',
    );
  });
});
