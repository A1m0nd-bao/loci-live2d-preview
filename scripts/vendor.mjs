import { copyFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { root } from './common.mjs';
const require=createRequire(import.meta.url);const {icons}=require('lucide');
await mkdir(join(root,'assets'),{recursive:true});
function svg(node){const [tag,props,children=[]]=node;return `<${tag} ${Object.entries(props).map(([k,v])=>`${k}="${v}"`).join(' ')}>${children.map(svg).join('')}</${tag}>`;}
const standing=structuredClone(icons.PersonStanding);standing[1].width=120;standing[1].height=160;standing[1].stroke='#7e6999';standing[1]['stroke-width']=.9;
await writeFile(join(root,'assets/character-placeholder.svg'),svg(standing));
for(const [src,dest]of [['fflate/umd/index.js','fflate.js'],['lucide/dist/umd/lucide.min.js','lucide.js']])await copyFile(join(root,'node_modules',src),join(root,'vendor',dest));
