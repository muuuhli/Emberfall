// Same existing pressure controller against either source tree, with the
// starter-consumable ambiguity removed on both sides of the comparison.
// node tests/scripts/v8-pressure-comparison-audit.mjs output.json [source-root]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceRoot=path.resolve(process.argv[3]||fileURLToPath(new URL('../..',import.meta.url)));
const output=path.resolve(process.argv[2]||'/tmp/emberfall-v8-pressure-comparison.json');
const original=await fs.readFile(path.join(sourceRoot,'tests/scripts/pressure-gameplay-audit.mjs'),'utf8');
let script=original.replace(/from (['"])\.\.\/\.\.\/src\/([^'"]+)\1/g,(_,quote,module)=>`from ${JSON.stringify(pathToFileURL(path.join(sourceRoot,'src',module)).href)}`);
const anchor='  const healing=Object.values(ITEMS).filter';
const cleanup="  for(const id of Object.keys(game.inventory))if(game.item(id)?.type==='consumable')delete game.inventory[id];\n";
if(script.split(anchor).length!==2)throw new Error('The existing pressure fixture changed; review the comparison adapter.');
script=script.replace(anchor,cleanup+anchor);
const metadata='healing:healing?.id,stats:game.stats()';
if(script.split(metadata).length!==2)throw new Error('The existing pressure metadata changed; review the comparison adapter.');
script=script.replace(metadata,'healing:healing?.id,initialHealingCount:healing?game.inventory[healing.id]:0,stats:game.stats()');
script=script.replace('talents at rank≤3 and five eligible healing consumables','talents at rank≤3 and exactly five eligible healing consumables after removing every starter consumable');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-pressure-comparison-'));
let exitCode;
try {
  const filename=path.join(temporary,'audit.mjs');await fs.writeFile(filename,script);
  exitCode=await new Promise((resolve,reject)=>{
    const auditProcess=spawn(globalThis.process.execPath,[filename,output],{cwd:sourceRoot,stdio:'inherit'});
    auditProcess.once('error',reject);auditProcess.once('exit',code=>resolve(code??1));
  });
} finally{await fs.rm(temporary,{recursive:true,force:true});}
if(exitCode!==0)process.exit(exitCode);
const audit=JSON.parse(await fs.readFile(output,'utf8'));
const sameInitialSupply=audit.results.length===54&&audit.results.every(result=>result.equipment.initialHealingCount===5);
const maximumPotions=Math.max(...audit.results.map(result=>result.actions.potion||0));
Object.assign(audit,{comparisonFixture:{sourceRoot,sourceScriptSha256:createHash('sha256').update(original).digest('hex'),starterConsumablesRemoved:true,
  initialHealingItems:5,all54SupplyChecks:sameInitialSupply,maximumPotionsUsed:maximumPotions,unchangedController:true}});
await fs.writeFile(output,JSON.stringify(audit,null,2));
console.log(JSON.stringify({output,comparisonFixture:audit.comparisonFixture}));
if(!sameInitialSupply||maximumPotions>5)process.exitCode=1;
