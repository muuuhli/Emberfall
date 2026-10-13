"""Original Emberfall orthographic character atlas, generated with Blender.
Run: Blender --background --python assets/build_characters.py
Eight classes x four directions x eight stable poses. No external assets.
"""
import bpy, math, os, json
from mathutils import Vector

ROOT=os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=4096;scene.render.resolution_y=1536;scene.render.resolution_percentage=100
scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world.color=(.2,.25,.3)
scene.view_settings.view_transform='Standard'
scene.render.filepath=os.path.join(ROOT,'characters.png')

def material(name,color,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Roughness'].default_value=.72;n.inputs['Metallic'].default_value=metal
    return m
skin=material('warm_skin',(.69,.48,.31));steel=material('aged_steel',(.41,.56,.58),.3)
gold=material('old_gold',(.82,.59,.22),.3);dark=material('leather',(.14,.14,.12));bone=material('ivory',(.86,.82,.63));eye=material('eyes',(.05,.08,.1))
palettes=[(.2,.34,.36),(.8,.72,.46),(.23,.4,.21),(.25,.19,.34),(.63,.19,.12),(.28,.57,.7),(.32,.45,.18),(.3,.17,.39)]
names=['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder']
cloth=[material(name,c) for name,c in zip(names,palettes)]
models=[]

def mesh(kind,loc,scale,mat,root,rotation=(0,0,0),vertices=8):
    if kind=='sphere': bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,location=loc)
    elif kind=='cone': bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=1,radius2=.3,depth=2,location=loc)
    elif kind=='cylinder': bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=1,depth=2,location=loc)
    else:bpy.ops.mesh.primitive_cube_add(size=2,location=loc)
    o=bpy.context.object;o.scale=scale;o.rotation_euler=rotation;o.data.materials.append(mat)
    o.parent=root;return o

def character(classIndex,direction,pose):
    bpy.ops.object.empty_add(type='PLAIN_AXES');root=bpy.context.object
    root.name=f'{names[classIndex]}_dir{direction}_pose{pose}'
    clothMat=cloth[classIndex]
    walk=math.sin((pose-1)*math.pi/2)*.48 if 1<=pose<=4 else 0
    attack=pose in (5,6);swing=-.85 if pose==5 else .75 if pose==6 else 0
    bodyZ=1.0+(abs(walk)*.07)
    # Boots and fully jointed walking silhouettes; top-heavy proportions read at 64px.
    for side in (-1,1):
        leg=mesh('cube',(side*.13,0,.32),(.09,.10,.28),dark,root,(walk*side,0,0))
        mesh('cube',(side*.13,-.07+math.sin(walk*side)*.15,.09),(.12,.16,.10),dark,root)
    robe=classIndex>=4
    mesh('cone' if robe else 'cube',(0,0,.78),(.29,.22,.4) if robe else (.26,.19,.33),clothMat,root)
    mesh('cube',(0,-.195,.63),(.27,.035,.05),gold,root)
    mesh('cone',(0,.17,.87),(.3,.10,.43),clothMat,root,(.15,0,0))
    mesh('sphere',(0,-.015,1.27),(.24,.22,.26),skin,root)
    for x in (-.075,.075):mesh('cube',(x,-.219,1.31),(.022,.018,.028),eye,root)
    mesh('cube',(0,-.231,1.22),(.045,.022,.025),skin,root)
    for side in (-1,1):
        mesh('sphere',(side*.29,0,.97),(.14,.15,.15),steel if classIndex<2 else clothMat,root)
        armAngle=math.pi*.14+walk*-side if not attack else swing*side
        mesh('cube',(side*.32,-.035,.79),(.075,.085,.22),clothMat,root,(armAngle,0,side*.15))
        mesh('sphere',(side*.34,-.09,.57),(.08,.08,.09),skin,root)
    if classIndex==0:
        mesh('sphere',(0,.015,1.36),(.26,.235,.22),steel,root)
        mesh('cube',(0,-.224,1.34),(.19,.025,.05),dark,root)
        mesh('cube',(0,0,1.57),(.05,.14,.12),clothMat,root)
        mesh('sphere',(-.43,-.12,.77),(.20,.07,.29),steel,root)
        mesh('cube',(-.43,-.194,.77),(.035,.02,.18),gold,root)
        mesh('cube',(.40,-.14,.91),(.035,.03,.41),bone,root,(0,swing,0))
        mesh('cube',(.40,-.14,.64),(.13,.035,.025),gold,root)
    elif classIndex==1:
        mesh('sphere',(0,.03,1.42),(.26,.23,.16),gold,root)
        mesh('cube',(0,-.245,1.41),(.10,.018,.04),bone,root)
        mesh('cube',(.40,-.14,.83),(.04,.04,.35),dark,root)
        mesh('cube',(.40,-.14,1.15),(.16,.11,.12),gold,root,(0,swing,0))
        mesh('sphere',(-.4,-.13,.72),(.19,.07,.26),bone,root)
        mesh('cube',(-.4,-.21,.74),(.10,.017,.025),gold,root)
        mesh('cube',(-.4,-.21,.74),(.025,.017,.13),gold,root)
    elif classIndex in (2,3):
        mesh('sphere',(0,.06,1.39),(.27,.26,.24),clothMat,root)
        mesh('sphere',(0,-.15,1.26),(.21,.13,.19),dark if classIndex==3 else skin,root)
        for x in (-.07,.07):mesh('cube',(x,-.28,1.33),(.03,.018,.022),gold,root)
        if classIndex==2:
            # Bow curve is a bevelled native Blender curve.
            curve=bpy.data.curves.new('bow_curve','CURVE');curve.dimensions='3D';curve.bevel_depth=.035;curve.bevel_resolution=1
            spline=curve.splines.new('POLY');spline.points.add(6)
            for i,p in enumerate(spline.points):a=-1.4+i*2.8/6;p.co=(.43+math.sin(a)*.17,-.19,.79+math.cos(a)*.4,1)
            bow=bpy.data.objects.new('bow',curve);bpy.context.collection.objects.link(bow);bow.parent=root;curve.materials.append(gold)
            mesh('cylinder',(-.11,.25,.96),(.13,.13,.26),dark,root)
            for i in range(3):mesh('cube',(-.16+i*.06,.25,1.28),(.014,.014,.26),bone,root)
        else:
            for side in (-1,1):mesh('cone',(side*.40,-.15,.76),(.045,.025,.27),steel,root,(0,side*.35+swing,0))
    else:
        mesh('cone',(0,.03,1.53),(.29,.25,.20),clothMat,root)
        mesh('cylinder',(.42,-.11,.92),(.035,.035,.6),dark,root)
        orbMat=gold if classIndex==4 else material('ice_orb',(.43,.82,.91)) if classIndex==5 else material('leaf_orb',(.58,.72,.23)) if classIndex==6 else bone
        mesh('sphere',(.42,-.11,1.57),(.14,.13,.17),orbMat,root)
        mesh('cone',(.42,-.11,1.81),(.08,.08,.15),orbMat,root)
        if classIndex==6:
            for side in (-1,1):
                mesh('cube',(side*.22,.02,1.63),(.022,.035,.21),bone,root,(0,side*.6,0))
                mesh('cube',(side*.31,.02,1.69),(.14,.025,.024),bone,root)
        if classIndex==7:
            mesh('sphere',(0,-.20,1.39),(.18,.085,.16),bone,root)
            for x in (-.075,.075):mesh('sphere',(x,-.277,1.42),(.04,.02,.04),dark,root)
    root.rotation_euler.z=[0,-math.pi/2,math.pi,math.pi/2][direction]
    if pose==7:root.rotation_euler.x=1.3;root.scale=(.8,.8,.44)
    col=direction*8+pose
    # Camera basis: horizontal X, vertical (Y+Z)/sqrt(2). One tile 2.2x3.3m.
    # Positive Y appears at the top of this camera. Keep class zero in the top row.
    root.location=(col*2.2, (7-classIndex)*3.3*math.sqrt(2),0)
    return root

for row in range(8):
    for direction in range(4):
        for pose in range(8):models.append(character(row,direction,pose))

camData=bpy.data.cameras.new('Atlas Camera');camera=bpy.data.objects.new('Atlas Camera',camData);bpy.context.collection.objects.link(camera)
center=Vector((31*2.2/2,7*3.3*math.sqrt(2)/2+.8,0))
camera.location=center+Vector((0,-45,45));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
camData.type='ORTHO';camData.ortho_scale=32*2.2;scene.camera=camera
for name,loc,energy,size in [('soft_key',center+Vector((-8,-15,24)),2500,12),('warm_fill',center+Vector((12,0,18)),1500,16)]:
    light=bpy.data.lights.new(name,'AREA');light.energy=energy;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new(name,light);bpy.context.collection.objects.link(obj);obj.location=loc;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
sun=bpy.data.lights.new('common_directional','SUN');sun.energy=2.3
obj=bpy.data.objects.new('common_directional',sun);bpy.context.collection.objects.link(obj);obj.rotation_euler=(.5,-.45,-.5)
scene.render.image_settings.color_mode='RGBA'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'characters.blend'))
bpy.ops.render.render(write_still=True)
with open(os.path.join(ROOT,'characters.json'),'w') as f:
    json.dump({'file':'characters.png','tileWidth':64,'tileHeight':96,'pixelRatio':2,'columns':32,'rows':8,'classes':names,'directions':['south','east','north','west'],'poses':['idle','walk1','walk2','walk3','walk4','attack1','attack2','downed'],'pivot':[32,67],'source':'original Blender geometry','blenderVersion':bpy.app.version_string,'normalized':True},f,indent=2)
print('EMBERFALL_ATLAS_READY')
