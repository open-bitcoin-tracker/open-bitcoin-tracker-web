import { getImage } from 'astro:assets';
import paper from '../assets/screenshots/paper-cream.png';
import salmon from '../assets/screenshots/salmon-press.png';
import deepsea from '../assets/screenshots/deepsea-blue.png';
import oled from '../assets/screenshots/oled-black.png';
import stack from '../assets/screenshots/stack-details.png';

const screenshots = { paper, salmon, deepsea, oled, stack };
export type ScreenshotName = keyof typeof screenshots;

async function optimizeScreenshot(name: ScreenshotName, preview: boolean) {
  const widths = preview ? [180, 360, 540] : [320, 640, 960];
  const images = await Promise.all(widths.map(width => getImage({
    src: screenshots[name], width, format: 'webp', quality: 85,
  })));
  return {
    src: images[0].src,
    srcset: images.map((image, i) => `${image.src} ${widths[i]}w`).join(', '),
    width: screenshots[name].width,
    height: screenshots[name].height,
  };
}

// Share build-time transforms across components and localized pages. Browsers
// receive only the size they need, with no runtime image service.
const optimized = new Map<string, ReturnType<typeof optimizeScreenshot>>();
export function getScreenshot(name: ScreenshotName, preview = false) {
  const key = `${name}:${preview}`;
  let image = optimized.get(key);
  if (!image) {
    image = optimizeScreenshot(name, preview);
    optimized.set(key, image);
  }
  return image;
}
