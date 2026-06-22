export function extractField(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = re.exec(xml);
  if (!m?.[1]) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

export function stripTags(s: string): string {
  return cleanEntities(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)));
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trimEnd() + '…';
}

export function extractMeta(html: string, name: string): string | null {
  const escName = name.replace(/[:.]/g, '\\$&');
  const re1 = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escName}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escName}["']`,
    'i',
  );
  const m = re1.exec(html) ?? re2.exec(html);
  return m?.[1] ?? null;
}
