"""Package imagegen's 36 actual drawings per trainer; never synthesize frames.

Only transparent cropping, a shared resize and WebP compression are applied.
Rows are states; columns are consecutive frames. Re-run after updating sources.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs/art-sources/trainer-motion-six'
DEST = ROOT / 'client/public/trainers'
POSES = ['idle', 'prepare', 'throw', 'follow', 'celebrate', 'defeated']
FRAME_W, FRAME_H, COLS, ROWS, BASELINE = 160, 200, 6, 6, 194


def bounds(image):
    box = image.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    if box is None:
        raise ValueError('Blank frame')
    return box


def package(trainer_id, manifest):
    source = Image.open(SOURCES / f'{trainer_id}.png').convert('RGBA')
    assert source.getchannel('A').getextrema()[0] == 0, f'{trainer_id}: missing alpha'
    sw, sh = source.size
    # Generated sheets do not always use mathematically equal spacing. Locate
    # transparent gutters before packing, rather than cutting feet/long sleeves.
    alpha = np.asarray(source.getchannel('A')) > 12
    def seams(counts, length, parts):
        cuts = [0]
        for index in range(1, parts):
            ideal = round(index*length/parts)
            radius = round(length/parts*.34)
            lo, hi = max(cuts[-1]+1, ideal-radius), min(length-1, ideal+radius)
            segment = counts[lo:hi+1]
            candidates = np.flatnonzero(segment == segment.min())+lo
            cuts.append(int(min(candidates, key=lambda p: abs(p-ideal))))
        return cuts+[length]
    # Brasa's first source contains five complete rows. The second generation
    # supplies the missing follow-through row. Export those actual drawings
    # without turning cropped remnants or translations into animation frames.
    source_rows = 5 if trainer_id == 'brasa' else ROWS
    row_edges = seams(alpha.sum(axis=1), sh, source_rows)
    cells = []
    source_rects = []
    for row in range(source_rows):
        top, bottom = row_edges[row:row+2]
        column_edges = seams(alpha[top:bottom].sum(axis=0), sw, COLS)
        for col in range(COLS):
            rect = (column_edges[col], top, column_edges[col+1], bottom)
            source_rects.append(rect)
            cells.append(source.crop(rect))
    if trainer_id == 'brasa':
        follow_source = Image.open(SOURCES / 'brasa-follow.png').convert('RGBA')
        follow_alpha = np.asarray(follow_source.getchannel('A')) > 12
        follow_rows = seams(follow_alpha.sum(axis=1), follow_source.height, ROWS)
        top, bottom = follow_rows[3:5]
        follow_cols = seams(follow_alpha[top:bottom].sum(axis=0), follow_source.width, COLS)
        follow_rects = [(follow_cols[col], top, follow_cols[col+1], bottom) for col in range(COLS)]
        cells[18:18] = [follow_source.crop(rect) for rect in follow_rects]
        source_rects[18:18] = follow_rects
    if trainer_id == 'aren':
        celebration = Image.open(SOURCES / 'aren-celebrate.png').convert('RGBA')
        celebration_alpha = np.asarray(celebration.getchannel('A')) > 12
        edges = seams(celebration_alpha.sum(axis=1), celebration.height, 2)
        replacement, rects = [], []
        for row in range(2):
            top, bottom = edges[row:row+2]
            columns = seams(celebration_alpha[top:bottom].sum(axis=0), celebration.width, 3)
            for col in range(3):
                rect = (columns[col], top, columns[col+1], bottom)
                rects.append(rect)
                replacement.append(celebration.crop(rect))
        # Match the relaxed full-body figure's scale, preserving the raised arm
        # height in subsequent frames instead of resizing every pose separately.
        old_box, new_box = bounds(cells[0]), bounds(replacement[0])
        ratio = (old_box[3]-old_box[1]) / (new_box[3]-new_box[1])
        cells[24:30] = [frame.resize((round(frame.width*ratio), round(frame.height*ratio)), Image.Resampling.NEAREST) for frame in replacement]
        source_rects[24:30] = rects
    boxes = [bounds(frame) for frame in cells]
    tallest = max(b[3]-b[1] for b in boxes)
    assert all(b[3]-b[1] >= tallest*.55 for b in boxes[:30]), f'{trainer_id}: incomplete standing frame'
    # Shared scale preserves proportions. Source cell center remains the x anchor;
    # normalizing each bounding-box center would make arms shift the whole body.
    extent = max(max(frame.width/2-box[0], box[2]-frame.width/2)
                 for frame, box in zip(cells, boxes))
    scale = min(70 / extent, 184 / max(b[3]-b[1] for b in boxes))
    sheet = Image.new('RGBA', (FRAME_W*COLS, FRAME_H*ROWS))
    for index, (cell, box) in enumerate(zip(cells, boxes)):
        crop = cell.crop(box)
        crop = crop.resize((max(1, round(crop.width*scale)), max(1, round(crop.height*scale))), Image.Resampling.NEAREST)
        resized_bounds = bounds(crop)
        crop = crop.crop(resized_bounds)
        x = round(FRAME_W/2 + (box[0]-cell.width/2)*scale) + resized_bounds[0]
        y = BASELINE-crop.height
        assert x >= 0 and x+crop.width <= FRAME_W and y >= 0
        sheet.alpha_composite(crop, ((index % COLS)*FRAME_W+x, (index//COLS)*FRAME_H+y))
    path = DEST / trainer_id / 'motion.webp'
    # Palette quantization compresses the drawing, retaining all real frames.
    # Test decoded frames, not merely file headers or declared manifest counts.
    # Pixel sprites use a binary outer alpha edge. Avoid extra alpha colors
    # stealing the palette and dropping the last visible foot pixel.
    sheet.putalpha(sheet.getchannel('A').point(lambda v: 255 if v > 12 else 0))
    for colors in [128, 96, 64, 48, 32, 24, 16]:
        packed = sheet.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).convert('RGBA')
        packed.save(path, lossless=True, method=6)
        if path.stat().st_size <= 150*1024:
            break
    if path.stat().st_size > 150*1024:
        for quality in [80, 70, 60, 50, 40]:
            sheet.save(path, quality=quality, method=6, alpha_quality=100)
            if path.stat().st_size <= 150*1024:
                break
    assert path.stat().st_size <= 150*1024, f'{trainer_id}: atlas over budget'
    decoded = Image.open(path).convert('RGBA')
    hashes, output_bounds = [], []
    for row in range(ROWS):
        row_hashes = []
        for col in range(COLS):
            frame = decoded.crop((col*FRAME_W, row*FRAME_H, (col+1)*FRAME_W, (row+1)*FRAME_H))
            b = bounds(frame)
            assert b[3] == BASELINE, f'{trainer_id}/{row}/{col}: foot at {b[3]}'
            output_bounds.append([b[0], b[1], b[2]-b[0], b[3]-b[1]])
            # Crop before hashing so translations cannot pass as distinct art.
            row_hashes.append(hashlib.sha256(frame.crop(b).tobytes()).hexdigest())
        assert len(set(row_hashes)) == 6, f'{trainer_id}/{POSES[row]}: repeated artwork'
        hashes.extend(row_hashes)
    manifest['trainers'][trainer_id]['motion'] = {
        'width': FRAME_W*COLS, 'height': FRAME_H*ROWS,
        'columns': COLS, 'rows': ROWS, 'frameWidth': FRAME_W,
        'frameHeight': FRAME_H, 'poses': POSES, 'framesPerState': COLS,
        'foot': [80, BASELINE], 'bounds': output_bounds,
        'frameHashes': hashes, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'bytes': path.stat().st_size, 'paletteColors': colors,
        'sourceRects': source_rects,
        'source': str((SOURCES / f'{trainer_id}.png').relative_to(ROOT)).replace('\\', '/'),
        'rowSources': [f'docs/art-sources/trainer-motion-six/{trainer_id}.png']*3
            + ['docs/art-sources/trainer-motion-six/brasa-follow.png']
            + [f'docs/art-sources/trainer-motion-six/{trainer_id}.png']*2
            if trainer_id == 'brasa' else ([f'docs/art-sources/trainer-motion-six/{trainer_id}.png']*4
                + ['docs/art-sources/trainer-motion-six/aren-celebrate.png']
                + [f'docs/art-sources/trainer-motion-six/{trainer_id}.png']) if trainer_id == 'aren'
            else [f'docs/art-sources/trainer-motion-six/{trainer_id}.png']*6,
    }
    return decoded


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('ids', nargs='*')
    args = parser.parse_args()
    manifest_file = DEST / 'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
    ids = args.ids or list(manifest['trainers'])
    review_dir = ROOT / 'docs/screenshots/visual-corrections'
    review_dir.mkdir(parents=True, exist_ok=True)
    for trainer_id in ids:
        decoded = package(trainer_id, manifest)
        preview = Image.new('RGB', (decoded.width, decoded.height+28), '#183344')
        preview.paste(decoded, (0, 28), decoded)
        ImageDraw.Draw(preview).text((12, 8), f'{trainer_id}: idle / prepare / throw / follow / celebrate / defeated; six frames each', fill='white')
        preview.save(review_dir / f'{trainer_id}-motion.jpg', quality=90)
        print(f'{trainer_id}: 36 decoded distinct drawings, {manifest["trainers"][trainer_id]["motion"]["bytes"]} bytes')
        current = json.loads(manifest_file.read_text(encoding='utf-8'))
        current['trainers'][trainer_id]['motion'] = manifest['trainers'][trainer_id]['motion']
        manifest_file.write_text(json.dumps(current, indent=2)+'\n', encoding='utf-8')
    # Read again before merging so another asset packaging job keeps its fields.
    current = json.loads(manifest_file.read_text(encoding='utf-8'))
    for trainer_id in ids:
        current['trainers'][trainer_id]['motion'] = manifest['trainers'][trainer_id]['motion']
    manifest_file.write_text(json.dumps(current, indent=2)+'\n', encoding='utf-8')
