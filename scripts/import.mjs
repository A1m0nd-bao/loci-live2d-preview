import { resolve } from 'node:path';
import { importPackage } from './packages.mjs';
import { generateManifest } from './generate-manifest.mjs';
const files=process.argv.slice(2);if(!files.length){console.error('Usage: npm run import -- /absolute/path/model.zip [...]');process.exit(1);}
for(const file of files){const pkg=await importPackage(resolve(file));console.log(`Imported ${pkg.items.length} models: ${file}`);}
await generateManifest();
