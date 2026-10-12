import { readFile } from 'node:fs/promises';
export async function fileTypeFromFile(file){const b=await readFile(file);if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';if(b[0]===255&&b[1]===216&&b[2]===255)return 'jpg';if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return 'webp';throw Error('封面必须为 PNG、JPG 或 WebP 图片');}
