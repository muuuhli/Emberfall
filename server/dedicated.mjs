import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server.mjs';
const projectRoot=fileURLToPath(new URL('..',import.meta.url));

export function dedicatedConfig(env=process.env,{cwd=process.cwd()}={}){
  const port=Number(env.PORT||4173),host=env.HOST||'127.0.0.1',maxRooms=Number(env.EMBERFALL_MAX_ROOMS||32);
  if(!Number.isInteger(port)||port<1||port>65535)throw new RangeError('PORT muss zwischen 1 und 65535 liegen.');
  if(!['127.0.0.1','0.0.0.0','::1','::'].includes(host))throw new RangeError('HOST muss eine lokale Bindeadresse sein.');
  if(!Number.isInteger(maxRooms)||maxRooms<1||maxRooms>32)throw new RangeError('EMBERFALL_MAX_ROOMS muss zwischen 1 und 32 liegen.');
  let allowedOrigin=null;
  if(env.EMBERFALL_ALLOWED_ORIGIN){
    let url;try{url=new URL(env.EMBERFALL_ALLOWED_ORIGIN);}catch{throw new TypeError('Der freigegebene Spielursprung muss eine vollständige URL sein.');}
    const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!(url.protocol==='https:'||url.protocol==='http:'&&local))throw new TypeError('Erlaube genau einen HTTPS-Spielursprung; lokales HTTP ist nur auf Loopback zulässig.');
    allowedOrigin=url.origin;
  }
  const dataDirectory=path.resolve(cwd,env.EMBERFALL_DATA_DIR||'.emberfall-server');
  assertPrivateDirectory(dataDirectory,cwd);
  return {port,host,maxRooms,allowedOrigin,dataDirectory,storagePath:path.join(dataDirectory,'rooms.json')};
}
function assertPrivateDirectory(directory,cwd){
  if(directory===path.parse(directory).root||[path.resolve(cwd),path.resolve(projectRoot)].some(root=>directory===root||['src','assets','dist'].some(name=>{const publicRoot=path.join(root,name);return directory===publicRoot||directory.startsWith(publicRoot+path.sep);})))throw new TypeError('Spielstände benötigen ein eigenes privates Verzeichnis außerhalb von src, assets und dist.');
}
async function probeStorage(config,cwd){
  await fs.mkdir(config.dataDirectory,{recursive:true,mode:0o700});
  const actual=await fs.realpath(config.dataDirectory);assertPrivateDirectory(actual,cwd);
  const first=path.join(actual,`.write-probe-${randomUUID()}`),second=`${first}.renamed`;
  let file;
  try{file=await fs.open(first,'wx',0o600);await file.writeFile('emberfall');await file.close();file=null;await fs.rename(first,second);}
  finally{await file?.close();await Promise.all([fs.rm(first,{force:true}),fs.rm(second,{force:true})]);}
  return {...config,dataDirectory:actual,storagePath:path.join(actual,'rooms.json')};
}

/** Persistent Node process; importing this entry point opens no sockets. */
export async function startDedicatedServer({env=process.env,cwd=process.cwd(),autoTick=true,port}={}){
  const config=await probeStorage(dedicatedConfig(env,{cwd}),cwd);
  if(port!==undefined)config.port=port;
  const running=await startServer({...config,autoTick,health:true,strictStorage:true});
  return {...running,config};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  try{
    const running=await startDedicatedServer();
    console.log(`Emberfall-Spielserver bereit auf ${running.host}:${running.port} · /healthz`);
    const shutdown=()=>running.close().then(()=>process.exit(0));
    process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  }catch(error){console.error(`Emberfall-Spielserver konnte nicht sicher starten: ${error.message}`);process.exitCode=1;}
}
