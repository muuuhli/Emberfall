#!/usr/bin/env python3
"""Render the authoritative Canvas pixel clusters at their actual 2× game scale.

Only contact sheets / QA reports are produced. The game loads the authored JS
module; these PNGs are not replacement runtime assets. Requires Python + Pillow.
"""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = """
import {getPixelSprite, PIXEL_ENEMY_TYPES, PIXEL_WORLD_PALETTE, pixelEnemyHeight} from './src/pixel-world.js';
import {ENEMY_TYPES} from './src/catalog.js';
const assets=PIXEL_ENEMY_TYPES.map(type=>({kind:'enemy',label:type,subject:{type},boss:ENEMY_TYPES[type].boss}));
for(const variant of ['oak','pine','dead','burnt'])assets.push({kind:'tree',label:'tree '+variant,subject:{variant}});
for(const variant of ['stone','ice','ash'])assets.push({kind:'rock',label:'rock '+variant,subject:{variant}});
for(const name of ['Dornenknospe','Hungrige Seele','Prismatischer Anker'])assets.push({kind:'enemy',label:name,subject:{type:'echo_guard',stationary:true,bossObjectiveId:'qa',name}});
const serialize=s=>({width:s.width,height:s.height,pivot:s.pivot,runs:s.runs,clippedPixels:s.clippedPixels,colours:[...new Set(s.pixels)].filter(v=>v)});
console.log(JSON.stringify({palette:PIXEL_WORLD_PALETTE,assets:assets.map(a=>({...a,idle:serialize(getPixelSprite(a.kind,a.subject,0)),windup:serialize(getPixelSprite(a.kind,{...a.subject,phase:'windup'},0)),height:a.kind==='enemy'?pixelEnemyHeight(a.subject.type):null}))}));
"""
data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', SCRIPT], cwd=ROOT, text=True))

def colour(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i+2], 16) for i in range(0, len(value), 2)) + ((255,) if len(value) == 6 else ())

def native(sprite):
    image = Image.new('RGBA', (sprite['width'], sprite['height']))
    d = ImageDraw.Draw(image)
    for r in sprite['runs']:
        d.rectangle((r['x'], r['y'], r['x']+r['w']-1, r['y']), fill=colour(data['palette'][r['colour']]))
    return image.resize((image.width*2,image.height*2), Image.Resampling.NEAREST)

def background(asset):
    label = asset['label']
    if any(x in label for x in ['frost','skadi','ice','pine']): return (54,75,80)
    if any(x in label for x in ['ember','imp','ash','burnt','obsidian','sand']): return (78,58,47)
    if any(x in label for x in ['moon','chronar','night','world_heart','void','wraith','echo']): return (57,49,67)
    return (55,69,47)

font = ImageFont.load_default()
cell_w, cell_h, cols = 208, 202, 6
sheet = Image.new('RGB',(cols*cell_w,44+((len(data['assets'])+cols-1)//cols)*cell_h),(31,40,42))
d = ImageDraw.Draw(sheet)
d.text((12,10),'EMBERFALL / ORIGINAL PIXEL WORLD / 2x WORLD SCALE / 39 COLOURS',fill=(222,209,161),font=font)
for i,a in enumerate(data['assets']):
    x,y=(i%cols)*cell_w,(i//cols)*cell_h+44
    bg=background(a)
    d.rectangle((x+2,y+2,x+cell_w-3,y+cell_h-3),fill=bg)
    d.line((x+5,y+cell_h-25,x+cell_w-5,y+cell_h-25),fill=tuple(min(255,v+15) for v in bg))
    image=native(a['idle']); pivot=a['idle']['pivot']
    sheet.paste(image,(x+cell_w//2-pivot[0]*2,y+cell_h-26-pivot[1]*2),image)
    d.text((x+8,y+cell_h-17),a['label'],fill=(222,209,161),font=font)
sheet.save(ROOT/'assets/pixel-world-preview.png')

bosses=[a for a in data['assets'] if a.get('boss')]
cw,ch,bc=376,212,3
sheet = Image.new('RGB',(bc*cw,44+((len(bosses)+bc-1)//bc)*ch),(31,40,42));d=ImageDraw.Draw(sheet)
d.text((12,10),'EMBERFALL / BOSS SILHOUETTES / IDLE -> WINDUP / 2x WORLD SCALE',fill=(222,209,161),font=font)
for i,a in enumerate(bosses):
    x,y=(i%bc)*cw,(i//bc)*ch+44;bg=background(a)
    d.rectangle((x+2,y+2,x+cw-3,y+ch-3),fill=bg)
    for pose,centre in [('idle',cw//4),('windup',cw*3//4)]:
        image=native(a[pose]);pivot=a[pose]['pivot']
        sheet.paste(image,(x+centre-pivot[0]*2,y+ch-30-pivot[1]*2),image)
    d.text((x+8,y+ch-18),a['label'],fill=(222,209,161),font=font)
sheet.save(ROOT/'assets/pixel-world-bosses-preview.png')

report={
    'source':'Original authored integer-grid clusters in src/pixel-world.js',
    'license':'Original project artwork; repository owner may use, modify and distribute.',
    'worldPixelSize':2,'filtering':'nearest','paletteSize':len(data['palette']),
    'enemyTypes':len([a for a in data['assets'] if a.get('height') is not None and not a['subject'].get('bossObjectiveId')]),
    'spriteFamilies':{'tree':4,'rock':3,'bossObjectives':3},
    'allPreviewPosesUnclipped':all(a[p]['clippedPixels']==0 for a in data['assets'] for p in ['idle','windup']),
    'maxColoursPerEnemy':max(len(a['idle']['colours']) for a in data['assets'] if a['kind']=='enemy'),
    'assets':[{'name':a['label'],'nativeSize':[a['idle']['width'],a['idle']['height']],'pivot':a['idle']['pivot'],'colours':len(a['idle']['colours'])} for a in data['assets']],
    'contactSheets':['pixel-world-preview.png','pixel-world-bosses-preview.png'],
    'runtimeCacheLimit':192,
}
(ROOT/'assets/pixel-world-qa.json').write_text(json.dumps(report,indent=2)+'\n')
print(f"Rendered {len(data['assets'])} sprites, {len(bosses)} boss pose pairs; all unclipped: {report['allPreviewPosesUnclipped']}")
