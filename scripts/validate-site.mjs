import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('site');
const expected = ['index.html', 'guide/index.html', 'knowledge/index.html', 'styles.css', 'app.js', 'robots.txt', 'sitemap.xml', 'llms.txt', 'manifest.webmanifest', 'assets/mark.svg', 'assets/og-card.png', 'assets/review-screen.png', 'assets/autocomplete-screen.png'];
for (const path of expected) await access(resolve(root, path));

const pages = [
  ['index.html', 'https://kuseumkkrkkr.github.io/KR-humanizer/'],
  ['guide/index.html', 'https://kuseumkkrkkr.github.io/KR-humanizer/guide/'],
  ['knowledge/index.html', 'https://kuseumkkrkkr.github.io/KR-humanizer/knowledge/']
];

for (const [path, canonical] of pages) {
  const html = await readFile(resolve(root, path), 'utf8');
  for (const pattern of [/<title>[^<]{10,}<\/title>/, /<meta name="description" content="[^"]{50,}"/, /<h1>/, /application\/ld\+json/]) {
    if (!pattern.test(html)) throw new Error(`${path} failed ${pattern}`);
  }
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) throw new Error(`${path} has the wrong canonical URL`);
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!jsonLd.length) throw new Error(`${path} has no JSON-LD`);
  for (const match of jsonLd) JSON.parse(match[1]);
}

const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
if (!robots.includes('Allow: /') || !robots.includes('/KR-humanizer/sitemap.xml')) throw new Error('robots.txt is not crawlable');
const sitemap = await readFile(resolve(root, 'sitemap.xml'), 'utf8');
for (const [, canonical] of pages) if (!sitemap.includes(`<loc>${canonical}</loc>`)) throw new Error(`sitemap missing ${canonical}`);
console.log(`Validated ${pages.length} indexable pages and ${expected.length} site artifacts.`);
