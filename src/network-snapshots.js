// Optional transport for protocol-1 snapshots. State signatures are immutable
// JSON strings: a later Game mutation cannot silently mutate a stream baseline.
const RESERVED=new Set(['protocol','sequence','snapshotContext','snapshotDelta']);
const STICKY=new Set(['layout','pvpTravelSave']);
const UNSAFE=new Set(['__proto__','prototype','constructor']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const safeKeys=value=>record(value)&&Object.keys(value).every(key=>!UNSAFE.has(key));
const validId=id=>typeof id==='string'||typeof id==='number'&&Number.isFinite(id);
const keyed=value=>Array.isArray(value)&&value.every(row=>record(row)&&validId(row.id))&&new Set(value.map(row=>row.id)).size===value.length;
const immutableStates=new WeakMap();
const RECORD_FIELDS=new Set(['player','dungeonInstance','authoritativeDungeonCheckpoint','pvp','resources','cooldowns','techniqueSpecializations','deathPenalty','ledger','questState','dungeonProgress','dungeonRecords','endgame']);

/** A frame-local cache can be shared by a hub; it never spans Game updates. */
export function createSnapshotSignatureCache(){
  const values=new WeakMap();
  return value=>{
    if(value&&typeof value==='object'){
      let json=values.get(value);if(json!==undefined)return json;
      json=JSON.stringify(value);values.set(value,json);return json;
    }
    return JSON.stringify(value);
  };
}

function fieldState(value,stringify,depth=0){
  const cached=value&&typeof value==='object'&&immutableStates.get(value);if(cached)return cached;
  if(depth>0&&record(value))return {fields:new Map(Object.entries(value).filter(([,entry])=>entry!==undefined).map(([key,entry])=>[key,fieldState(entry,stringify,depth-1)]))};
  if(!keyed(value))return {json:stringify(value)};
  const rows=new Map(value.map(row=>[row.id,stringify(row)])),order=value.map(row=>row.id);
  return {rows,order};
}
/** Use only for detached metadata; never freezes or retains a Game reference. */
export function immutableSnapshotValue(value){
  const copy=clone(value),state=fieldState(copy,JSON.stringify);
  const freeze=entry=>{if(entry&&typeof entry==='object'){for(const child of Object.values(entry))freeze(child);Object.freeze(entry);}};
  freeze(copy);immutableStates.set(copy,state);return copy;
}
function sameField(before,after){
  if(!before)return false;if(before===after)return true;
  if(before.fields&&after.fields)return before.fields.size===after.fields.size&&[...after.fields].every(([key,value])=>sameField(before.fields.get(key),value));
  if(before.fields||after.fields)return false;
  if(before.rows&&after.rows)return before.order.length===after.order.length&&before.order.every((id,index)=>id===after.order[index]&&before.rows.get(id)===after.rows.get(id));
  return !before.rows&&!after.rows&&before.json===after.json;
}
function stateOf(snapshot,context,stringify,previous){
  const top=new Map(),world=new Map();
  for(const [key,value]of Object.entries(snapshot))if(key!=='world'&&!RESERVED.has(key)&&value!==undefined)top.set(key,fieldState(value,stringify,RECORD_FIELDS.has(key)?4:0));
  for(const key of STICKY)if(!top.has(key)&&previous?.top.has(key))top.set(key,previous.top.get(key));
  for(const [key,value]of Object.entries(snapshot.world||{}))if(value!==undefined)world.set(key,fieldState(value,stringify));
  return {sequence:snapshot.sequence,context,top,world};
}
function arrayChanges(before,after,value,stringify){
  const added=[],removed=[],updated=[];
  for(const id of before.order)if(!after.rows.has(id))removed.push(id);
  for(const row of value){
    const prior=before.rows.get(row.id),current=after.rows.get(row.id);
    if(prior===undefined){added.push(row);continue;}
    if(prior===current)continue;
    const old=JSON.parse(prior),changed={},deleted=[];
    for(const [key,entry]of Object.entries(row))if(key!=='id'&&entry!==undefined&&stringify(entry)!==JSON.stringify(old[key]))changed[key]=entry;
    for(const key of Object.keys(old))if(key!=='id'&&(row[key]===undefined||!Object.hasOwn(row,key)))deleted.push(key);
    updated.push({id:row.id,changed,...(deleted.length?{removed:deleted}:{})});
  }
  const orderChanged=before.order.length!==after.order.length||before.order.some((id,index)=>id!==after.order[index]);
  return {...(added.length?{added}:{}),...(removed.length?{removed}:{}),...(updated.length?{updated}:{}),...(orderChanged?{order:after.order}:{})};
}
function diffFields(before,after,source,stringify){
  const changed={},removed=[],arrays={},records={};
  for(const [key,next]of after){
    const prior=before.get(key);if(sameField(prior,next))continue;
    if(prior?.fields&&next.fields)records[key]=diffFields(prior.fields,next.fields,source[key],stringify);
    else if(prior?.rows&&next.rows)arrays[key]=arrayChanges(prior,next,source[key],stringify);
    else changed[key]=source[key];
  }
  for(const key of before.keys())if(!after.has(key))removed.push(key);
  return {...(Object.keys(changed).length?{changed}:{}),...(removed.length?{removed}:{}),...(Object.keys(arrays).length?{arrays}:{}),...(Object.keys(records).length?{records}:{})};
}

/** One encoder belongs to exactly one SSE stream, including two tabs per actor. */
export class SnapshotEncoder {
  reset(){this.baseline=null;}
  encode(snapshot,{context,signatureCache=createSnapshotSignatureCache()}={}){
    if(snapshot.protocol!==1||!Number.isSafeInteger(snapshot.sequence)||!record(snapshot.world))throw new TypeError('Invalid authoritative snapshot.');
    context??=JSON.stringify([snapshot.roomCode,snapshot.playerId,snapshot.worldMode,snapshot.dungeonInstance?.id,snapshot.dungeonInstance?.seed,snapshot.dungeonInstance?.tier,snapshot.pvp?.duel?.id]);
    const before=this.baseline,next=stateOf(snapshot,context,signatureCache,before);
    const layoutChanged=snapshot.layout!==undefined&&before?.top.get('layout')?.json!==next.top.get('layout')?.json;
    this.baseline=next;
    if(!before||before.context!==context||snapshot.sequence<=before.sequence||layoutChanged)return {...snapshot,snapshotContext:context};
    const top=diffFields(before.top,next.top,snapshot,signatureCache),world=diffFields(before.world,next.world,snapshot.world,signatureCache);
    return {protocol:1,snapshotDelta:1,baseSequence:before.sequence,sequence:snapshot.sequence,snapshotContext:context,...top,...(Object.keys(world).length?{world}:{})};
  }
}

export class SnapshotResyncError extends Error {
  constructor(message='Die Gruppenwelt wird neu synchronisiert.'){super(message);this.name='SnapshotResyncError';}
}
function fail(){throw new SnapshotResyncError();}
function checkRecord(value){if(!safeKeys(value))fail();}
function removedKeys(value){if(!Array.isArray(value)||new Set(value).size!==value.length||value.some(key=>typeof key!=='string'||UNSAFE.has(key)))fail();}
function applyArray(before,patch){
  if(!keyed(before)){fail();}checkRecord(patch);
  if(Object.keys(patch).some(key=>!['added','removed','updated','order'].includes(key)))fail();
  const rows=new Map(before.map(row=>[row.id,row]));
  if(patch.removed!==undefined){
    if(!Array.isArray(patch.removed)||new Set(patch.removed).size!==patch.removed.length)fail();
    for(const id of patch.removed){if(!validId(id)||!rows.delete(id))fail();}
  }
  if(patch.added!==undefined){
    if(!keyed(patch.added))fail();
    for(const row of patch.added){checkRecord(row);if(rows.has(row.id))fail();rows.set(row.id,clone(row));}
  }
  if(patch.updated!==undefined){
    if(!Array.isArray(patch.updated)||new Set(patch.updated.map(row=>row?.id)).size!==patch.updated.length)fail();
    for(const update of patch.updated){
      checkRecord(update);if(Object.keys(update).some(key=>!['id','changed','removed'].includes(key))||!rows.has(update.id))fail();
      checkRecord(update.changed);if(Object.hasOwn(update.changed,'id'))fail();
      const row={...rows.get(update.id),...clone(update.changed)};
      if(update.removed!==undefined){removedKeys(update.removed);for(const key of update.removed){if(key==='id'||Object.hasOwn(update.changed,key))fail();delete row[key];}}
      rows.set(update.id,row);
    }
  }
  const order=patch.order??before.map(row=>row.id);
  if(!Array.isArray(order)||order.length!==rows.size||new Set(order).size!==order.length||order.some(id=>!rows.has(id)))fail();
  return order.map(id=>rows.get(id));
}
function applyFields(before,patch,{top=false}={}){
  checkRecord(patch);if(Object.keys(patch).some(key=>!['changed','removed','arrays','records'].includes(key)))fail();
  const result={...before},seen=new Set();
  if(patch.changed!==undefined){checkRecord(patch.changed);for(const [key,value]of Object.entries(patch.changed)){if(top&&(RESERVED.has(key)||key==='world'||key==='layout'))fail();seen.add(key);result[key]=clone(value);}}
  if(patch.removed!==undefined){removedKeys(patch.removed);for(const key of patch.removed){if(seen.has(key)||top&&(RESERVED.has(key)||STICKY.has(key)||key==='world'))fail();seen.add(key);delete result[key];}}
  if(patch.arrays!==undefined){checkRecord(patch.arrays);for(const [key,array]of Object.entries(patch.arrays)){if(seen.has(key)||top&&(RESERVED.has(key)||key==='world'||key==='layout'))fail();seen.add(key);result[key]=applyArray(before[key],array);}}
  if(patch.records!==undefined){checkRecord(patch.records);for(const [key,change]of Object.entries(patch.records)){if(seen.has(key)||!safeKeys(before[key])||top&&(RESERVED.has(key)||key==='world'||key==='layout'))fail();seen.add(key);result[key]=applyFields(before[key],change);}}
  return result;
}

/** Canonical server state stays separate from renderer interpolation/mutations. */
export class SnapshotAccumulator {
  constructor(){this.reset();}
  reset(){this.snapshot=null;this.sequence=-1;this.context=null;}
  accept(packet,validate=()=>{}){
    if(!safeKeys(packet)||packet.protocol!==1)fail();
    let next;
    if(packet.snapshotDelta!==undefined){
      if(packet.snapshotDelta!==1||!this.snapshot||!Number.isSafeInteger(packet.baseSequence)||packet.baseSequence!==this.sequence||!Number.isSafeInteger(packet.sequence)||packet.sequence<=this.sequence||packet.snapshotContext!==this.context)fail();
      if(Object.keys(packet).some(key=>!['protocol','snapshotDelta','baseSequence','sequence','snapshotContext','changed','removed','arrays','records','world'].includes(key)))fail();
      const top=Object.fromEntries(['changed','removed','arrays','records'].filter(key=>packet[key]!==undefined).map(key=>[key,packet[key]]));
      next=applyFields(this.snapshot,top,{top:true});
      if(packet.world!==undefined)next.world=applyFields(this.snapshot.world,packet.world);
      next.sequence=packet.sequence;
      if(next.roomCode!==this.snapshot.roomCode||next.playerId!==this.snapshot.playerId||next.worldMode!==this.snapshot.worldMode)fail();
    }else{
      if(Number.isFinite(packet.sequence)&&packet.sequence<this.sequence)return null;
      next=clone(packet);
    }
    validate(next);
    this.snapshot=next;this.sequence=Number.isSafeInteger(next.sequence)?next.sequence:-1;this.context=next.snapshotContext??null;
    return next;
  }
}

export function cloneSnapshot(snapshot){return clone(snapshot);}
