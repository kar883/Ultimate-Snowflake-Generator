import fs from 'fs';
import path from 'path';

const pngPath = path.resolve('build/icon.png');
const icoPath = path.resolve('build/icon.ico');
const pngData = fs.readFileSync(pngPath);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: ICO
header.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // width 0 means 256
entry.writeUInt8(0, 1); // height 0 means 256
entry.writeUInt8(0, 2); // color count
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(pngData.length, 8); // bytes in resource
entry.writeUInt32LE(6 + 16, 12); // image offset

fs.writeFileSync(icoPath, Buffer.concat([header, entry, pngData]));
console.log('✓ Created', icoPath, 'size', fs.statSync(icoPath).size);
