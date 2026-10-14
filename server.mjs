import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './src/game.js';
import { MultiplayerHub, createFileRoomStorage } from './server/multiplayer.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
const sourceExtensions=new Set(['.js','.css','.json']);
const assetExtensions=new Set(['.png','.webp','.svg','.ico','.json']);

/** Starts one real cooperative server. Importing this module opens no ports. */
export async function startServer({port=Number(process.env.PORT||4173),host=process.env.HOST||'127.0.0.1',storagePath=path.join(root,'.emberfall-server','rooms.json'),autoTick=true,allowedOrigin=null,health=false,strictStorage=false,maxRooms=32}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new RangeError('PORT muss eine gültige Portnummer sein.');
  const storage=storagePath?createFileRoomStorage(storagePath,{strictRead:strictStorage}):null;
  const hub=new MultiplayerHub({createGame:()=>new Game({storage:null}),storage,autoStart:autoTick,allowedOrigin,maxRooms,strictRestore:strictStorage});
  const server=http.createServer(async(req,res)=>{
    try {
      if(health&&req.url?.split('?')[0]==='/healthz'){
        if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
        const ready=!hub.lastStorageError,body=JSON.stringify({status:ready?'ready':'degraded',protocol:1,service:'emberfall-authority'});
        res.writeHead(ready?200:503,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(req.method==='HEAD'?undefined:body);return;
      }
      if(await hub.handle(req,res))return;
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
      const url=new URL(req.url,'http://localhost');
      let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{res.writeHead(400).end();return;}
      if(pathname==='/')pathname='/index.html';
      const segments=pathname.split('/').filter(Boolean);
      if(segments.some(segment=>segment.startsWith('.')||segment.includes('\\')||segment.includes('\0'))){res.writeHead(404).end();return;}
      const extension=path.extname(pathname).toLowerCase();
      const isIndex=pathname==='/index.html';
      const isSource=segments[0]==='src'&&sourceExtensions.has(extension);
      const isAsset=segments[0]==='assets'&&assetExtensions.has(extension);
      if(!isIndex&&!isSource&&!isAsset){res.writeHead(404).end('Nicht gefunden');return;}
      const file=path.resolve(root,'.'+pathname);
      const realFile=await fs.realpath(file);
      const permittedRoot=isSource?path.join(root,'src'):isAsset?path.join(root,'assets'):path.join(root,'index.html');
      if(isIndex?realFile!==permittedRoot:!realFile.startsWith(permittedRoot+path.sep)){res.writeHead(404).end();return;}
      const stat=await fs.stat(realFile);if(!stat.isFile()){res.writeHead(404).end();return;}
      const headers={'Content-Type':mime[extension],'Content-Length':stat.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'};
      res.writeHead(200,headers);
      if(req.method==='HEAD'){res.end();return;}
      res.end(await fs.readFile(realFile));
    } catch(error) {
      if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500).end('Nicht gefunden');else res.end();
    }
  });
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
  } catch(error){hub.dispose();throw error;}
  let closing;
  const close=()=>closing??=(async()=>{
    hub.dispose();
    const stopped=new Promise(resolve=>server.close(resolve));
    server.closeIdleConnections?.();
    const timer=setTimeout(()=>server.closeAllConnections?.(),2000);timer.unref?.();
    await stopped;clearTimeout(timer);
  })();
  const actualPort=server.address().port;
  return {server,hub,close,port:actualPort,host,origin:`http://${host.includes(':')?`[${host}]`:host}:${actualPort}`};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
  try {
    const running=await startServer();
    console.log(`Emberfall läuft auf http://localhost:${running.port}`);
    if(running.host==='0.0.0.0')console.log(`Gruppenspiel im LAN: http://<IP dieses Rechners>:${running.port}`);
    const shutdown=()=>{running.close().then(()=>process.exit(0));};
    process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  } catch(error){console.error(`Emberfall konnte nicht starten: ${error.message}`);process.exitCode=1;}
}
