/* Empacotamento de formato apenas: mantém dimensões, frames e alpha da arte gerada. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
async function main() {
  const source = process.argv[2];
  if (!source) throw new Error('Informe o diretório dos três PNGs originais.');
  const output = path.resolve(__dirname, '../client/public/battle-vfx');
  await fs.mkdir(output, {recursive: true});
  const files = [
    ['attacks', 'exec-ba2a741c-d9e6-476e-b10d-eb183226f2e7.png'],
    ['statuses', 'exec-e480b374-479c-4c39-8867-034a3457212e.png'],
    ['transitions', 'exec-9e8c8cbd-32a8-4123-b489-3d61a36053df.png'],
  ];
  const manifest = [];
  for (const [id, name] of files) {
    const bytes = await fs.readFile(path.join(source, name));
    const metadata = await sharp(bytes).metadata();
    if (!metadata.hasAlpha) throw new Error('A arte precisa de transparência.');
    const packed = await sharp(bytes).webp({quality: 82, alphaQuality: 100, effort: 6}).toBuffer();
    await fs.writeFile(path.join(output, id + '.webp'), packed);
    manifest.push({id, path: '/battle-vfx/' + id + '.webp', width: metadata.width, height: metadata.height,
      columns: 8, rows: 8, framesPerClip: 8, bytes: packed.length,
      sha256: crypto.createHash('sha256').update(packed).digest('hex'),
      originalSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      source: 'OpenAI imagegen built-in; original project artwork; 2026-10-02',
      encoding: 'WebP quality82 alpha100; no art retouch, resize or frame rearrangement'});
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(manifest.map(({id, bytes, width, height}) => ({id, bytes, width, height})));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
