#!/usr/bin/env python3
"""Build the same static game into a root-index ZIP, without tooling or user data."""
from pathlib import Path
import json, re, zipfile
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
SUFFIXES = {'.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.woff2', '.woff', '.ttf'}
files = sorted(p for p in ROOT.iterdir() if p.is_file() and p.suffix in SUFFIXES)
files += sorted(p for p in (ROOT / 'assets').rglob('*') if p.is_file() and (p.suffix in SUFFIXES or p.name.endswith('-OFL.txt')))
assert ROOT / 'index.html' in files
html = (ROOT / 'index.html').read_text()
assert 'GamePlatform.ready()' in html and 'platform.js?' in html
assert 'fonts.googleapis.com' not in html
for value in re.findall(r'(?:src|href)="([^"<>]+)"', html):
    if value.startswith(('data:', '#')) or any(x in value for x in ['+', "'", '{']):
        continue
    path = value.split('?')[0]
    if path.startswith(('https:', 'http:', '//')):
        raise ValueError('External startup dependency: ' + path)
    if not (ROOT / path).is_file():
        raise ValueError('Missing local file: ' + path)
OUT.mkdir(exist_ok=True)
archive = OUT / 'zodiak-yandex.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        info = zipfile.ZipInfo.from_file(p, p.relative_to(ROOT).as_posix())
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes(), compresslevel=9)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert 'index.html' in z.namelist()
    assert not any(n.startswith(('/', '../')) or 'node_modules' in n or n.startswith(('tests/','artwork-source/')) for n in z.namelist())
report = {'archive': archive.name, 'files': len(files), 'bytes': archive.stat().st_size,
          'root_entry': 'index.html', 'sdk': 'platform.js -> /sdk.js on Yandex hosts',
          'external_startup_fonts': False, 'tests_in_archive': False, 'artwork_sources_in_archive': False}
(OUT / 'package-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False))
