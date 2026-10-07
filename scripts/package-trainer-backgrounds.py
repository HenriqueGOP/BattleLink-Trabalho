"""Copy built-in imagegen originals and encode viewport/arena backgrounds."""
from pathlib import Path
import json
import shutil
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'docs/art-sources/trainer-backgrounds'
generated_paths = SOURCES / 'generated-paths.json'
if generated_paths.exists():
    for trainer_id, filename in json.loads(generated_paths.read_text(encoding='utf-8')).items():
        shutil.copyfile(filename, SOURCES / f'{trainer_id}.png')

prompts = json.loads((SOURCES / 'prompts.json').read_text(encoding='utf-8'))
manifest_path = ROOT / 'client/public/trainers/manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
review = Image.new('RGB', (1200, 1072), '#092032')
draw = ImageDraw.Draw(review)

for index, item in enumerate(prompts['assets']):
    trainer_id = item['id']
    original = Image.open(SOURCES / f'{trainer_id}.png').convert('RGB')
    background = ImageOps.fit(original, (1600, 900), method=Image.Resampling.LANCZOS)
    target = ROOT / f'client/public/trainers/{trainer_id}/background.webp'
    quality = 88
    while True:
        background.save(target, quality=quality, method=6)
        if target.stat().st_size <= 350000:
            break
        quality -= 4
        if quality < 56:
            raise ValueError(f'{trainer_id}: exceeds background byte budget')
    manifest['trainers'][trainer_id]['background'] = {
        'path': f'/trainers/{trainer_id}/background.webp',
        'width': 1600, 'height': 900, 'bytes': target.stat().st_size,
        'alpha': False, 'position': 'center center',
        'source': f'docs/art-sources/trainer-backgrounds/{trainer_id}.png',
    }
    col, row = index % 3, index // 3
    preview = background.resize((388, 218), Image.Resampling.LANCZOS)
    review.paste(preview, (col * 400 + 6, row * 268 + 30))
    draw.text((col * 400 + 8, row * 268 + 8), trainer_id, fill='white')
    print(f'{trainer_id}: {original.size} -> 1600x900, {target.stat().st_size} bytes')

# Reload immediately before merging: the motion packager may update its entries.
latest = json.loads(manifest_path.read_text(encoding='utf-8'))
for trainer_id in manifest['trainers']:
    latest['trainers'][trainer_id]['background'] = manifest['trainers'][trainer_id]['background']
manifest_path.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
review.save(SOURCES / 'background-review.jpg', quality=90)
