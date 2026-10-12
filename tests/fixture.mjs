import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { root } from '../scripts/common.mjs';
import { references } from '../model-files.js';
const base='https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/Samples/Resources/Hiyori/';
const response=await fetch(`${base}Hiyori.model3.json`);if(!response.ok)throw Error('Sample download failed');const manifest=await response.json();
const files={'Hiyori/Hiyori.model3.json':strToU8(JSON.stringify(manifest))};
for(const file of references(manifest)){const r=await fetch(new URL(file,base));if(!r.ok)throw Error(`Sample dependency ${file}: ${r.status}`);files[`Hiyori/${file}`]=new Uint8Array(await r.arrayBuffer());}
await mkdir(join(root,'.qa'),{recursive:true});
await writeFile(join(root,'.qa/hiyori.zip'),zipSync(files,{level:6}));
console.log(`Official Live2D sample cached: ${Object.keys(files).length} files, tests only`);
