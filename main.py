import bpy, bmesh
from mathutils import *
from math import *
import random, time, struct, ctypes, imp

from . import myprops, involute

def genGear(ob, scene):
    return involute.genGear(ob, scene);
    
def run(ctx=None):
    if ctx is None:
        ctx = bpy.context
        
    for ob in ctx.scene.objects:
        if ob.geargen.enabled:
            genGear(ob, ctx.scene)

class RecalcAllGears(bpy.types.Operator):
    """Tooltip"""
    bl_idname = "object.geargen_recalc_all_gears"
    bl_label = "Recalc All Gears"
    bl_options = {'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def execute(self, context):
        run(context)
        return {'FINISHED'}

class RecalcGear(bpy.types.Operator):
    """Tooltip"""
    bl_idname = "object.geargen_recalc_gear"
    bl_label = "Recalc Gear"
    bl_options = {'UNDO'}

    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def execute(self, context):
        ob = context.active_object
        
        geargen = ob.geargen
        genGear(ob, context.scene)

        return {'FINISHED'}

class Clipboard:
    def __init__(self):
        self.clear()
        
    def clear(self):
        self.props = {}
        self.nonprops = {}


clipboard = Clipboard()

class CopyGearSettingsBase:
    bl_label = "Copy To Clipboard"

    def get_geargen(self, context):
        pass

    def execute(self, context):
        geargen = self.get_geargen(context)

        clipboard.clear()

        for prop in myprops.PropNames:
            clipboard.props[prop] = [prop in geargen.local_overrides, getattr(geargen, prop)]
        
        for prop in myprops.NonPropNames:
            clipboard.nonprops[prop] = getattr(geargen, prop)

        return {'FINISHED'}

class CopyGearSettings(bpy.types.Operator, CopyGearSettingsBase):
    """Tooltip"""
    bl_idname = "object.geargen_copy_settings"
    
    @classmethod
    def poll(cls, context):
        return context.active_object is not None

    def get_geargen(self, context):
        return context.active_object.geargen

class SceneCopyGearSettings(bpy.types.Operator, CopyGearSettingsBase):
    """Tooltip"""
    bl_idname = "scene.geargen_copy_settings"
    
    @classmethod
    def poll(cls, context):
        return context.scene is not None

    def get_geargen(self, context):
        return context.scene.geargen

class PasteGearSettingsBase:
    bl_label = "Paste"

    def execute(self, context):
        if type(self) == PasteGearSettings:
            geargen = context.active_object.geargen
        else:
            geargen = context.scene.geargen

        geargen.local_overrides = set()

        if context.scene.geargen.paste_local_settings:
            for nonprop, value in clipboard.nonprops.items():
                setattr(geargen, nonprop, value)

        for prop, item in clipboard.props.items():
            print(prop, item)

            setattr(geargen, prop, item[1])

            # don't set override flags for non props
            if prop in myprops.NonPropNames:
                continue

            if item[0] and prop not in geargen.local_overrides:
                # bug in BPY, doesn't work
                # geargen.local_overrides.add(prop) 

                # workaround
                geargen.local_overrides = set(geargen.local_overrides).union(set([prop]))
            elif not item[0] and prop in geargen.local_overrides:
                geargen.local_overrides.remove(prop)
        
        return {'FINISHED'}

class PasteGearSettings(bpy.types.Operator, PasteGearSettingsBase):
    """Tooltip"""
    bl_idname = "object.geargen_paste_settings"
    bl_label = "Paste"
    bl_options = {'UNDO'}
    
    @classmethod
    def poll(cls, context):
        return context.active_object is not None

class ScenePasteGearSettings(bpy.types.Operator, PasteGearSettingsBase):
    """Tooltip"""
    bl_idname = "scene.geargen_paste_settings"
    bl_label = "Paste"
    bl_options = {'UNDO'}
    
    @classmethod
    def poll(cls, context):
        return context.scene is not None

bpy_classes = [
    RecalcAllGears, 
    CopyGearSettings, 
    PasteGearSettings,
    RecalcGear,
    SceneCopyGearSettings,
    ScenePasteGearSettings,
]

registered = False
def register():
    global registered
    if registered: return
    registered = True
    
    for cls in bpy_classes:
        bpy.utils.register_class(cls)
    myprops.register()

def unregister():
    global registered
    if not registered: return
    registered = False
    
    for cls in bpy_classes:
        bpy.utils.unregister_class(cls)

    myprops.unregister()

def on_update(self, context):
    if context.scene.geargen.auto_generate:
        run()

myprops.register_prop_update(on_update)
register()

if __name__ == "__main__":
    run()
