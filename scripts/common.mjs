import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function json(file, fallback) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (fallback !== undefined && error.code === 'ENOENT') return fallback; throw error; } }
export async function save(file, value) { await mkdir(dirname(file), {recursive:true}); await writeFile(file,`${JSON.stringify(value,null,2)}\n`); }
export function run(cmd,args,options={}) { return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{cwd:root,stdio:['ignore','pipe','pipe'],...options});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(`${cmd} failed (${code}): ${err || out}`)));}); }
export const urlPath = value => value.split('/').map(encodeURIComponent).join('/');
export const statePath = join(root,'.sync/state.json');
