import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const out=path.join(root,'dist');
await fs.mkdir(out,{recursive:true});
for(const name of ['index.html','src','assets']) await fs.cp(path.join(root,name),path.join(out,name),{recursive:true});
console.log('Emberfall für die Veröffentlichung in dist/ vorbereitet.');
