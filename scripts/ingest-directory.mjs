import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { root, json, save, run } from './common.mjs';
import { references, resourcePath, inspectModel } from '../model-files.js';
import { fileRefs, cellText } from './sheet-cells.mjs';

const directory=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node scripts/ingest-directory.mjs /path/to/delivery [--upload] [--write]');
const batchId=basename(directory), batchDir=join(root,'.sync/ingest',batchId);
await mkdir(batchDir,{recursive:true});
const stateFile=join(batchDir,'batch.json');
const state=await json(stateFile,{directory,items:[]});
const source=await json(join(directory,'sources.json'));
const expected=Number(process.argv.find(arg=>arg.startsWith('--expected='))?.split('=')[1]||79);
if(!Number.isInteger(expected)||expected<1||source.length!==expected||new Set(source.map(x=>x.modelName)).size!==expected)throw Error(`Expected exactly ${expected} unique character models`);
const entries=[];
for(const entry of source){
  const modelDir=join(directory,'characters',entry.modelName);
  const manifest=await json(join(modelDir,'model.model3.json'));
  const needed=new Set(['model.model3.json',...references(manifest).map(x=>resourcePath('model.model3.json',x))]);
  const files={};let runtimeSize=0;
  for(const name of needed){const bytes=await readFile(join(modelDir,name));files[`${entry.modelName}/${name}`]=bytes;runtimeSize+=bytes.length;}
  const meta=inspectModel(`${entry.modelName}/model.model3.json`,manifest,new Set(Object.keys(files)));
  const zipName=`${String(entry.index).padStart(3,'0')}-${entry.modelName}.zip`;
  const zip=zipSync(files,{level:6,mtime:new Date('2026-10-10T00:00:00Z')});
  const hash=createHash('sha256').update(zip).digest('hex');
  const saved=state.items.find(x=>x.index===entry.index&&x.hash===hash);
  const record={...saved,index:entry.index,row:entry.index+1,name:entry.name.replace(/\.psd$/i,''),modelName:entry.modelName,zipName,zipPath:join(batchDir,zipName),hash,size:zip.length,runtimeSize,...meta};
  await writeFile(record.zipPath,zip);entries.push(record);
}
state.items=entries;await save(stateFile,state);
console.log(JSON.stringify({models:entries.length,zipMB:+(entries.reduce((n,x)=>n+x.size,0)/1024/1024).toFixed(1),runtimeMB:+(entries.reduce((n,x)=>n+x.runtimeSize,0)/1024/1024).toFixed(1),maxZipMB:+(Math.max(...entries.map(x=>x.size))/1024/1024).toFixed(1),motions:[Math.min(...entries.map(x=>x.motionCount)),Math.max(...entries.map(x=>x.motionCount))]},null,2));

const config=await json(join(root,'lark-sync.config.json'));
async function upload(filePath,fileName,size){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const out=JSON.parse(await run('lark-cli',['api','POST','/open-apis/drive/v1/medias/upload_all','--as',config.identity,'--data',JSON.stringify({file_name:fileName,parent_type:'sheet_file',parent_node:config.spreadsheetToken,size}),'--file',`file=${relative(root,filePath)}`]));
      const token=out.data?.file_token||out.data?.data?.file_token;
      if(!token)throw Error(`Feishu upload failed: ${JSON.stringify(out)}`);return token;
    }catch(error){if(attempt===2||!/TLS|timeout|network|ECONNRESET|rate.limit/i.test(error.message))throw error;console.log(`[retry] ${fileName}`);await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
  }
}
async function read(range,include='value'){
  const out=JSON.parse(await run('lark-cli',['sheets','+cells-get','--spreadsheet-token',config.spreadsheetToken,'--sheet-id',config.sheetId,'--range',range,'--include',include,'--as',config.identity,'--max-chars','1000000']));
  if(!out.ok||out.data.has_more||out.data.ranges.some(x=>x.truncated))throw Error('Incomplete Feishu read');return out.data.ranges;
}
if(process.argv.includes('--upload')){
  for(const entry of entries){
    if(entry.token)continue;
    if(entry.size>20*1024*1024)throw Error(`Requires multipart upload: ${entry.zipName}`);
    entry.token=await upload(entry.zipPath,entry.zipName,entry.size);await save(stateFile,state);console.log(`[upload ${entry.index}/${expected}] ${entry.name}`);
  }
}
if(process.argv.includes('--covers')){
  for(const entry of entries){if(entry.posterToken)continue;const file=join(batchDir,'previews',`${entry.index}.png`);entry.posterSize=(await stat(file)).size;entry.posterName=`${String(entry.index).padStart(3,'0')}-${entry.modelName}.png`;entry.posterToken=await upload(file,entry.posterName,entry.posterSize);await save(stateFile,state);console.log(`[cover ${entry.index}/${expected}] ${entry.name}`);}
}
if(process.argv.includes('--write')){
  if(expected!==79)throw Error('Initial row-position write supports only the original 79-model delivery');
  if(entries.some(x=>!x.token))throw Error('Upload all packages before writing sheet');
  const existing=await read('A2:L80');
  for(const range of existing)for(let i=0;i<range.cells.length;i++){
    const cells=range.cells[i];if(!cells.some(c=>c.value||c.rich_text))continue;
    const entry=entries.find(x=>x.row===range.row_indices[i]);
    if(cellText(cells[0])!==entry.name||fileRefs(cells[3])[0]?.token!==entry.token)throw Error(`Row ${range.row_indices[i]} contains unrelated existing content; refusing overwrite`);
  }
  const template=(await read('A2:L2','style'))[0].cells[0];
  const cells=entries.map(entry=>{
    const values=[entry.name,'角色交互','手势,嘴型,9向,PSD图层顺序',null,'','Idle','0','显示','保留源 PSD 图层顺序；视觉验收待确认。','','','2026-10-12'];
    return values.map((value,j)=>{
      const cell={cell_styles:template[j].cell_styles||{font_size:13,vertical_alignment:'middle'}};
      if(template[j].border_styles)cell.border_styles=template[j].border_styles;
      if(j===3)cell.rich_text=[{type:'attachment',text:entry.zipName,attachment_name:entry.zipName,attachment_token:entry.token,file_size:entry.size,mime_type:'application/zip'}];
      else if(j===4&&entry.posterToken)cell.rich_text=[{type:'attachment',text:entry.posterName,attachment_name:entry.posterName,attachment_token:entry.posterToken,file_size:entry.posterSize,mime_type:'image/png'}];
      else cell.value=value;
      return cell;
    });
  });
  const payload=join('/tmp',`live2d-${batchId}-cells.json`);await save(payload,cells);
  const output=await run('lark-cli',['sheets','+cells-set','--spreadsheet-token',config.spreadsheetToken,'--sheet-id',config.sheetId,'--range','A2:L80','--as',config.identity,'--cells','-'],{stdio:['pipe','pipe','pipe'],input:JSON.stringify(cells)});
  console.log(output);
  const actual=(await read('A2:L80')).flatMap(r=>r.cells.map((row,i)=>({number:r.row_indices[i],name:cellText(row[0]),refs:fileRefs(row[3]),covers:fileRefs(row[4])})));
  if(actual.length!==expected)throw Error('Sheet record count mismatch');
  for(const entry of entries){const row=actual.find(x=>x.number===entry.row);if(row.name!==entry.name||row.refs.length!==1||row.refs[0].token!==entry.token||entry.posterToken&&row.covers[0]?.token!==entry.posterToken)throw Error(`Sheet verification failed: ${entry.row}`);}
  state.written=true;await save(stateFile,state);console.log(`Verified ${expected} complete Feishu rows (A2:L80)`);
}
