/* Equal cells and one shared crop preserve the frame baseline and generated alpha. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
async function main() {
  const original = await fs.readFile(process.argv[2]);
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let top = info.height, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] >= 160) { top = Math.min(top, y); bottom = Math.max(bottom, y + 1); }
  if (top >= bottom) throw new Error('Aura without visible alpha');
  top = Math.max(0, top - 12); bottom = Math.min(info.height, bottom + 12);
  const cells = [];
  for (let frame = 0; frame < 8; frame++) {
    const left = Math.floor(frame * info.width / 8), right = Math.floor((frame + 1) * info.width / 8);
    const input = await sharp(original).extract({left, top, width:right-left, height:bottom-top}).resize(256,256,{fit:'fill'}).png().toBuffer();
    cells.push({input, left:frame*256, top:0});
  }
  const output = await sharp({create:{width:2048,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(cells).webp({quality:85,alphaQuality:100,effort:6}).toBuffer();
  const directory = path.resolve(__dirname,'../client/public/battle-vfx');
  await fs.writeFile(path.join(directory,'frozen.webp'), output);
  const manifestPath = path.join(directory,'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath,'utf8')).filter(entry=>entry.id!=='frozen');
  manifest.push({id:'frozen',path:'/battle-vfx/frozen.webp',width:2048,height:256,columns:8,rows:1,framesPerClip:8,bytes:output.length,sha256:crypto.createHash('sha256').update(output).digest('hex'),originalSha256:crypto.createHash('sha256').update(original).digest('hex'),source:'OpenAI imagegen built-in; original project artwork; 2026-10-03',encoding:'Eight equal frames; shared alpha crop; 256px cells; WebP85 alpha100'});
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  console.log({bytes:output.length,top,bottom,width:2048,height:256});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
