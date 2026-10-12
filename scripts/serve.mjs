import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './common.mjs';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.zip':'application/zip'};
export function serve(port=4175){const server=createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname.split('/').some(x=>x.startsWith('.')||x==='node_modules')||pathname.startsWith('/scripts/')||pathname.startsWith('/tests/'))throw Error('Not found');
  let file=resolve(root,`.${pathname}`);if(file!==root&&!file.startsWith(root+sep))throw Error('Not found');
  if((await stat(file)).isDirectory())file=resolve(file,'index.html');
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
}catch{res.writeHead(404);res.end('Not found');}});server.listen(port,'127.0.0.1');return server;}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const server=serve(Number(process.env.PORT)||4175);server.on('listening',()=>console.log(`Live2D preview: http://localhost:${server.address().port}/`));}
