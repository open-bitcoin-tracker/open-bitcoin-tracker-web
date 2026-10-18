"""Build the bundled city catalogue from a reviewed Natural Earth GeoJSON file.

Usage: python3 scripts/import-earth-cities.py /path/to/ne_10m_populated_places.geojson
The importer never downloads data. Review the pinned source and update it deliberately.
"""
import hashlib
import collections
import unicodedata
import json
import math
import sys
from pathlib import Path

SOURCE_REVISION = '789c9904087846cc3361302857aa2e76b0ae71ff'
SOURCE_URL = f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{SOURCE_REVISION}/geojson/ne_10m_populated_places.geojson'
SOURCE_SHA256 = '9b8e3de09048ef00dfc70357dbb9fa324493f214b5e0ae4daf1aa79a8d10116b'
LANGUAGES = ('de', 'es', 'fr', 'it', 'ja', 'pt', 'ru', 'tr', 'vi')
root = Path(__file__).resolve().parent.parent
raw = Path(sys.argv[1]).read_bytes()
if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
    raise SystemExit('Source checksum differs. Review the new source before updating the importer.')
source = json.loads(raw)
regions = json.loads((root / 'src/features/earth/lib/country-regions.json').read_text())
country_codes = {region: code for code, region in regions.items()}
rows = []
for feature in source['features']:
    p = feature['properties']
    region = p['ISO_A2']
    # Natural Earth uses non-ISO codes for these disputed territories.
    region = {'KOS': 'XK', 'SOL': 'SO', 'CYN': 'CY'}.get(p['ADM0_A3'], region)
    if not isinstance(region, str) or len(region) != 2 or not region.isalpha():
        raise ValueError('Unmapped country region')
    name = p.get('NAME_EN') or p['NAME']
    center = [round(float(p['LONGITUDE']), 6), round(float(p['LATITUDE']), 6)]
    if not name or not all(math.isfinite(n) for n in center) or abs(center[0]) > 180 or abs(center[1]) > 90:
        raise ValueError('Invalid city name or coordinates')
    aliases = list(dict.fromkeys(str(p[k]) for k in ('NAME', 'NAMEASCII', 'NAMEALT', 'MEGANAME') if p.get(k) and p[k] != name))
    names = {lang: p[f'NAME_{lang.upper()}'] for lang in LANGUAGES if p.get(f'NAME_{lang.upper()}') and p[f'NAME_{lang.upper()}'] != name}
    rows.append({
        'id': f"ne-{p['NE_ID']}", 'name': name,
        'countryCode': country_codes.get(region, p['ADM0_A3']), 'region': region,
        'country': p['ADM0NAME'], 'admin': p.get('ADM1NAME') or '',
        'center': center, 'population': max(0, int(p.get('POP_MAX') or 0)),
        'names': names, 'aliases': aliases,
    })
if len(rows) < 7000 or len({row['id'] for row in rows}) != len(rows):
    raise ValueError('Unexpected catalogue size or duplicate city IDs')
# Keep administrative labels only where city and country alone are ambiguous.
def city_key(row):
    name = ''.join(c for c in unicodedata.normalize('NFKD', row['name']) if not unicodedata.combining(c)).casefold()
    return row['region'], name
counts = collections.Counter(city_key(row) for row in rows)
for row in rows:
    if counts[city_key(row)] == 1:
        row['admin'] = ''
rows.sort(key=lambda row: row['id'])
output = root / 'src/features/earth/lib/cities.json'
output.write_text('[\n' + ',\n'.join('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')) for row in rows) + '\n]\n')
metadata = {'source': SOURCE_URL, 'sha256': SOURCE_SHA256, 'reviewedAt': '2026-10-18', 'license': 'Public domain', 'count': len(rows)}
(root / 'src/features/earth/lib/cities-source.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f'Imported {len(rows)} city and town records.')
