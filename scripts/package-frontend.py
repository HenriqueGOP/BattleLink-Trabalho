"""Package imagegen raster sources: resize, slice atlas cells, preserve alpha, WebP encode.
This script creates no illustrated content; every painted pixel comes from imagegen.
"""
from pathlib import Path
import json
import sys
from PIL import Image

def sprite_box(cell):
    """Locate the cell's subject; crop fragments crossing from adjacent cells.

    This only chooses a rectangular source crop, never paints/removes pixels.
    Detached props wholly inside a cell remain part of its crop.
    """
    alpha = cell.getchannel('A')
    width, height = cell.size
    pixels = alpha.tobytes()
    visited = bytearray(width * height)
    components = []
    for start, value in enumerate(pixels):
        if value <= 12 or visited[start]:
            continue
        visited[start] = 1
        pending = [start]
        left = right = start % width
        top = bottom = start // width
        count = 0
        while pending:
            position = pending.pop()
            x, y = position % width, position // width
            left, right = min(left, x), max(right, x)
            top, bottom = min(top, y), max(bottom, y)
            count += 1
            for neighbor in (position-width if y else -1, position+width if y+1 < height else -1, position-1 if x else -1, position+1 if x+1 < width else -1):
                if neighbor >= 0 and not visited[neighbor] and pixels[neighbor] > 12:
                    visited[neighbor] = 1
                    pending.append(neighbor)
        components.append((count, (left, top, right+1, bottom+1)))
    assert components, 'empty sprite cell'
    main = max(components)
    boxes = [box for count, box in components if (count, box) == main or (count > 4 and box[0] > width*.05 and box[2] < width*.95)]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'client/public/interface'
OUT.mkdir(exist_ok=True)
assets = {}
motion_only = '--motion-only' in sys.argv
if motion_only:
    assets = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8'))['assets']
for path in ([] if motion_only else sorted((ROOT / 'docs/art-sources/frontend').glob('*.png'))):
    image = Image.open(path).convert('RGBA')
    if path.stem == 'home-modes':
        image = image.resize((900, 300), Image.Resampling.NEAREST)
    elif path.stem == 'logo':
        image.thumbnail((1200, 400), Image.Resampling.NEAREST)
    elif 'emblem' in path.stem:
        image.thumbnail((256, 256), Image.Resampling.NEAREST)
    elif path.stem.startswith('type-'):
        image.thumbnail((512, 256), Image.Resampling.LANCZOS)
    else:
        image.thumbnail((1600, 900), Image.Resampling.LANCZOS)
    target = OUT / (path.stem + '.webp')
    for quality in (83, 78, 72, 65):
        image.save(target, quality=quality, method=6)
        if target.stat().st_size <= 350 * 1024:
            break
    assert target.stat().st_size <= 350 * 1024
    assets[path.stem] = {'path': '/interface/' + target.name, 'width': image.width, 'height': image.height, 'bytes': target.stat().st_size, 'alpha': image.getchannel('A').getextrema()[0] == 0}
(OUT / 'manifest.json').write_text(json.dumps({'origin': 'built-in imagegen', 'assets': assets}, indent=2) + '\n', encoding='utf-8')

manifest_path = ROOT / 'client/public/trainers/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
poses = ['idle', 'prepare', 'throw', 'follow', 'celebrate', 'defeated']
for id, metadata in manifest['trainers'].items():
    folder = ROOT / 'client/public/trainers' / id
    source = ROOT / 'docs/art-sources/trainers' / (id + '-splash.png')
    if source.exists() and not motion_only:
        image = Image.open(source).convert('RGBA')
        assert image.getchannel('A').getextrema()[0] == 0, f'{id}: splash missing alpha'
        image.thumbnail((900, 900), Image.Resampling.LANCZOS)
        target = folder / 'splash.webp'
        for quality in (88, 83, 78, 72, 65):
            image.save(target, quality=quality, method=6)
            if target.stat().st_size <= 350 * 1024:
                break
        assert target.stat().st_size <= 350 * 1024
        metadata['splash'] = {'width': image.width, 'height': image.height, 'bytes': target.stat().st_size, 'anchor': 'center-bottom'}
    source = ROOT / 'docs/art-sources/trainers' / (id + '-motion.png')
    if not source.exists():
        continue
    sheet = Image.open(source).convert('RGBA')
    assert sheet.getchannel('A').getextrema()[0] == 0, f'{id}: motion missing alpha'
    cells, bounds = [], []
    for row in range(2):
        for col in range(6):
            cell = sheet.crop((round(col*sheet.width/6), round(row*sheet.height/2), round((col+1)*sheet.width/6), round((row+1)*sheet.height/2)))
            box = sprite_box(cell)
            assert box, f'{id}: empty cell {row}/{col}'
            cells.append(cell)
            bounds.append(box)
    # Put wind-up before release where source frames arrived in reverse order.
    if id in {'aren', 'bento', 'teo', 'nina', 'nival'}:
        cells[2], cells[8] = cells[8], cells[2]
        bounds[2], bounds[8] = bounds[8], bounds[2]
    # Same scale for every pose, common foot baseline; original painted pixels.
    scale = min(148/max(b[2]-b[0] for b in bounds), 184/max(b[3]-b[1] for b in bounds))
    atlas = Image.new('RGBA', (960, 400))
    cell_bounds = []
    for index, (cell, box) in enumerate(zip(cells, bounds)):
        sprite = cell.crop(box)
        sprite = sprite.resize((max(1, round(sprite.width*scale)), max(1, round(sprite.height*scale))), Image.Resampling.NEAREST)
        x, y = (160-sprite.width)//2, 194-sprite.height
        atlas.alpha_composite(sprite, (index%6*160+x, index//6*200+y))
        cell_bounds.append([x, y, sprite.width, sprite.height])
    target = folder / 'motion.webp'
    for quality in (90, 85, 78, 70, 60, 50):
        atlas.save(target, quality=quality, method=6)
        if target.stat().st_size <= 150*1024:
            break
    assert target.stat().st_size <= 150*1024, f'{id}: atlas budget'
    metadata['motion'] = {'width': 960, 'height': 400, 'columns': 6, 'rows': 2, 'frameWidth': 160, 'frameHeight': 200, 'poses': poses, 'framesPerState': 2, 'foot': [80, 194], 'bounds': cell_bounds, 'bytes': target.stat().st_size}
manifest['version'] = 2
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'interface': len(assets), 'splashes': sum('splash' in m for m in manifest['trainers'].values()), 'motionAtlases': sum('motion' in m for m in manifest['trainers'].values()), 'maxInterfaceKB': round(max(a['bytes'] for a in assets.values())/1024)}, indent=2))
