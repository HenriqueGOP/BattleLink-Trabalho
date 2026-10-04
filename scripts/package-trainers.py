"""Package imagegen sources without repainting: crop alpha, resize and compress locally.
Run with Pillow: python scripts/package-trainers.py
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPEC = json.loads((ROOT / 'docs/art-prompts/trainers.json').read_text(encoding='utf-8'))
DEST = ROOT / 'client/public/trainers'
DEST.mkdir(parents=True, exist_ok=True)
manifest = {'version': 1, 'origin': 'Original characters generated with built-in imagegen', 'trainers': {}}
review = Image.new('RGB', (1100, 880), '#193345')
sprites_review = Image.new('RGB', (1280, 660), '#193345')

def visible(image):
    bounds = image.getchannel('A').point(lambda value: 255 if value > 12 else 0).getbbox()
    if not bounds:
        raise ValueError('Empty alpha')
    return bounds

for index, (id, source) in enumerate(SPEC['sources'].items()):
    target = DEST / id
    target.mkdir(exist_ok=True)
    art = Image.open(ROOT / source['art']).convert('RGBA')
    assert art.getchannel('A').getextrema()[0] == 0, f'{id}: no transparency'
    art = art.crop(visible(art))
    art.thumbnail((640, 960), Image.Resampling.LANCZOS)
    art.save(target / 'art.webp', quality=88, method=6)
    assert (target / 'art.webp').stat().st_size <= 350 * 1024
    # Consistent head/shoulder crop derived from the final full-body illustration.
    face = art.crop((0, 0, art.width, min(art.height, int(art.height * .43))))
    face.thumbnail((256, 256), Image.Resampling.LANCZOS)
    portrait = Image.new('RGBA', (256, 256))
    portrait.alpha_composite(face, ((256-face.width)//2, (256-face.height)//2))
    portrait.save(target / 'portrait.webp', quality=88, method=6)
    sheet = Image.open(ROOT / source['atlas']).convert('RGBA')
    assert sheet.getchannel('A').getextrema()[0] == 0, f'{id}: atlas not transparent'
    half = sheet.width // 2
    frames = [sheet.crop((x*half, 0, (x+1)*half, sheet.height)) for x in range(2)]
    bounds = [visible(frame) for frame in frames]
    factor = min(144 / max(b[2]-b[0] for b in bounds), 184 / max(b[3]-b[1] for b in bounds))
    atlas = Image.new('RGBA', (320, 200))
    cell_bounds = []
    for pose, (frame, box) in enumerate(zip(frames, bounds)):
        # A shared scale for both poses; only transparent margins and the foot baseline are normalized.
        crop = frame.crop(box)
        crop = crop.resize((round(crop.width*factor), round(crop.height*factor)), Image.Resampling.NEAREST)
        x, y = (160-crop.width)//2, 194-crop.height
        atlas.alpha_composite(crop, (pose*160+x, y))
        cell_bounds.append([x, y, crop.width, crop.height])
    atlas.save(target / 'atlas.webp', lossless=True, method=6)
    assert (target / 'atlas.webp').stat().st_size <= 150 * 1024
    manifest['trainers'][id] = {
        'art': {'width': art.width, 'height': art.height, 'bytes': (target/'art.webp').stat().st_size, 'anchor': 'center-bottom'},
        'portrait': {'width': 256, 'height': 256, 'bytes': (target/'portrait.webp').stat().st_size},
        'atlas': {'width': 320, 'height': 200, 'columns': 2, 'rows': 1, 'frameWidth': 160, 'frameHeight': 200, 'poses': ['idle', 'throw'], 'foot': [80, 194], 'bounds': cell_bounds, 'bytes': (target/'atlas.webp').stat().st_size},
    }
    thumb = art.copy()
    thumb.thumbnail((190, 245))
    col, row = index % 5, index // 5
    review.paste(thumb, (col*220+(220-thumb.width)//2, row*285+30), thumb)
    ImageDraw.Draw(review).text((col*220+15, row*285+8), id, fill='white')
    col, row = index % 4, index // 4
    sprites_review.paste(atlas, (col*320, row*220+20), atlas)
    ImageDraw.Draw(sprites_review).text((col*320+8, row*220+4), id, fill='white')
(DEST/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
evidence = ROOT/'docs/evidence/trainers'
evidence.mkdir(parents=True, exist_ok=True)
review.save(evidence/'art-review.jpg', quality=90)
sprites_review.save(evidence/'atlas-review.png')
print(json.dumps({'trainers': len(manifest['trainers']), 'totalKB': round(sum(p.stat().st_size for p in DEST.rglob('*.webp'))/1024), 'maxArtKB': round(max(v['art']['bytes'] for v in manifest['trainers'].values())/1024), 'maxAtlasKB': round(max(v['atlas']['bytes'] for v in manifest['trainers'].values())/1024)}))
