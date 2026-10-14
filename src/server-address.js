/** Player-selected authority origins. No credentials, tokens or paths are part
 * of the address; session resume data remains owned by NetworkClient. */
export const SERVER_ADDRESS_KEY='emberfall.server-address.v1';

export function normalizeServerAddress(value,{pageUrl=globalThis.location?.href||''}={}) {
  if(typeof value!=='string'||!value.trim()||value.length>2048)throw new Error('Gib die vollständige Adresse deines Emberfall-Spielservers ein.');
  let server;
  try{server=new URL(value.trim());}catch{throw new Error('Die Spielserveradresse muss mit https:// oder http:// beginnen.');}
  if(!['https:','http:'].includes(server.protocol)||!server.hostname||server.username||server.password||server.search||server.hash||server.pathname!=='/')
    throw new Error('Verwende die Serveradresse ohne Zugangsdaten, Dateipfad oder Zusatzparameter.');
  let page;
  try{page=new URL(pageUrl);}catch{}
  if(page?.protocol==='https:'&&server.protocol!=='https:')throw new Error('Diese Spielseite braucht einen Spielserver mit HTTPS.');
  return server.origin;
}

export function readPreferredServerAddress({storage=globalThis.localStorage,pageUrl=globalThis.location?.href||''}={}) {
  try {
    const saved=storage?.getItem(SERVER_ADDRESS_KEY);
    if(saved)return normalizeServerAddress(saved,{pageUrl});
  }catch{}
  try{return normalizeServerAddress(new URL(pageUrl).origin,{pageUrl});}catch{return '';}
}
