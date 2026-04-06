import Jimp from 'jimp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

async function main(){
  const outDir = path.resolve('build');
  const assetsDir = path.resolve('assets');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  if(!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir,{recursive:true});
  
  const pngPath = path.join(assetsDir,'icon.png');
  const icoPath = path.join(outDir,'icon.ico');

  // Create 1024x1024 icon for high-DPI displays (using new Jimp API)
  const image = new Jimp(1024, 1024, 0x00000000);
  image.scan(0,0,image.bitmap.width,image.bitmap.height,(x,y,idx)=>{
    const cx=512, cy=512;
    const d=Math.hypot(x-cx,y-cy)/512;
    const c = Math.max(0,Math.min(1,1-d));
    const r= Math.floor(255*c + 30*(1-c));
    const g= Math.floor(180*c + 30*(1-c));
    const b= Math.floor(255*c + 30*(1-c));
    image.bitmap.data[idx+0]=b;
    image.bitmap.data[idx+1]=g;
    image.bitmap.data[idx+2]=r;
    image.bitmap.data[idx+3]=255;
  });
  
  await image.writeAsync(pngPath);
  const icoBuf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuf);
  console.log('✓ Created 1024x1024 icon:', pngPath);
  console.log('✓ Created ICO:', icoPath);
}
main().catch(e=>{console.error(e); process.exit(1);});
