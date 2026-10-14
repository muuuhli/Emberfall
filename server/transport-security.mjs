import {isIP} from 'node:net';

const normalize=value=>String(value||'').replace(/^::ffff:/,'');
const ipv4=value=>value.split('.').reduce((number,part)=>(number*256+Number(part))>>>0,0);

export function accountTransportOptions(env={}) {
  const maxAccounts=Number(env.EMBERFALL_MAX_ACCOUNTS??128);
  if(!Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>128)throw new RangeError('EMBERFALL_MAX_ACCOUNTS muss zwischen 1 und 128 liegen.');
  const boolean=name=>{const value=env[name]??'0';if(!['0','1'].includes(value))throw new TypeError(`${name} muss 0 oder 1 sein.`);return value==='1';};
  const requireSecure=boolean('EMBERFALL_AUTH_REQUIRE_HTTPS'),cookieSecure=boolean('EMBERFALL_AUTH_COOKIE_SECURE');
  let secureOrigin=null;
  if(env.EMBERFALL_SECURE_ORIGIN){
    const url=new URL(env.EMBERFALL_SECURE_ORIGIN);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new TypeError('Die sichere Konto-Adresse muss ein HTTPS-Ursprung sein.');
    secureOrigin=url.origin;
  }
  if(requireSecure&&(!cookieSecure||!secureOrigin))throw new TypeError('Produktive Konten brauchen Secure-Cookies und einen HTTPS-Ursprung.');
  const trusted=String(env.EMBERFALL_TRUSTED_PROXY_CIDR||'').split(',').filter(Boolean).map(value=>{
    const parts=value.trim().split('/'),bits=Number(parts[1]);
    if(parts.length!==2||isIP(parts[0])!==4||!/^\d{1,2}$/.test(parts[1])||bits<8||bits>32)throw new TypeError('Vertraute Proxys brauchen ein enges IPv4-CIDR zwischen /8 und /32.');
    const mask=(0xffffffff<<(32-bits))>>>0;return{network:(ipv4(parts[0])&mask)>>>0,mask};
  });
  const proxyTrusted=req=>{const address=normalize(req.socket?.remoteAddress);return isIP(address)===4&&trusted.some(({network,mask})=>((ipv4(address)&mask)>>>0)===network);};
  const isSecure=req=>{
    const host=String(req.headers?.host||'').toLowerCase();
    if(secureOrigin&&host!==new URL(secureOrigin).host.toLowerCase())return false;
    return !!req.socket?.encrypted||proxyTrusted(req)&&req.headers?.['x-forwarded-proto']==='https';
  };
  const clientAddress=req=>{
    const direct=normalize(req.socket?.remoteAddress)||'local';
    if(proxyTrusted(req)){const forwarded=req.headers?.['x-forwarded-for'];if(typeof forwarded==='string'&&isIP(forwarded.trim()))return normalize(forwarded.trim());}
    return direct;
  };
  return {requireSecure,cookieSecure,secureOrigin,isSecure,clientAddress,maxAccounts};
}
