// Generated brand assets are checked in so production builds need no system fonts.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ui as dictionaries } from '../src/i18n/ui.ts';

const displayFont = fileURLToPath(new URL('./fonts/BarlowCondensed-Bold.ttf', import.meta.url));
const iconSource = fileURLToPath(new URL('../public/app-icon.png', import.meta.url));

// Page icons render at up to 96 CSS pixels. Keep them sharp at 3x density
// without making every visitor download the 1024-pixel source used for artwork.
await sharp(iconSource).resize(288, 288).webp({ quality: 85 })
  .toFile(fileURLToPath(new URL('../public/app-icon.webp', import.meta.url)));

async function titleLayer(word: string, top: number): Promise<sharp.OverlayOptions> {
  const input = await sharp({ text: {
    text: `<span foreground="#000000">${word}</span>`,
    // The comma separates Pango's family from its style.
    font: 'Barlow Condensed, Bold 190', fontfile: displayFont,
    rgba: true, dpi: 72,
  } }).png().toBuffer();
  const fitted = await sharp(input).resize({ width: 648, height: 145,
    fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { input: fitted, left: 504, top };
}

// A single brand image serves every language: the product name stays unchanged.
const icon = await sharp(iconSource)
  .resize(360, 360).png().toBuffer();
// A soft cast shadow falls down and right from light at the upper left.
const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="14"/>
  </filter></defs>
  <rect x="86" y="153" width="360" height="360" rx="76" fill="#252722" fill-opacity=".2" filter="url(#shadow)"/>
</svg>`);
const layers: sharp.OverlayOptions[] = [
  { input: shadow, left: 0, top: 0 },
  { input: icon, left: 72, top: 135 },
  await titleLayer('OPEN', 72),
  await titleLayer('BITCOIN', 247),
  await titleLayer('TRACKER', 422),
];
const png = await sharp({ create: {
  width: 1200, height: 630, channels: 3, background: '#F4F2EB',
} }).composite(layers).png().toBuffer();

for (const lang of Object.keys(dictionaries)) {
  const filename = `og-bitcoin-tools${lang === 'en' ? '' : `-${lang}`}.png`;
  await writeFile(new URL(`../public/${filename}`, import.meta.url), png);
  console.log(`Generated ${filename} (1200 × 630)`);
}
// Preserve the original shared URL for consumers that already saved it.
await writeFile(new URL('../public/og-image.png', import.meta.url), png);
