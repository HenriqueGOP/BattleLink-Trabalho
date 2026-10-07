"""Import crisp menu artwork from the sprite revision already pinned by the game.

Network is development-only. Runtime reads the safe local registry and falls back
to the existing front sprite when artwork is unavailable. Images retain alpha;
no source pixels are upscaled. The source dimensions and hash remain auditable.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.error
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'client/public/pokemon'
DATA = ROOT / 'client/src/data'
SPECIES = json.loads((ROOT / 'server/src/data/species.json').read_text(encoding='utf-8'))
REVISION = json.loads((PUBLIC / 'sources.json').read_text(encoding='utf-8'))['sprites']
MANIFEST = PUBLIC / 'artwork/manifest.json'
PREVIOUS = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}


def download(task):
    species_id, number, variant = task
    path = f'/pokemon/artwork/{variant}/{number}.webp'
    target = ROOT / 'client/public' / path.lstrip('/')
    old = PREVIOUS.get(species_id, {}).get(variant)
    if old and target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == old['sha256']:
        return species_id, variant, old
    upstream = f'sprites/pokemon/other/official-artwork/{"shiny/" if variant == "shiny" else ""}{number}.png'
    request = urllib.request.Request(
        f'https://raw.githubusercontent.com/PokeAPI/sprites/{REVISION}/{upstream}',
        headers={'User-Agent': 'battle-link-local-menu-artwork'},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                source = response.read()
            with Image.open(io.BytesIO(source)) as original:
                original.load()
                dimensions = original.size
                image = original.convert('RGBA')
                image.thumbnail((384, 384), Image.Resampling.LANCZOS)
                bounds = image.getchannel('A').point(lambda alpha: 255 if alpha >= 8 else 0).getbbox()
                if not bounds:
                    raise ValueError(f'Empty artwork: {upstream}')
                output = io.BytesIO()
                image.save(output, format='WEBP', quality=88, method=6, exact=True)
                encoded = output.getvalue()
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(encoded)
                return species_id, variant, {
                    'path': path, 'bytes': len(encoded),
                    'sha256': hashlib.sha256(encoded).hexdigest(),
                    'width': image.width, 'height': image.height, 'bounds': list(bounds),
                    'sourceWidth': dimensions[0], 'sourceHeight': dimensions[1],
                    'sourceSha256': hashlib.sha256(source).hexdigest(),
                    'upstreamPath': upstream, 'revision': REVISION,
                }
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return species_id, variant, None
            if attempt == 2:
                raise
        except (OSError, TimeoutError):
            if attempt == 2:
                raise


if __name__ == '__main__':
    tasks = [(species['id'], species['num'], variant) for species in SPECIES for variant in ['normal', 'shiny']]
    manifest = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        for done, (species_id, variant, entry) in enumerate(pool.map(download, tasks), 1):
            if entry:
                manifest.setdefault(species_id, {})[variant] = entry
            if done % 200 == 0:
                print(f'Menu artwork: {done}/{len(tasks)}', flush=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, sort_keys=True, separators=(',', ':')) + '\n', encoding='utf-8')
    registry = {species_id: {variant: {key: entry[key] for key in ['path', 'width', 'height', 'bounds']} for variant, entry in variants.items()} for species_id, variants in manifest.items()}
    (DATA / 'artwork-registry.json').write_text(json.dumps(registry, sort_keys=True, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'files': sum(len(variants) for variants in manifest.values()), 'bytes': sum(entry['bytes'] for variants in manifest.values() for entry in variants.values()), 'missing': len(tasks) - sum(len(variants) for variants in manifest.values())}), flush=True)
