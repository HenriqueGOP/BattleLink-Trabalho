"""Export the imagegen impact atlas as local WebP without redrawing effects."""
from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / 'docs/art-sources/battle-impacts/impacts.png'
target = root / 'client/public/battle-vfx/impacts.webp'
image = Image.open(source).convert('RGBA')
assert image.getchannel('A').getextrema()[0] == 0
image.save(target, quality=82, method=6, alpha_quality=100)
decoded = Image.open(target).convert('RGBA')
assert decoded.size == image.size
assert decoded.getchannel('A').getextrema()[0] == 0
manifest_path = target.parent / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
entry = {
    'id': 'impacts', 'path': '/battle-vfx/impacts.webp',
    'width': image.width, 'height': image.height,
    'columns': 8, 'rows': 8, 'framesPerClip': 8,
    'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'originalSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'source': 'OpenAI imagegen built-in, original project artwork; docs/art-sources/battle-impacts/impacts.png; 2026-10-04',
    'encoding': 'WebP quality82 alpha100; unchanged full atlas, eight local impact sequences',
}
manifest = [old for old in manifest if old['id'] != entry['id']] + [entry]
manifest_path.write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
print(f'Impact atlas: {image.width}x{image.height}, {target.stat().st_size} bytes')
