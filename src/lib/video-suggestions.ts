/** Add a YouTube ID, its original title, and verified live status to the appropriate section. */
export const videoSections = [
  {
    id: 'party', labelKey: 'partyTab',
    videos: [
      { id: 'EFDMum1vs7Q', title: 'Pump It Up (Bitcoin Maximalist Remix) on a 10 Hour Loop', isLive: false },
      { id: 'ez8m4PXksQs', title: 'Epic Sax Guy - 10 Hour Version - But when does the beat drop? 🤔', isLive: false },
      { id: '_yRJsecDjjc', title: 'Gypsy kid dancing at club cant be bothered 1997 [AI 4k 50fps]', isLive: false },
    ],
  },
  {
    id: 'chill', labelKey: 'chillTab',
    videos: [
      { id: '2QWVZkuTU4s', title: 'Sofa Lofi Chillhop 🛋️ Beats to Study, Relax & Unwind at Night 🎵', isLive: true },
      { id: 'vYIYIVmOo3Q', title: 'Calming Lofi Rain 🌧️ Chill Beats for Focus, Study & Sleep', isLive: true },
      { id: 'yf5NOyy1SXU', title: 'Soft Lofi Room 🎧 Chill Vibes for Peaceful Study & Relaxation', isLive: true },
      { id: 'TGysUwc_LEc', title: '🎵 Private Interstellar Suite in Deep Space | Ambient Music and Deep Space Sounds | HD | LIVE', isLive: true },
      { id: 'zBRFf8gAsR8', title: '24/7 Lofi Radio | Rainy Cafe & Cozy Ocean Beats ☕🌧️ Chill Beats to Study/Sleep/Relax', isLive: true },
      { id: 'vKG91INzLt0', title: '3 Hour of Relaxing Zelda Songs to chill/study/sleep', isLive: false },
      { id: 'mSX3OyW9Rao', title: '🔥 Fireplace Evenings of Calm: Burning Logs, Crackling Sounds, and the Serenity of Pure Relaxation', isLive: false },
      { id: '784dsKVrdjQ', title: 'Interstellar Gargantua Black Hole | 1 Hour Full HD Live Wallpaper', isLive: false },
    ],
  },
  {
    id: 'without-sound', labelKey: 'withoutSoundTab',
    videos: [
      { id: 'vx5AZDbSY1g', title: 'Bitcoin Crypto 1-hour Technology Screensaver 4K', isLive: false },
      { id: 'mgqIPHwwfyM', title: 'Glowing Bitcoin ₿ 4K | 1 Hour Crypto Particle Animation & Ambient Loop', isLive: false },
      { id: 'X3BT2eCleOE', title: 'Blockchain / Crypto / Bitcoin Wallpaper Screensaver | motics - Wallpapers', isLive: false },
      { id: 'FwIHSDiFye8', title: '[4K] 3 Hour Of Amazing DJ Visuals - VJ Loops', isLive: false },
      { id: 'kiNSWFEyDQM', title: 'VJ Party Visuals (mixed by MrHansenable)', isLive: false },
      { id: '7d5pgfsSug0', title: '8 Hours of Rotating Disco Light in 4K | Multicolor Party Background Loop', isLive: false },
      { id: '5mGuCdlCcNM', title: 'Bouncing DVD Logo Screensaver 4K 60fps - 10 hours NO LOOP', isLive: false },
      { id: 'A07HjYnbAQQ', title: 'Disco Light Neon Tunnel 4K | 8 Hour Loop of Futuristic Club Vibes', isLive: false },
      { id: 'YIZkCUFU9Oc', title: 'Purple Ultraviolet Glowing Star Shapes Sparkle In Deep Dark Space 4K OLED Safe Visual Background', isLive: false },
      { id: '-sOAzvbWgnk', title: 'Neon Ring Background Video, Blue Purple Tunnel Motion Background Loop | Free Stock Video', isLive: false },
    ],
  },
] as const;

/** Shared metadata for curated cards and Recent, regardless of section. */
export const videoSuggestions = videoSections.flatMap<{ id: string; title: string; isLive: boolean }>(section => [...section.videos]);
