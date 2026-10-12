import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './common.mjs';
import { createServer } from 'node:net';
let port=4175;
for(;port<4195;port++){
  const available=await new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});
  if(available)break;
}
if(port===4195)throw Error('没有可用的本地预览端口');
await mkdir(join(root,'.qa'),{recursive:true});const log=openSync(join(root,'.qa/preview-server.log'),'a');
const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:String(port)},detached:true,stdio:['ignore',log,log]});child.unref();
console.log(`http://localhost:${port}/`);
