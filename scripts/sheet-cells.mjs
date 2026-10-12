export function cellText(cell){const value=cell?.value??cell;if(value==null)return '';if(typeof value==='string'||typeof value==='number')return String(value).trim();if(Array.isArray(value))return value.map(cellText).join(' ').trim();return String(value.text||value.name||value.file_name||'').trim();}
export function fileRefs(cell){
  const found=new Map();
  function visit(value){
    if(!value)return;
    if(Array.isArray(value)){value.forEach(visit);return;}
    if(typeof value==='object'){
      const token=value.attachment_token||value.fileToken||value.file_token||value.token;
      if(token)found.set(token,{token,name:value.name||value.file_name||value.text||'',size:Number(value.size||value.file_size||0),modified:value.modified_time||value.update_time||'',mime:value.mime_type||value.mimeType||''});
      for(const v of Object.values(value))if(typeof v==='object')visit(v);
    }else if(typeof value==='string'){for(const token of value.match(/\bbox[a-zA-Z0-9_-]+\b/g)||[])if(!found.has(token))found.set(token,{token});}
  }
  // cells-get keeps attachment identities in rich_text; value contains only the displayed filename.
  visit(cell);return [...found.values()];
}
