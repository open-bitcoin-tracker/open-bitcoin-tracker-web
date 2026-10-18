import type { EarthCopy } from '../../../i18n/earth';
import { toArea } from '../lib/bitcoin';

function EarthIllustration({ copy, format }: { copy: EarthCopy; format: Intl.NumberFormat }) {
  return (
    <svg
      viewBox="0 0 440 200"
      className="guide-art"
      role="img"
      aria-label={copy.illustration.replace('{area}', format.format(toArea(1)))}
    >
      <defs>
        <clipPath id="guide-earth-clip">
          <circle cx="110" cy="100" r="80" />
        </clipPath>
      </defs>
      <circle className="art-water" cx="110" cy="100" r="80" />
      <g className="art-land" clipPath="url(#guide-earth-clip)">
        {/* Simplified Atlantic-facing continents, including Antarctica. */}
        <path d="M29 56Q43 36 65 30L79 35 83 43 96 45 100 54 91 62 83 64 79 75 70 78 65 88 68 98 78 105 82 112 76 114 68 104 60 99 55 88 44 83 39 72 29 68Z" />
        <path d="M80 112L91 110 102 117 107 125 119 129 117 141 108 150 105 160 95 173 90 171 90 157 85 146 82 135 76 126Z" />
        <path d="M99 25L112 21 126 26 122 37 114 48 106 44 102 35Z" />
        <path d="M144 42L153 34 158 42 154 53 162 59 175 55 193 62 201 81 188 94 178 91 168 84 158 85 150 78 141 80 136 74 143 66 138 59Z" />
        <path d="M141 88L155 86 166 94 168 106 177 111 169 122 163 125 157 144 149 153 141 146 138 132 132 122 124 113 124 100 131 91Z" />
        <path d="M173 137L176 132 178 139 175 149 171 150Z" />
        <path d="M52 171Q76 165 93 172L112 170 127 173 146 168 170 173 174 187H47Z" />
      </g>
      <g className="art-grid" fill="none">
        <ellipse cx="110" cy="100" rx="36" ry="80" />
        <path d="M41 60Q110 83 179 60M30 100H190M41 140Q110 117 179 140" />
      </g>
      <circle className="art-rim" cx="110" cy="100" r="80" />
      <path
        className="art-connector"
        d="M201 100H239L268 71"
        fill="none"
      />
      <rect className="art-area" x="280" y="42" width="102" height="102" />
      <text className="art-area-label" x="331" y="177" textAnchor="middle">
        <tspan className="art-bitcoin-label">1 BTC</tspan> ≈ {format.format(toArea(1))} km²
      </text>
    </svg>
  );
}

export default function EarthIntro({ copy, lang }: { copy: EarthCopy; lang: string }) {
  const format = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  return (
    <div className="guide-intro">
      <div className="guide-illustration">
        <EarthIllustration copy={copy} format={format} />
      </div>
      <div className="guide-copy">
        <p className="guide-description">{copy.intro}</p>
        <p className="guide-note">{copy.landNote}</p>
      </div>
    </div>
  );
}
