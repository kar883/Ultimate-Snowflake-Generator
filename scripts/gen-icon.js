import * as Jimp from 'jimp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

async function main(){
  const outDir = path.resolve('build');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  const pngPath = path.join(outDir,'icon.png');
  const icoPath = path.join(outDir,'icon.ico');

  const image = new Jimp.Jimp({ width: 256, height: 256 });
  image.scan(0,0,image.bitmap.width,image.bitmap.height,(x,y,idx)=>{
    const cx=128, cy=128;
    const d=Math.hypot(x-cx,y-cy)/128;
    const c = Math.max(0,Math.min(1,1-d));
    const r= Math.floor(255*c + 30*(1-c));
    const g= Math.floor(180*c + 30*(1-c));
    const b= Math.floor(255*c + 30*(1-c));
    image.bitmap.data[idx+0]=b;
    image.bitmap.data[idx+1]=g;
    image.bitmap.data[idx+2]=r;
    image.bitmap.data[idx+3]=255;
  });
  await new Promise((resolve, reject) => image.write(pngPath, err => err ? reject(err) : resolve()));
  const icoBuf = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuf);
  console.log('✓ Created', icoPath);
}
main().catch(e=>{console.error(e); process.exit(1);});