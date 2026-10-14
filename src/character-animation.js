// Presentation only. These profiles never schedule damage, movement, resource
// spending or cooldowns; the simulation remains the authority for every hit.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const profile=(duration,windup,impact,poses,accent)=>({duration,windup,impact,poses,accent});
export const CHARACTER_ANIMATION_PROFILES=freeze({
  melee:profile(.26,.055,.08,{windup:5,impact:6,recovery:5},'strike'),
  projectile:profile(.30,.09,.07,{windup:5,impact:6,recovery:0},'strike'),
  cast:profile(.42,.14,.11,{windup:5,impact:6,recovery:5},'cast'),
  shield:profile(.44,.09,.13,{windup:5,impact:6,recovery:0},'cast'),
  heal:profile(.46,.14,.12,{windup:5,impact:6,recovery:0},'cast'),
});

/** Instant accepted actions begin at impact. An explicitly supplied windup is
 * reserved for a genuinely prepared action or an isolated animation preview.
 * The single immutable stamp is safe to serialize with a player snapshot.
 */
export function createCharacterPresentation(kind,time,options={}) {
  kind=Object.hasOwn(CHARACTER_ANIMATION_PROFILES,kind)?kind:'cast';
  const p=CHARACTER_ANIMATION_PROFILES[kind],at=finite(time)?time:0;
  const duration=finite(options.duration)&&options.duration>0?clamp(options.duration,.12,4):p.duration;
  const requested=options.windup===true?p.windup:finite(options.windup)?options.windup:0;
  const windup=clamp(requested,0,Math.max(0,duration-Math.min(p.impact,duration))),impact=Math.min(p.impact,duration-windup);
  return freeze({version:1,kind,startedAt:at,impactAt:at+windup,impactUntil:at+windup+impact,endAt:at+duration,
    ...(finite(options.angle)?{angle:options.angle}:{}),
    ...(typeof options.skillId==='string'?{skillId:options.skillId.slice(0,100)}:{}),
    ...(typeof options.color==='string'&&/^#[0-9a-f]{6}$/i.test(options.color)?{color:options.color}:{}),
  });
}

export function characterDirection(angle) {
  angle=finite(angle)?angle:Math.PI/2;
  return Math.abs(Math.cos(angle))>Math.abs(Math.sin(angle))?(Math.cos(angle)>0?1:3):(Math.sin(angle)>0?0:2);
}
const validPresentation=p=>p&&p.version===1&&Object.hasOwn(CHARACTER_ANIMATION_PROFILES,p.kind)&&
  [p.startedAt,p.impactAt,p.impactUntil,p.endAt].every(finite)&&p.startedAt<=p.impactAt&&p.impactAt<=p.impactUntil&&p.impactUntil<=p.endAt&&p.endAt-p.startedAt<=4;

/** Stateless sampling keeps pauses, replays and reduced motion deterministic.
 * All body and status anchors remain at the actor's real feet; only atlas poses
 * and local accents change. Old saves and arena snapshots retain timer fallback.
 */
export function sampleCharacterAnimation(actor={},time=0,{reducedMotion=false}={}) {
  const now=finite(time)?time:0,dead=!!(actor.dead||actor.downed),dash=!dead&&(actor.dashUntil||0)>now;
  const presentation=validPresentation(actor.presentation)&&now>=actor.presentation.startedAt&&now<actor.presentation.endAt?actor.presentation:null;
  const moving=!!actor.walking&&!dead,hasVelocity=finite(actor.velocityX)&&finite(actor.velocityY)&&Math.hypot(actor.velocityX,actor.velocityY)>.1;
  let angle=finite(actor.face)?actor.face:Math.PI/2;
  if(moving&&hasVelocity&&!presentation)angle=Math.atan2(actor.velocityY,actor.velocityX);
  if(presentation&&finite(presentation.angle))angle=presentation.angle;
  if(dash)angle=finite(actor.dashAngle)?actor.dashAngle:angle;
  let pose=0,phase='idle',kind=null,accent=null,accentFrame=0,progress=0;
  if(dead){pose=7;phase='downed';}
  else if(dash){pose=reducedMotion?2:actor.dashUntil-now>.09?2:4;phase='dash';accent='dash';}
  else if(presentation){
    const p=CHARACTER_ANIMATION_PROFILES[presentation.kind];kind=presentation.kind;
    phase=now<presentation.impactAt?'windup':now<presentation.impactUntil?'impact':'recovery';
    pose=reducedMotion?p.poses.impact:p.poses[phase];accent=p.accent;accentFrame=phase==='impact'?1:0;
    progress=clamp((now-presentation.startedAt)/(presentation.endAt-presentation.startedAt||1),0,1);
  }else{
    const end=Math.max(actor.attackUntil||0,actor.castUntil||0);
    if(end>now){phase=end-now>.11?'windup':'impact';kind=(actor.castUntil||0)>now?'cast':'melee';pose=phase==='windup'?5:6;accent=kind==='cast'?'cast':'strike';accentFrame=pose===6?1:0;}
    else if(moving){phase='walk';pose=reducedMotion?0:1+Math.floor(now*9)%4;}
  }
  const hit=!dead&&(actor.hitUntil||0)>now,hitFrame=reducedMotion?0:actor.hitUntil-now>.12?0:actor.hitUntil-now>.06?1:2;
  const afterimages=dash&&!reducedMotion?[2,1].map(i=>({x:-Math.round(Math.cos(angle)*i*16/2)*2,y:-Math.round(Math.sin(angle)*i*16/2)*2,alpha:.1/i})):[];
  return {direction:characterDirection(angle),angle,pose,phase,kind,accent,accentFrame,progress,afterimages,hit,hitFrame,presentation};
}
