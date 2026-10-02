"""Development-only import from fixed PokeAPI revisions. No runtime network dependency."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'client' / 'public' / 'pokemon'
DATA = ROOT / 'client' / 'src' / 'data'
SPECIES = json.loads((ROOT / 'server/src/data/species.json').read_text(encoding='utf-8'))
PUBLIC.mkdir(parents=True, exist_ok=True)
DATA.mkdir(parents=True, exist_ok=True)

def read(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'pokemon-battle-local-assets'})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()

revisions_file = PUBLIC / 'sources.json'
if revisions_file.exists():
    revisions = json.loads(revisions_file.read_text(encoding='utf-8'))
else:
    revisions = {repo: json.loads(read(f'https://api.github.com/repos/PokeAPI/{repo}/commits/{branch}'))['sha']
                 for repo, branch in [('sprites', 'master'), ('cries', 'main')]}
    revisions_file.write_text(json.dumps(revisions, indent=2) + '\n', encoding='utf-8')

for repo, name in [('sprites', 'LICENCE.txt'), ('cries', 'LICENSE')]:
    target = PUBLIC / f'{repo}-LICENSE.txt'
    if not target.exists():
        target.write_bytes(read(f'https://raw.githubusercontent.com/PokeAPI/{repo}/{revisions[repo]}/{name}'))

def download(task):
    species_id, number, kind, repo, remote, suffix = task
    relative = f'{kind}/{number}.{suffix}'
    target = PUBLIC / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if suffix == 'ogg' and target.with_suffix('.mp3').exists():
        target = target.with_suffix('.mp3')
        relative = f'{kind}/{number}.mp3'
    for attempt in range(3):
        try:
            contents = target.read_bytes() if target.exists() else read(
                f'https://raw.githubusercontent.com/PokeAPI/{repo}/{revisions[repo]}/{remote}/{number}.{suffix}')
            signature = b'\x89PNG\r\n\x1a\n' if suffix == 'png' else b'OggS'
            # Pikachu's upstream .ogg is MP3; preserve bytes with the correct extension.
            mp3 = suffix == 'ogg' and (contents.startswith(b'ID3') or contents[:2] in [b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'])
            if mp3:
                target = target.with_suffix('.mp3')
                relative = f'{kind}/{number}.mp3'
            if (not contents.startswith(signature) and not mp3) or len(contents) > 512 * 1024:
                raise ValueError(f'Invalid asset: {relative}, {len(contents)} bytes, signature {contents[:16]!r}')
            if not target.exists():
                target.write_bytes(contents)
            return species_id, kind, {'path': f'/pokemon/{relative}', 'bytes': len(contents), 'sha256': hashlib.sha256(contents).hexdigest()}
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return species_id, kind, None
            if attempt == 2:
                raise
        except (OSError, TimeoutError):
            if attempt == 2:
                raise

variants = [('front', 'sprites', 'sprites/pokemon', 'png'),
            ('back', 'sprites', 'sprites/pokemon/back', 'png'),
            ('shinyFront', 'sprites', 'sprites/pokemon/shiny', 'png'),
            ('shinyBack', 'sprites', 'sprites/pokemon/back/shiny', 'png'),
            ('cry', 'cries', 'cries/pokemon/latest', 'ogg')]
tasks = [(s['id'], s['num'], *variant) for s in SPECIES for variant in variants]
manifest = {s['id']: {} for s in SPECIES}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    for done, (species_id, kind, asset) in enumerate(pool.map(download, tasks), 1):
        if asset:
            manifest[species_id][kind] = asset
        if done % 250 == 0:
            print(f'Local assets: {done}/{len(tasks)}', flush=True)

(PUBLIC / 'manifest.json').write_text(json.dumps(manifest, sort_keys=True) + '\n', encoding='utf-8')
registry = {key: {kind: asset['path'] for kind, asset in value.items()} for key, value in manifest.items()}
(DATA / 'asset-registry.json').write_text(json.dumps(registry, sort_keys=True) + '\n', encoding='utf-8')
print(json.dumps({'files': sum(len(x) for x in manifest.values()),
                  'bytes': sum(a['bytes'] for x in manifest.values() for a in x.values()),
                  'missing': sum(len(variants) - len(x) for x in manifest.values())}), flush=True)
