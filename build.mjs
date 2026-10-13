import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const out=path.join(root,'dist');
await fs.rm(out,{recursive:true,force:true});
await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','src']) await fs.cp(path.join(root,name),path.join(out,name),{recursive:true});
await fs.mkdir(path.join(out,'assets'),{recursive:true});
for(const name of ['cover.png','pixel-characters.png','pixel-characters.json','pixel-npcs.png','pixel-npcs.json','manifest.json']) {
  await fs.copyFile(path.join(root,'assets',name),path.join(out,'assets',name));
}
console.log('Emberfall für die Veröffentlichung in dist/ vorbereitet.');
