"""Offline alpha bounds for local PNGs and every composited GIF frame.

Does not change image bytes or fetch resources. Pillow's frame iterator applies
GIF disposal before measurement, so partial frame rectangles are not mistaken
for the creature's full size. Run with the bundled Python runtime.
"""
import concurrent.futures
import json
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'client/public'
DATA = ROOT / 'client/src/data'

def measure(path):
    with Image.open(PUBLIC / path.lstrip('/')) as image:
        width, height = image.size
        union = None
        for frame in ImageSequence.Iterator(image):
            bounds = frame.convert('RGBA').getchannel('A').point(lambda alpha: 255 if alpha >= 8 else 0).getbbox()
            if bounds:
                union = bounds if union is None else (min(union[0], bounds[0]), min(union[1], bounds[1]), max(union[2], bounds[2]), max(union[3], bounds[3]))
        left, top, right, bottom = union or (0, 0, width, height)
        return path, [width, height, left, top, right, bottom]

if __name__ == '__main__':
    paths = set()
    for entry in json.loads((DATA / 'asset-registry.json').read_text()).values():
        paths.update(path for key, path in entry.items() if key != 'cry')
    for entry in json.loads((DATA / 'animated-registry.json').read_text()).values():
        paths.update(asset['path'] for asset in entry.values())
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        metrics = dict(pool.map(measure, sorted(paths)))
    (DATA / 'sprite-metrics.json').write_text(json.dumps(metrics, sort_keys=True, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Measured {len(metrics)} local sprites; PNG and composited GIF union bounds.')
