// Run manually after changing social copy; generated PNGs are checked in so
// production builds need no system fonts. See README for font requirements.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ui as dictionaries } from '../src/i18n/ui.ts';
import { tracker } from '../src/i18n/tracker.ts';

const ink = '#1F1B14';
const muted = '#706B61';
const orange = '#F7931A';
const escapeMarkup = (text: string) => text.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]!);

// Render text independently so long translations fit without clipping.
async function textLayer(text: string, left: number, top: number, size: number,
  maxWidth: number, color = ink, bold = false, japanese = false): Promise<sharp.OverlayOptions> {
  const font = `${japanese ? 'Noto Sans CJK JP' : 'Noto Sans'} ${bold ? 'Bold' : 'Regular'} ${size}`;
  const input = await sharp({ text: {
    text: `<span foreground="${color}">${escapeMarkup(text)}</span>`,
    font, rgba: true, dpi: 72,
  } }).png().toBuffer();
  const fitted = await sharp(input).resize({ width: maxWidth, withoutEnlargement: true }).png().toBuffer();
  return { input: fitted, left, top };
}

// Simple code-native illustrations mirror the four choices on the homepage.
const icons = [
  '<path d="M0 48V0m0 48h78M10 36l16-14 13 5 15-21 10 7 14-16"/>',
  '<rect x="0" y="0" width="78" height="48" rx="8"/><path d="m32 13 19 11-19 11z"/>',
  '<circle cx="28" cy="24" r="28"/><ellipse cx="28" cy="24" rx="12" ry="28"/><path d="M0 24h56M5 9q23 13 46 0M5 39q23-13 46 0"/>',
  '<rect x="10" y="-8" width="38" height="64" rx="8"/><path d="M23 0h12M24 47h10"/>',
];

for (const [lang, t] of Object.entries(dictionaries)) {
  const labels = [tracker[lang as keyof typeof tracker].priceChart, t.nav.videoMode,
    'A Bit of Earth', tracker[lang as keyof typeof tracker].app];
  const background = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#F8F7F3"/>
    <path d="M80 256h1040" stroke="#E5E1D8"/>
    ${labels.map((_, i) => `<g transform="translate(${80 + i * 264} 292)">
      <rect width="248" height="174" rx="20" fill="#FFFFFF" stroke="#E5E1D8"/>
      <g transform="translate(26 34)" fill="none" stroke="${orange}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</g>
    </g>`).join('')}
    <circle cx="1088" cy="546" r="5" fill="${orange}"/>
  </svg>`;
  const layers: sharp.OverlayOptions[] = [
    { input: await sharp(fileURLToPath(new URL('../public/app-icon.png', import.meta.url))).resize(80, 80).png().toBuffer(), left: 80, top: 72 },
    await textLayer('Open Bitcoin Tracker', 184, 86, 47, 936, ink, true),
    await textLayer(t.meta.socialTagline, 80, 190, 36, 1040, muted, false, lang === 'ja'),
    ...await Promise.all(labels.map((label, i) =>
      textLayer(label, 106 + i * 264, 418, 23, 196, ink, true, lang === 'ja'))),
    await textLayer('openbitcointracker.com', 80, 533, 22, 700, muted),
  ];
  const png = await sharp(Buffer.from(background)).composite(layers).png().toBuffer();
  const filename = `og-bitcoin-tools${lang === 'en' ? '' : `-${lang}`}.png`;
  await writeFile(new URL(`../public/${filename}`, import.meta.url), png);
  // Refresh the original shared URL too, for consumers that already saved it.
  if (lang === 'en') await writeFile(new URL('../public/og-image.png', import.meta.url), png);
  console.log(`Generated ${filename} (1200 × 630)`);
}
