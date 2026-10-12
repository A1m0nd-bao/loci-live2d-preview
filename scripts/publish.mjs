import { run } from './common.mjs';
const gh='/opt/homebrew/bin/gh';
await run('git',['add','--','index.html','styles.css','app.js','player.js','model-files.js','layers.js','render.html','render.js','manifest.json','vendor','assets','models','packages','posters','.nojekyll','.gitignore','package.json','package-lock.json','lark-sync.config.json','scripts','tests','README.md']);
const staged=await run('git',['diff','--cached','--name-only']);
if(staged.trim())await run('git',['commit','-m',`Sync Live2D library ${new Date().toISOString()}`]);
await run('git',['-c','credential.helper=','-c',`credential.helper=!${gh} auth git-credential`,'push','origin','main']);
console.log('Live2D library pushed to GitHub Pages.');
