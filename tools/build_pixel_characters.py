#!/usr/bin/env python3
"""Author Emberfall's original indexed-palette pixel characters with Pillow.

Every mark is placed on the native 32x48 grid. There is no rasterized 3D source,
antialiasing, interpolation, gradient, or random content. Runtime atlases remain
native resolution; the optional 2x files and review sheets use nearest-neighbor.
Run from any directory: python3 tools/build_pixel_characters.py
Requires Python 3.10+ and Pillow. Existing Blender assets are never overwritten.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 32, 48
PIVOT = [16, 40]
DIRECTIONS = ["south", "east", "north", "west"]
POSES = ["idle", "walk1", "walk2", "walk3", "walk4", "attack1", "attack2", "downed"]

# One shared 25-entry palette, including transparent index 0. Warm outlines,
# moss cloth, ochre metal, restrained scarlet/ice/violet magic, flat light steps.
COLORS = [
    ("clear", "000000"), ("ink", "252a2b"), ("slate", "3c4145"),
    ("barkdark", "594139"), ("bark", "815a40"), ("skinshade", "b17c52"),
    ("skin", "dcad79"), ("skinlight", "f0d29a"), ("linen", "f4e4ba"),
    ("ochreshade", "997443"), ("ochre", "c5a45b"), ("gold", "efd086"),
    ("steelshade", "51626b"), ("steel", "829797"), ("silver", "b8c9bf"),
    ("mossshade", "3f593e"), ("moss", "668253"), ("leaf", "9fa76b"),
    ("redshade", "703a3c"), ("scarlet", "ab5145"), ("ember", "d47b52"),
    ("iceshade", "396777"), ("ice", "76a2ac"), ("night", "514565"),
    ("violet", "8c759c"),
]
C = {name: i for i, (name, _) in enumerate(COLORS)}
RGB = [tuple(int(value[i:i + 2], 16) for i in (0, 2, 4)) for _, value in COLORS]
PALETTE = [channel for color in RGB for channel in color] + [0] * (768 - len(RGB) * 3)

CLASSES = [
    {"id": "guardian", "name": "Waechter", "coat": "steel", "shade": "steelshade", "light": "silver", "weapon": "sword", "hat": "helmet", "shape": "plate", "accent": "scarlet"},
    {"id": "paladin", "name": "Paladin", "coat": "ochre", "shade": "ochreshade", "light": "gold", "weapon": "hammer", "hat": "crownhelm", "shape": "plate", "accent": "linen"},
    {"id": "ranger", "name": "Waldlaeufer", "coat": "moss", "shade": "mossshade", "light": "leaf", "weapon": "bow", "hat": "hood", "shape": "leather", "accent": "bark"},
    {"id": "nightblade", "name": "Nachtklinge", "coat": "slate", "shade": "ink", "light": "steelshade", "weapon": "daggers", "hat": "hood", "shape": "leather", "accent": "scarlet"},
    {"id": "flamecaller", "name": "Flammenrufer", "coat": "scarlet", "shade": "redshade", "light": "ember", "weapon": "firestaff", "hat": "wizard", "shape": "robe", "accent": "gold"},
    {"id": "frostweaver", "name": "Frostweber", "coat": "ice", "shade": "iceshade", "light": "silver", "weapon": "icestaff", "hat": "circlet", "shape": "robe", "accent": "linen"},
    {"id": "druid", "name": "Druide", "coat": "moss", "shade": "mossshade", "light": "leaf", "weapon": "leafstaff", "hat": "antlers", "shape": "robe", "accent": "ochre"},
    {"id": "shadowbinder", "name": "Schattenbinder", "coat": "night", "shade": "slate", "light": "violet", "weapon": "skullstaff", "hat": "mask", "shape": "robe", "accent": "linen"},
]

# Stable catalog IDs. Headgear, aprons and small tools distinguish occupation;
# civilian silhouettes keep the same view, proportions and palette as heroes.
NPCS = [
    ("mira", "Mira", "Hainhueterin", "moss", "mossshade", "leaf", "long", "wreath", "flowers", False),
    ("elin", "Elin", "Schmiedin", "scarlet", "redshade", "ember", "tied", "none", "hammer", True),
    ("toma", "Toma", "Gaertner", "moss", "mossshade", "leaf", "short", "straw", "basket", True),
    ("sera", "Sera", "Alchemistin", "violet", "night", "silver", "long", "band", "bottle", True),
    ("rowan", "Rowan", "Spaeher", "ice", "iceshade", "silver", "short", "hood", "scroll", False),
    ("oren", "Oren", "Haendler", "ochre", "ochreshade", "gold", "beard", "cap", "satchel", True),
    ("lys", "Lys", "Wachmeisterin", "ochre", "ochreshade", "gold", "tied", "band", "spear", False),
    ("nami", "Nami", "Wasserhueterin", "ice", "iceshade", "silver", "long", "wreath", "bottle", False),
    ("ivar", "Ivar", "Leuchtturmmeister", "ochre", "bark", "gold", "beard", "cap", "lantern", True),
    ("branna", "Branna", "Gaertnerin", "moss", "mossshade", "leaf", "tied", "straw", "sickle", True),
    ("borin", "Borin", "Kommandant", "steel", "steelshade", "silver", "beard", "helmet", "spear", False),
    ("aelia", "Aelia", "Archivarin", "night", "slate", "violet", "long", "band", "book", False),
    ("siv", "Siv", "Eissaengerin", "ice", "iceshade", "linen", "long", "fur", "lyre", False),
    ("samir", "Samir", "Karawanenfuehrer", "ochre", "bark", "gold", "beard", "wrap", "satchel", False),
    ("rhea", "Rhea", "Traumweberin", "violet", "night", "silver", "long", "hood", "orb", False),
    ("kael", "Kael", "Marschall", "scarlet", "redshade", "ember", "short", "helmet", "spear", False),
    ("astra", "Astra", "Kartografin", "ice", "iceshade", "silver", "tied", "cap", "scroll", True),
    ("eos", "Eos", "Kernhueterin", "linen", "ochreshade", "gold", "long", "circlet", "orb", False),
]


def canvas(size=(WIDTH, HEIGHT)):
    image = Image.new("P", size, 0)
    image.putpalette(PALETTE)
    image.info["transparency"] = 0
    return image


class Pixels:
    def __init__(self, image, dx=0, dy=0):
        self.image = image
        self.draw = ImageDraw.Draw(image)
        self.dx, self.dy = dx, dy

    def points(self, points):
        return [(x + self.dx, y + self.dy) for x, y in points]

    def poly(self, points, fill, outline="ink"):
        self.draw.polygon(self.points(points), fill=C[fill], outline=C[outline] if outline else None)

    def rect(self, box, fill, outline=None):
        x0, y0, x1, y1 = box
        self.draw.rectangle((x0 + self.dx, y0 + self.dy, x1 + self.dx, y1 + self.dy), fill=C[fill], outline=C[outline] if outline else None)

    def line(self, points, color, width=1):
        self.draw.line(self.points(points), fill=C[color], width=width)

    def pixel(self, x, y, color):
        self.draw.point((x + self.dx, y + self.dy), fill=C[color])


def draw_boots(p, pose, side=False):
    stride = {"walk1": -1, "walk2": 0, "walk3": 1, "walk4": 0}.get(pose, 0)
    left_lift = 1 if pose == "walk2" else 0
    right_lift = 1 if pose == "walk4" else 0
    if side:
        p.poly([(11, 31), (15, 31), (16 + stride, 37 - left_lift), (18 + stride, 38 - left_lift), (18 + stride, 40 - left_lift), (11 + stride, 40 - left_lift)], "barkdark")
        p.poly([(17, 31), (20, 31), (19 - stride, 37 - right_lift), (21 - stride, 38 - right_lift), (21 - stride, 40 - right_lift), (15 - stride, 40 - right_lift)], "bark")
        p.line([(16 - stride, 38 - right_lift), (19 - stride, 38 - right_lift)], "ochreshade")
    else:
        p.poly([(10, 30), (15, 30), (15 - stride, 37 - left_lift), (15 - stride, 40 - left_lift), (9 - stride, 40 - left_lift), (9 - stride, 37 - left_lift)], "barkdark")
        p.poly([(17, 30), (22, 30), (23 + stride, 38 - right_lift), (23 + stride, 40 - right_lift), (17 + stride, 40 - right_lift), (17 + stride, 37 - right_lift)], "bark")
        p.rect((10 - stride, 38 - left_lift, 13 - stride, 38 - left_lift), "ochreshade")
        p.rect((18 + stride, 38 - right_lift, 21 + stride, 38 - right_lift), "ochreshade")


def draw_body(p, spec, direction, pose, civilian=False):
    coat, shade, light = spec["coat"], spec["shade"], spec["light"]
    side = direction == "east"
    back = direction == "north"
    arm_offset = {"walk1": 1, "walk3": -1, "attack1": -2, "attack2": -3}.get(pose, 0)
    robe = spec.get("shape") == "robe"
    plate = spec.get("shape") == "plate"
    # Cape is a distinct rear silhouette, with broad planes rather than noise.
    if not civilian or spec.get("cape"):
        if side:
            p.poly([(10, 21), (16, 20), (18, 31), (12, 35), (8, 33)], shade)
            p.line([(11, 24), (10, 31), (12, 33)], coat)
        else:
            p.poly([(9, 22), (16, 20), (23, 22), (24, 33), (20, 36), (16, 34), (11, 36), (8, 33)], shade)
            p.line([(10, 26), (10, 32), (12, 33)], coat)
    if side:
        p.poly([(13, 20), (18, 20), (21, 24), (21, 30), (19, 34), (11, 34), (11, 23)], coat)
        p.poly([(11, 24), (14, 24), (14, 32), (11, 33)], shade, None)
        if robe:
            p.poly([(12, 29), (20, 29), (22, 37), (18, 37), (17, 35), (13, 37), (10, 36)], coat)
            p.rect((12, 31, 13, 35), light)
        # Visible arm covers the side torso; highlight is a 2x3 cluster.
        p.poly([(18, 22), (22, 22), (23, 27 + arm_offset), (21, 30 + arm_offset), (18, 29 + arm_offset)], coat)
        p.rect((19, 23, 21, 25), light)
        p.rect((20, 28 + arm_offset, 22, 30 + arm_offset), "skin", "ink")
        p.rect((13, 28, 18, 29), "barkdark")
        p.rect((18, 28, 19, 29), "gold")
    else:
        p.poly([(10, 21), (22, 21), (23, 31), (21, 34), (11, 34), (9, 31)], coat)
        p.poly([(10, 23), (13, 23), (13, 31), (11, 33), (10, 31)], shade, None)
        p.rect((15, 23, 20, 27), light)
        p.rect((15, 26, 20, 27), coat)
        if robe:
            p.poly([(10, 29), (22, 29), (24, 36), (20, 37), (17, 35), (14, 37), (8, 36)], coat)
            p.poly([(10, 31), (13, 30), (13, 35), (11, 36), (9, 35)], shade, None)
            p.line([(20, 31), (21, 34), (20, 35)], light)
        left_y, right_y = (arm_offset, -arm_offset) if not pose.startswith("attack") else (0, arm_offset)
        for x, offset in ((7, left_y), (22, right_y)):
            p.poly([(x, 22), (x + 3, 22), (x + 3, 28 + offset), (x + 2, 30 + offset), (x, 29 + offset)], coat)
            p.rect((x + 1, 23, x + 2, 25), light)
            p.rect((x, 28 + offset, x + 2, 30 + offset), "skin", "ink")
        p.rect((11, 28, 21, 29), "barkdark")
        p.rect((15, 28, 17, 29), "gold")
    if plate:
        if side:
            p.poly([(17, 21), (21, 21), (23, 23), (22, 26), (17, 25)], light)
            p.line([(18, 22), (20, 22)], "linen" if spec["id"] == "paladin" else "silver")
            p.rect((15, 30, 20, 32), shade)
            p.line([(15, 31), (20, 31)], light)
        else:
            for x in (7, 20):
                p.poly([(x, 21), (x + 4, 20), (x + 5, 22), (x + 4, 25), (x, 25)], light)
                p.rect((x + 1, 22, x + 3, 22), coat)
            p.line([(13, 31), (19, 31)], light)
            p.line([(12, 33), (14, 33)], shade)
            p.line([(18, 33), (20, 33)], shade)
        if spec["id"] == "paladin" and not back:
            p.rect((16 if side else 15, 23, 17 if side else 16, 27), "linen")
            p.rect((15 if side else 13, 24, 19 if side else 18, 25), "linen")
    if spec["id"] == "ranger":
        if back:
            p.poly([(19, 19), (23, 20), (22, 30), (18, 29)], "bark")
            for x in (19, 21, 23):
                p.line([(x, 17), (x - 1, 23)], "ochre")
                p.pixel(x, 17, "linen")
        else:
            p.line([(11 if not side else 13, 22), (20, 28)], "barkdark", 2)
            p.line([(12 if not side else 14, 22), (20, 27)], "ochre")
    if spec["id"] == "nightblade":
        p.poly([(12, 21), (20, 21), (19, 24), (14, 24)], "scarlet")
        p.poly([(10, 22), (12, 22), (10, 29), (8, 27)], "redshade")
    if civilian and spec.get("apron"):
        if side:
            p.poly([(18, 25), (20, 25), (22, 34), (17, 34), (17, 29)], "linen")
            p.line([(18, 30), (20, 30)], "ochreshade")
        else:
            p.poly([(13, 24), (19, 24), (20, 34), (12, 34)], "linen")
            p.line([(14, 25), (14, 28), (18, 28)], "ochre")
            p.rect((14, 30, 18, 31), "ochreshade")
    if back:
        # No badge or face on a back view; large coherent cloak planes.
        p.poly([(11, 23), (21, 23), (22, 31), (19, 34), (13, 34), (10, 31)], shade)
        p.line([(14, 25), (14, 30), (16, 32)], coat)
        p.line([(19, 25), (19, 30)], light)


def draw_head(p, spec, direction, civilian=False):
    side, back = direction == "east", direction == "north"
    hat = spec["hat"]
    hair = spec.get("hair", "short")
    hair_color = "silver" if spec["id"] in ("frostweaver", "siv", "eos") else "barkdark"
    if side:
        p.poly([(12, 12), (18, 11), (21, 14), (21, 16), (23, 17), (22, 19), (21, 20), (17, 22), (13, 20), (11, 17)], "skin")
        p.rect((14, 13, 18, 14), "skinlight")
        p.rect((20, 16, 21, 17), "ink")
        p.pixel(22, 17, "skinlight")
        p.line([(19, 20), (21, 20)], "skinshade")
        p.poly([(11, 11), (16, 10), (20, 12), (20, 14), (16, 13), (15, 17), (12, 18), (10, 15)], hair_color)
        p.rect((12, 12, 15, 13), "bark" if hair_color != "silver" else "linen")
        if hair in ("long", "tied"):
            p.poly([(10, 15), (13, 16), (13, 23), (10, 25), (8, 23), (10, 20)], hair_color)
            p.line([(11, 18), (11, 23)], "bark" if hair_color != "silver" else "ice")
    else:
        p.poly([(12, 11), (20, 11), (23, 14), (23, 19), (20, 22), (12, 22), (9, 19), (9, 14)], "skin")
        p.poly([(11, 14), (13, 12), (19, 12), (20, 14), (20, 18), (18, 20), (13, 20), (11, 18)], "skinlight", None)
        p.rect((9, 16, 10, 18), "skinshade")
        p.rect((22, 16, 23, 18), "skinshade")
        p.poly([(12, 10), (20, 10), (23, 13), (22, 16), (20, 15), (18, 13), (15, 15), (12, 14), (10, 16), (9, 13)], hair_color)
        p.line([(12, 12), (17, 11), (20, 12)], "bark" if hair_color != "silver" else "linen")
        if not back:
            p.rect((12, 16, 13, 17), "ink")
            p.rect((19, 16, 20, 17), "ink")
            p.rect((15, 19, 17, 19), "skinshade")
        if hair in ("long", "tied"):
            p.poly([(9, 16), (12, 17), (12, 23), (10, 25), (8, 23), (8, 19)], hair_color)
            p.poly([(20, 17), (23, 16), (24, 22), (22, 25), (20, 23)], hair_color)
            p.rect((9, 19, 10, 22), "bark" if hair_color != "silver" else "ice")
    if hair == "beard" and hat not in ("hood", "mask") and not back:
        if side:
            p.poly([(17, 19), (21, 19), (20, 23), (16, 24), (15, 22)], "bark")
            p.line([(18, 20), (19, 20)], "ochreshade")
        else:
            p.poly([(11, 19), (14, 19), (16, 20), (19, 19), (21, 19), (20, 23), (16, 25), (12, 23)], "bark")
            p.line([(14, 21), (18, 21)], "ochreshade")
    if hat in ("helmet", "crownhelm"):
        metal, hi = ("steel", "silver") if hat == "helmet" else ("ochre", "gold")
        if side:
            p.poly([(10, 12), (12, 9), (18, 9), (21, 12), (21, 15), (17, 14), (15, 19), (12, 20), (10, 17)], metal)
            p.line([(12, 11), (18, 10), (20, 12)], hi)
            p.rect((19, 14, 22, 15), "ink")
            p.rect((21, 16, 22, 18), metal)
        else:
            p.poly([(9, 13), (11, 9), (15, 8), (20, 9), (23, 13), (23, 18), (20, 19), (20, 15), (12, 15), (12, 19), (9, 18)], metal)
            p.line([(11, 12), (13, 10), (19, 10), (21, 12)], hi)
            p.rect((15, 10, 16, 14), hi)
            p.rect((12, 15, 20, 16), "ink")
            if not back:
                p.pixel(13, 15, "gold")
                p.pixel(19, 15, "gold")
        if spec["id"] == "guardian":
            p.poly([(14, 8), (15, 5), (19, 5), (19, 8), (17, 10)], "scarlet")
            p.rect((15, 6, 18, 6), "ember")
        if hat == "crownhelm":
            p.poly([(13, 9), (12, 6), (15, 7), (16, 5), (18, 7), (21, 6), (20, 10)], "gold")
            p.rect((15, 8, 18, 9), "linen")
    elif hat in ("hood", "mask"):
        hood = spec["coat"]
        if side:
            p.poly([(10, 13), (12, 9), (16, 8), (20, 10), (22, 13), (19, 15), (17, 13), (15, 14), (14, 19), (12, 22), (9, 19)], hood)
            p.line([(12, 12), (14, 10), (17, 10)], spec["light"])
            if hat == "mask":
                p.poly([(18, 14), (21, 15), (22, 19), (19, 21), (17, 18)], "linen")
                p.rect((20, 16, 21, 17), "night")
        else:
            p.poly([(9, 15), (10, 10), (15, 8), (18, 8), (22, 11), (23, 16), (22, 21), (19, 23), (19, 19), (21, 17), (20, 14), (16, 12), (12, 14), (11, 18), (13, 21), (12, 23), (9, 21)], hood)
            p.line([(11, 12), (15, 10), (18, 10)], spec["light"])
            if hat == "mask" and not back:
                p.poly([(12, 14), (19, 14), (20, 17), (18, 21), (14, 21), (11, 17)], "linen")
                p.rect((12, 16, 14, 17), "night")
                p.rect((17, 16, 19, 17), "night")
                p.pixel(16, 19, "ochre")
    elif hat == "wizard":
        p.poly([(7, 14), (11, 11), (13, 7), (16, 4), (20, 6), (18, 8), (21, 12), (25, 14), (24, 16), (8, 16)], "scarlet")
        p.poly([(13, 10), (15, 6), (17, 6), (16, 8), (18, 11)], "ember", None)
        p.line([(9, 14), (22, 14)], "gold")
        p.rect((15, 13, 17, 14), "ochre")
    elif hat == "antlers":
        p.line([(12, 12), (9, 9), (8, 5), (6, 4)], "ink", 3)
        p.line([(20, 12), (23, 8), (24, 4), (26, 3)], "ink", 3)
        p.line([(12, 11), (9, 8), (8, 5), (6, 4)], "ochre")
        p.line([(20, 11), (23, 8), (24, 4), (26, 3)], "ochre")
        p.line([(9, 8), (5, 8), (4, 6)], "bark", 2)
        p.line([(23, 7), (27, 7), (28, 5)], "bark", 2)
        p.poly([(11, 12), (14, 10), (20, 11), (21, 13), (12, 14)], "moss")
        p.rect((14, 12, 17, 13), "leaf")
    elif hat == "straw":
        p.poly([(6, 14), (10, 12), (12, 8), (20, 8), (22, 12), (26, 14), (25, 16), (7, 16)], "ochre")
        p.rect((12, 9, 19, 10), "gold")
        p.line([(10, 13), (22, 13)], "bark")
    elif hat == "cap":
        p.poly([(10, 13), (10, 10), (14, 8), (20, 9), (22, 12), (24, 13), (24, 15), (10, 15)], spec["shade"])
        p.line([(12, 11), (17, 10), (20, 11)], spec["light"])
    elif hat == "wrap":
        p.poly([(10, 14), (9, 11), (12, 8), (20, 8), (23, 11), (22, 15)], "linen")
        p.line([(11, 11), (20, 11)], "ochre")
        p.line([(12, 9), (20, 9)], "gold")
        p.rect((21, 13, 23, 20), "linen", "ink")
    elif hat == "fur":
        p.poly([(9, 13), (10, 9), (13, 8), (20, 8), (23, 12), (22, 15), (19, 14), (12, 15)], "silver")
        p.line([(11, 10), (14, 9), (19, 9), (21, 11)], "linen")
        p.rect((10, 14, 11, 19), "silver")
    elif hat in ("circlet", "band", "wreath"):
        p.line([(11, 13), (20, 13)], "ochre" if hat != "wreath" else "moss", 2)
        p.rect((15, 12, 17, 14), "ice" if spec["id"] == "frostweaver" else "gold")
        if hat == "wreath":
            p.rect((11, 12, 13, 13), "leaf")
            p.rect((19, 12, 21, 13), "leaf")
    if back:
        # The rear face is never a duplicated front face. A hood/helm or hair
        # cluster covers the entire face and leaves only a neck at its base.
        fill = spec["coat"] if hat in ("hood", "mask", "wizard") else hair_color
        if hat in ("helmet", "crownhelm"):
            fill = "steel" if hat == "helmet" else "ochre"
        p.poly([(11, 14), (20, 14), (22, 17), (20, 21), (16, 23), (12, 21), (10, 18)], fill)
        hi = spec["light"] if fill == spec["coat"] else "bark" if fill == "barkdark" else "silver"
        p.line([(13, 16), (13, 19), (15, 20)], hi)
        p.rect((15, 22, 17, 23), "skinshade")


def draw_shield(p, side, back, pose, paladin=False):
    x = 11 if side else (21 if back else 5)
    y = 24 if pose != "attack1" else 22
    rim = "gold" if paladin else "ochre"
    fill = "linen" if paladin else "steelshade"
    p.poly([(x, y + 1), (x + 3, y), (x + 7, y + 1), (x + 7, y + 7), (x + 4, y + 11), (x, y + 7)], rim)
    p.poly([(x + 1, y + 2), (x + 3, y + 1), (x + 6, y + 2), (x + 6, y + 7), (x + 4, y + 9), (x + 1, y + 6)], fill, None)
    p.line([(x + 4, y + 2), (x + 4, y + 7)], "ochreshade" if paladin else "silver")
    p.line([(x + 2, y + 4), (x + 5, y + 4)], "ochreshade" if paladin else "silver")
    p.pixel(x + 2, y + 2, "linen")


def draw_weapon(p, spec, direction, pose):
    side, back = direction == "east", direction == "north"
    weapon = spec["weapon"]
    if weapon in ("sword", "hammer"):
        if spec["id"] in ("guardian", "paladin"):
            draw_shield(p, side, back, pose, spec["id"] == "paladin")
        if pose == "attack1":
            start, tip = (23, 25), (23, 9)
        elif pose == "attack2":
            start, tip = (23, 25), ((30, 23) if side else (29, 17))
        else:
            start, tip = (25, 30), (27, 20)
        if back:
            start, tip = (7, 29), (5, 17 if pose == "attack2" else 20)
        sx, sy = start
        tx, ty = tip
        if weapon == "hammer":
            tx = min(tx, 27)
        p.line([(sx, sy + 4), (sx, sy)], "ink", 3)
        p.line([(sx, sy + 3), (sx, sy)], "bark")
        if weapon == "sword":
            p.line([(sx, sy), (tx, ty)], "ink", 4)
            p.line([(sx, sy - 1), (tx, ty)], "silver", 2)
            p.pixel(tx, ty, "linen")
            p.line([(sx - 2, sy), (sx + 2, sy)], "ochre", 2)
            p.pixel(sx - 1, sy, "gold")
        else:
            p.line([(sx, sy), (tx, ty + 3)], "ink", 3)
            p.line([(sx, sy), (tx, ty + 3)], "ochre")
            p.poly([(tx - 3, ty), (tx + 2, ty), (tx + 3, ty + 2), (tx + 2, ty + 5), (tx - 3, ty + 5)], "ochre")
            p.rect((tx - 2, ty + 1, tx + 1, ty + 2), "gold")
            p.rect((tx - 2, ty + 3, tx + 1, ty + 3), "linen")
    elif weapon == "bow":
        x = 25 if not back else 6
        p.line([(x - 1, 20), (x + 2, 22), (x + 3, 27), (x + 2, 32), (x - 1, 34)], "ink", 3)
        p.line([(x - 1, 20), (x + 1, 22), (x + 2, 27), (x + 1, 32), (x - 1, 34)], "ochre")
        p.line([(x - 1, 21), (x - 1, 33)], "linen")
        p.rect((x, 26, x + 1, 28), "bark")
        if pose.startswith("attack"):
            y = 26
            p.line([(max(2, x - 7), y), (min(30, x + 4), y)], "barkdark", 2)
            p.line([(max(2, x - 6), y), (min(30, x + 4), y)], "ochre")
            p.poly([(min(30, x + 4), y - 2), (min(30, x + 6), y), (min(30, x + 4), y + 2)], "silver", None)
    elif weapon == "daggers":
        for x, y in ((25, 27), (6 if not side else 16, 29)):
            if pose == "attack1":
                y -= 8
            elif pose == "attack2":
                y -= 5
            p.line([(x, y + 4), (x, y - 3)], "ink", 3)
            p.line([(x, y), (x + (2 if side else 1), y - 5)], "silver", 2)
            p.line([(x - 2, y + 1), (x + 2, y + 1)], "ochre")
            p.pixel(x + (2 if side else 1), y - 5, "linen")
    else:
        x = 26 if not back else 6
        y = 13 if pose == "attack1" else 16 if pose == "attack2" else 19
        p.line([(x, y + 2), (x - 1, 36)], "ink", 3)
        p.line([(x, y + 2), (x - 1, 35)], "ochre" if weapon == "firestaff" else "bark")
        p.pixel(x, 31, "gold")
        if weapon == "firestaff":
            p.poly([(x - 3, y + 2), (x - 2, y - 2), (x, y - 5), (x + 1, y - 2), (x + 3, y), (x + 2, y + 3)], "redshade")
            p.poly([(x - 1, y + 1), (x - 1, y - 2), (x, y - 3), (x + 1, y), (x, y + 2)], "gold", None)
            p.pixel(x + 1, y + 1, "ember")
        elif weapon == "icestaff":
            p.poly([(x - 3, y), (x, y - 5), (x + 3, y), (x, y + 4)], "iceshade")
            p.poly([(x, y - 3), (x + 1, y), (x, y + 2), (x - 1, y)], "silver", None)
            p.pixel(x, y - 2, "linen")
        elif weapon == "leafstaff":
            p.poly([(x - 3, y + 1), (x - 3, y - 2), (x, y - 5), (x + 3, y - 2), (x + 3, y + 1), (x, y + 3)], "moss")
            p.line([(x - 1, y + 1), (x + 1, y - 2)], "leaf", 2)
            p.pixel(x, y + 2, "gold")
        elif weapon == "skullstaff":
            p.poly([(x - 3, y - 2), (x - 2, y - 4), (x + 2, y - 4), (x + 3, y - 2), (x + 3, y + 1), (x + 1, y + 3), (x - 1, y + 3), (x - 3, y + 1)], "linen")
            p.rect((x - 2, y - 1, x - 1, y), "night")
            p.rect((x + 1, y - 1, x + 2, y), "night")
            p.pixel(x, y + 1, "violet")
        if pose == "attack2" and not back:
            # A small flat spell cluster is a pose cue, never a blurred glow.
            p.poly([(6, 23), (8, 21), (10, 23), (9, 26), (6, 26), (5, 24)], spec["accent"])
            p.pixel(7, 23, "linen")


def draw_prop(p, spec, direction, pose):
    side, back = direction == "east", direction == "north"
    prop = spec["weapon"]
    x, y = (24, 28) if not back else (7, 28)
    if pose.startswith("attack"):
        y -= 3
    if prop == "hammer":
        p.line([(x, y - 2), (x, y + 7)], "ink", 3)
        p.line([(x, y - 1), (x, y + 6)], "bark")
        p.rect((x - 3, y - 4, x + 3, y - 1), "steel", "ink")
        p.rect((x - 2, y - 3, x + 1, y - 3), "silver")
    elif prop == "spear":
        p.line([(x + 2, 18), (x + 2, 39)], "ink", 3)
        p.line([(x + 2, 20), (x + 2, 38)], "bark")
        p.poly([(x, 18), (x + 2, 11), (x + 4, 18), (x + 2, 20)], "silver")
        p.pixel(x + 2, 15, "linen")
    elif prop in ("book", "scroll"):
        p.poly([(x - 3, y - 3), (x + 3, y - 3), (x + 4, y + 4), (x - 3, y + 5)], "bark" if prop == "book" else "linen")
        p.rect((x - 2, y - 2, x + 2, y + 3), "linen")
        p.line([(x - 1, y), (x + 1, y)], "ochreshade")
        p.line([(x - 1, y + 2), (x + 1, y + 2)], "ochreshade")
        if prop == "book":
            p.line([(x - 2, y - 2), (x - 2, y + 3)], "scarlet")
    elif prop == "lantern":
        p.line([(x, y - 4), (x + 3, y - 4), (x + 4, y)], "barkdark", 2)
        p.poly([(x - 1, y - 1), (x + 4, y - 1), (x + 5, y + 5), (x + 3, y + 7), (x, y + 7), (x - 2, y + 5)], "ochre")
        p.rect((x, y + 1, x + 3, y + 4), "gold")
        p.rect((x + 1, y + 1, x + 2, y + 3), "linen")
    elif prop == "bottle":
        p.rect((x, y - 4, x + 2, y - 2), "ochre", "ink")
        p.poly([(x - 1, y - 1), (x + 3, y - 1), (x + 4, y + 3), (x + 3, y + 5), (x - 1, y + 5), (x - 2, y + 3)], "ice")
        p.rect((x - 1, y + 1, x + 2, y + 3), "violet")
        p.pixel(x - 1, y, "linen")
    elif prop in ("basket", "satchel"):
        p.line([(x - 3, y - 1), (x, y - 4), (x + 3, y - 1)], "barkdark", 2)
        p.poly([(x - 4, y), (x + 4, y), (x + 3, y + 6), (x - 3, y + 6)], "bark")
        p.line([(x - 2, y + 1), (x + 2, y + 1)], "ochre")
        p.line([(x - 2, y + 3), (x + 2, y + 3)], "ochre")
        if prop == "basket":
            p.poly([(x - 2, y), (x - 2, y - 5), (x, y - 4), (x + 1, y - 7), (x + 3, y - 4), (x + 2, y)], "leaf")
            p.pixel(x + 1, y - 5, "gold")
        else:
            p.rect((x, y + 1, x + 1, y + 2), "gold")
    elif prop == "sickle":
        p.line([(x, y), (x - 1, y + 7)], "ink", 3)
        p.line([(x, y), (x - 1, y + 6)], "bark")
        p.poly([(x - 1, y - 1), (x + 1, y - 4), (x + 4, y - 5), (x + 6, y - 2), (x + 4, y - 1), (x + 4, y - 3), (x + 1, y - 2)], "silver")
    elif prop == "lyre":
        p.poly([(x - 3, y - 5), (x - 1, y - 4), (x, y), (x + 2, y), (x + 3, y - 4), (x + 5, y - 5), (x + 4, y + 3), (x + 2, y + 5), (x - 1, y + 5), (x - 3, y + 3)], "ochre")
        for xx in (x, x + 2):
            p.line([(xx, y - 3), (xx, y + 3)], "linen")
    elif prop == "flowers":
        p.line([(x, y + 4), (x + 2, y - 1)], "mossshade", 2)
        p.poly([(x - 3, y - 1), (x - 1, y - 4), (x + 1, y - 2), (x + 3, y - 4), (x + 5, y - 1), (x + 2, y + 2), (x, y + 1)], "leaf")
        p.rect((x, y - 2, x + 1, y - 1), "gold")
        p.rect((x + 3, y - 2, x + 4, y - 1), "linen")
    elif prop == "orb":
        p.poly([(x - 3, y - 2), (x - 1, y - 4), (x + 2, y - 4), (x + 4, y - 2), (x + 4, y + 1), (x + 2, y + 3), (x - 1, y + 3), (x - 3, y + 1)], "violet")
        p.rect((x - 1, y - 2, x + 1, y - 1), "silver")
        p.pixel(x, y + 1, "linen")


def draw_downed(spec, civilian=False):
    image = canvas()
    p = Pixels(image)
    # Horizontal, intentionally compressed fall. Its ground baseline and pivot
    # stay at y40 rather than rotating an upright frame into a clipped tile.
    p.poly([(5, 33), (8, 30), (13, 31), (14, 36), (11, 39), (6, 38)], "skin")
    p.poly([(5, 33), (7, 30), (11, 30), (12, 32), (8, 33), (7, 36), (5, 36)], "barkdark")
    p.line([(9, 35), (11, 35)], "ink")
    p.poly([(13, 32), (22, 32), (25, 35), (23, 39), (13, 39), (11, 37)], spec["coat"])
    p.rect((15, 33, 20, 34), spec["light"])
    p.poly([(22, 35), (27, 34), (30, 36), (29, 39), (23, 39)], "barkdark")
    p.rect((26, 36, 28, 37), "bark")
    p.line([(14, 38), (21, 38)], spec["shade"])
    if spec["id"] in ("guardian", "paladin"):
        p.poly([(12, 34), (17, 32), (21, 34), (20, 38), (15, 39)], "ochre" if spec["id"] == "paladin" else "steel")
        p.rect((15, 35, 18, 36), "gold" if spec["id"] == "paladin" else "silver")
    elif not civilian and spec["hat"] in ("hood", "mask"):
        p.poly([(4, 32), (7, 29), (11, 30), (12, 33), (8, 32), (6, 36), (4, 35)], spec["coat"])
    elif spec["hat"] == "wizard":
        p.poly([(4, 31), (5, 28), (10, 28), (12, 30), (8, 31), (7, 33)], "scarlet")
    elif spec["hat"] == "antlers":
        p.line([(7, 32), (5, 28), (3, 27), (2, 29)], "bark", 2)
    if civilian and spec.get("apron"):
        p.rect((14, 36, 19, 38), "linen")
    return image


def character(spec, direction, pose, civilian=False):
    if pose == "downed":
        image = draw_downed(spec, civilian)
        return mirror_at_pivot(image) if direction in ("north", "west") else image
    if direction == "west":
        return mirror_at_pivot(character(spec, "east", pose, civilian))
    image = canvas()
    # Boots are drawn without bob so the contact point remains stable. Cloth,
    # head and arms move by one deliberate native pixel in the passing poses.
    draw_boots(Pixels(image), pose, direction == "east")
    bob = -1 if pose in ("walk2", "walk4", "attack1") else 0
    p = Pixels(image, dy=bob)
    draw_body(p, spec, direction, pose, civilian)
    draw_head(p, spec, direction, civilian)
    if civilian:
        draw_prop(p, spec, direction, pose)
    else:
        draw_weapon(p, spec, direction, pose)
    return image


def mirror_at_pivot(image):
    # Mirror around x16, not the half-pixel x15.5 image center. This avoids a
    # one-native-pixel foot shift when a walking actor changes east to west.
    mirrored = canvas()
    mirrored.paste(ImageOps.mirror(image), (1, 0))
    return mirrored


def npc_specs():
    return [{"id": i, "name": n, "role": r, "coat": c, "shade": s, "light": l,
             "hair": h, "hat": hat, "weapon": tool, "apron": apron,
             "shape": "robe" if i in ("mira", "nami", "aelia", "siv", "rhea", "eos") else "tunic",
             "accent": "ochre", "cape": i in ("rowan", "lys", "borin", "kael")}
            for i, n, r, c, s, l, h, hat, tool, apron in NPCS]


def atlas(specs, civilian=False):
    sheet = canvas((WIDTH * 32, HEIGHT * len(specs)))
    frames = []
    for row, spec in enumerate(specs):
        for direction_index, direction in enumerate(DIRECTIONS):
            for pose_index, pose in enumerate(POSES):
                frame = character(spec, direction, pose, civilian)
                column = direction_index * 8 + pose_index
                sheet.paste(frame, (column * WIDTH, row * HEIGHT))
                bounds = frame.convert("RGBA").getbbox()
                # Headwear may occupy row2; nothing may touch tile side/top
                # edges, and the ground coordinate must remain below the feet.
                if not bounds or bounds[0] < 1 or bounds[1] < 1 or bounds[2] > WIDTH - 1 or bounds[3] > 41:
                    raise AssertionError(f"Clipped/empty frame {spec['id']} {direction} {pose}: {bounds}")
                frames.append({"id": spec["id"], "direction": direction, "pose": pose,
                               "column": column, "row": row, "bounds": list(bounds)})
    return sheet, frames


def preview(specs, civilian=False):
    # Review at native scale and exact 3x. The inset row shows all eight poses;
    # front/profile/back/profile reveal hat, weapon and occupation silhouette.
    scale, gutter, label_height = 3, 12, 20
    row_height = HEIGHT * scale + label_height + 10
    sheet = canvas((8 * WIDTH * scale + gutter * 2, row_height * len(specs) + 36))
    d = ImageDraw.Draw(sheet)
    d.rectangle((0, 0, sheet.width, sheet.height), fill=C["slate"])
    font = ImageFont.load_default()
    d.text((12, 10), "EMBERFALL / ORIGINAL PIXEL CHARACTERS / 32 x 48 / 25 COLORS", fill=C["linen"], font=font)
    for row, spec in enumerate(specs):
        y = 36 + row * row_height
        d.text((gutter, y), f"{row + 1:02}  {spec['name']}  /  {spec['id']}", fill=C["gold"], font=font)
        for col in range(8):
            x = gutter + col * WIDTH * scale
            # Quiet moss/ochre checker avoids a misleading white background.
            color = "mossshade" if col % 2 == 0 else "barkdark"
            d.rectangle((x, y + label_height, x + WIDTH * scale - 1, y + row_height - 7), fill=C[color])
            if col < 4:
                frame = character(spec, DIRECTIONS[col], "idle", civilian)
            else:
                frame = character(spec, "south", ["walk1", "walk3", "attack2", "downed"][col - 4], civilian)
            frame = frame.resize((WIDTH * scale, HEIGHT * scale), Image.Resampling.NEAREST)
            sheet.paste(frame, (x, y + label_height), frame.convert("RGBA").getchannel("A"))
        # Ground ruler is separate from pixels and exactly at native pivot40.
        d.line((gutter, y + label_height + 40 * scale, sheet.width - gutter, y + label_height + 40 * scale), fill=C["ochreshade"])
    return sheet


def save_png(image, path):
    image.save(path, transparency=0, optimize=False, bits=8)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    report = {"paletteEntries": len(COLORS), "alphaLevels": [0, 255], "nativeTile": [32, 48],
              "pivot": PIVOT, "filter": "nearest", "antialias": False, "families": {}}
    for family, specs, civilian in (("characters", CLASSES, False), ("npcs", npc_specs(), True)):
        image, frames = atlas(specs, civilian)
        stem = f"pixel-{family}"
        png = output / f"{stem}.png"
        save_png(image, png)
        save_png(image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST), output / f"{stem}-2x.png")
        save_png(preview(specs, civilian), output / f"{stem}-preview.png")
        color_count = len(image.getcolors(image.width * image.height))
        if color_count > 25 or image.mode != "P":
            raise AssertionError("Native atlas must use at most 25 indexed colors")
        meta = {"file": f"{stem}.png", "tileWidth": WIDTH, "tileHeight": HEIGHT,
                "columns": 32, "rows": len(specs), "directions": DIRECTIONS, "poses": POSES,
                "pivot": PIVOT, "pixelRatio": 1, "normalized": True, "filter": "nearest",
                "source": "original authored integer-grid pixel clusters", "generator": "../tools/build_pixel_characters.py",
                "palette": [{"index": i, "name": name, "hex": f"#{color}"} for i, (name, color) in enumerate(COLORS)],
                "transparencyIndex": 0, "license": "Original project artwork; repository owner may use, modify and distribute.",
                "classNames" if not civilian else "npcNames": {s["id"]: s["name"] for s in specs},
                "classes" if not civilian else "npcs": [s["id"] for s in specs],
                "frameLayout": "column = directionIndex * 8 + poseIndex; row = actorIndex",
                "frameCount": len(frames), "nativeSize": [image.width, image.height],
                "animation": {"walkFps": 8, "walkPoseIndices": [1, 2, 3, 4], "attackPoseIndices": [5, 6], "downedPoseIndex": 7},
                "sha256": sha(png), "checks": {"indexedPalette": True, "colorsUsed": color_count,
                    "binaryAlpha": True, "allFramesNonempty": True, "tileEdgesClear": True,
                    "stableGroundPivot": True, "nearest2xAvailable": f"{stem}-2x.png"}}
        (output / f"{stem}.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        report["families"][family] = {"frames": len(frames), "size": [image.width, image.height],
                                     "colorsUsed": color_count, "sha256": sha(png), "framesChecked": frames}
    (output / "pixel-art-qa.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"paletteEntries": 25, "characters": 256, "npcs": 576,
                      "output": str(output), "nativePivot": PIVOT, "validation": "passed"}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "assets")
    args = parser.parse_args()
    generate(args.output.resolve())
