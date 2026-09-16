#!/usr/bin/env python3
"""Generate the deterministic fixed-rig v2 sprites for the full cast.

Every pose is forward-kinematic from one actor definition and one weapon
attachment.  There is no per-frame resize, alpha-mass correction, crop, or
normalization pass: the 384 px canvas, root scale, and bottom-centre anchor are
fixed before the first joint is evaluated.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


REPO = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO / "site/assets/art-v2"
SOURCE = DEFAULT_OUT / "source"
CANVAS = (384, 384)
GROUND_Y = 350
ROOT_X = 192
AA = 4
RASTER_SCALE = 0.78
FRAME_COUNT = 6
FRAME_CUES = ("neutral", "anticipation", "contact", "overshoot", "recovery", "neutral")
FRAME_HOLDS = (4, 5, 3, 3, 5, 5)


Point = tuple[float, float]


def point(origin: Point, length: float, angle_degrees: float) -> Point:
    angle = math.radians(angle_degrees)
    return origin[0] + math.cos(angle) * length, origin[1] + math.sin(angle) * length


def mix(left: float, right: float, amount: float) -> float:
    return left + (right - left) * amount


def hex_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(131072), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class Pose:
    torso: float = -90
    root_dx: float = 0
    rear_leg: tuple[float, float] = (99, 82)
    front_leg: tuple[float, float] = (78, 101)
    rear_arm: tuple[float, float] = (103, 70)
    front_arm: tuple[float, float] = (72, 104)
    weapon_angle: float = -62
    expression: str = "focus"
    cue: str = "neutral"
    zone: str | None = None
    motion_arc: bool = False


class Painter:
    def __init__(self) -> None:
        self.image = Image.new("RGBA", (CANVAS[0] * AA, CANVAS[1] * AA), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.image, "RGBA")

    @staticmethod
    def transform(value: Point) -> Point:
        return ROOT_X + (value[0] - ROOT_X) * RASTER_SCALE, GROUND_Y + (value[1] - GROUND_Y) * RASTER_SCALE

    @staticmethod
    def p(value: Point) -> tuple[int, int]:
        transformed = Painter.transform(value)
        return round(transformed[0] * AA), round(transformed[1] * AA)

    @staticmethod
    def box(value: Sequence[float]) -> tuple[int, int, int, int]:
        first = Painter.transform((value[0], value[1]))
        second = Painter.transform((value[2], value[3]))
        return round(first[0] * AA), round(first[1] * AA), round(second[0] * AA), round(second[1] * AA)

    def line(self, points: Iterable[Point], fill: Any, width: float, joint: str = "curve") -> None:
        self.draw.line([self.p(value) for value in points], fill=fill, width=max(1, round(width * RASTER_SCALE * AA)), joint=joint)

    def polygon(self, points: Iterable[Point], fill: Any, outline: Any | None = None, width: float = 1) -> None:
        converted = [self.p(value) for value in points]
        self.draw.polygon(converted, fill=fill)
        if outline is not None:
            self.draw.line(converted + [converted[0]], fill=outline, width=max(1, round(width * RASTER_SCALE * AA)), joint="curve")

    def ellipse(self, bounds: Sequence[float], fill: Any, outline: Any | None = None, width: float = 1) -> None:
        self.draw.ellipse(self.box(bounds), fill=fill, outline=outline, width=max(1, round(width * RASTER_SCALE * AA)))

    def arc(self, bounds: Sequence[float], start: float, end: float, fill: Any, width: float) -> None:
        self.draw.arc(self.box(bounds), start=start, end=end, fill=fill, width=max(1, round(width * RASTER_SCALE * AA)))

    def finish(self) -> Image.Image:
        # The floor is a hard presentation boundary, not a scale/crop operation.
        self.draw.rectangle((0, (GROUND_Y + 1) * AA, CANVAS[0] * AA, CANVAS[1] * AA), fill=(0, 0, 0, 0))
        result = self.image.resize(CANVAS, Image.Resampling.LANCZOS)
        ImageDraw.Draw(result).rectangle((0, GROUND_Y + 1, CANVAS[0], CANVAS[1]), fill=(0, 0, 0, 0))
        return result


def load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def skeleton(rig: dict[str, Any], pose: Pose) -> dict[str, Point]:
    p = rig["proportions"]
    pelvis: Point = (pose.root_dx, 0)
    torso_unit = (math.cos(math.radians(pose.torso)), math.sin(math.radians(pose.torso)))
    across = (-torso_unit[1], torso_unit[0])
    chest = point(pelvis, p["torso"], pose.torso)
    neck = point(chest, p["neck"], pose.torso)
    head = point(neck, p["headRadius"] * 0.92, pose.torso)

    rear_shoulder = (chest[0] - across[0] * p["shoulderWidth"] / 2, chest[1] - across[1] * p["shoulderWidth"] / 2)
    front_shoulder = (chest[0] + across[0] * p["shoulderWidth"] / 2, chest[1] + across[1] * p["shoulderWidth"] / 2)
    rear_hip = (pelvis[0] - across[0] * p["hipWidth"] / 2, pelvis[1] - across[1] * p["hipWidth"] / 2)
    front_hip = (pelvis[0] + across[0] * p["hipWidth"] / 2, pelvis[1] + across[1] * p["hipWidth"] / 2)

    rear_elbow = point(rear_shoulder, p["upperArm"], pose.rear_arm[0])
    rear_wrist = point(rear_elbow, p["forearm"], pose.rear_arm[1])
    front_elbow = point(front_shoulder, p["upperArm"], pose.front_arm[0])
    front_wrist = point(front_elbow, p["forearm"], pose.front_arm[1])
    rear_knee = point(rear_hip, p["thigh"], pose.rear_leg[0])
    rear_ankle = point(rear_knee, p["shin"], pose.rear_leg[1])
    front_knee = point(front_hip, p["thigh"], pose.front_leg[0])
    front_ankle = point(front_knee, p["shin"], pose.front_leg[1])

    # Translation registers the kinematic root against a fixed floor.  It does
    # not resize or inspect rendered alpha and is identical for every export.
    lowest_ankle = max(rear_ankle[1], front_ankle[1])
    translate = (ROOT_X, GROUND_Y - 9 - lowest_ankle)
    joints = {
        "pelvis": pelvis,
        "chest": chest,
        "neck": neck,
        "head": head,
        "rearShoulder": rear_shoulder,
        "frontShoulder": front_shoulder,
        "rearElbow": rear_elbow,
        "frontElbow": front_elbow,
        "rearWrist": rear_wrist,
        "frontWrist": front_wrist,
        "rearHip": rear_hip,
        "frontHip": front_hip,
        "rearKnee": rear_knee,
        "frontKnee": front_knee,
        "rearAnkle": rear_ankle,
        "frontAnkle": front_ankle,
    }
    return {name: (value[0] + translate[0], value[1] + translate[1]) for name, value in joints.items()}


def thick_limb(painter: Painter, points: Sequence[Point], ink: Any, fill: Any, width: float) -> None:
    painter.line(points, ink, width + 7)
    painter.line(points, fill, width)
    radius = width / 2
    for x, y in points[1:-1]:
        painter.ellipse((x - radius, y - radius, x + radius, y + radius), fill, ink, 3)


def draw_boot(painter: Painter, ankle: Point, front: bool, ink: Any, leather: Any) -> None:
    x, y = ankle
    direction = 1 if front else -1
    toe = x + direction * 24
    painter.polygon(
        [(x - 10, y - 11), (x + 10, y - 9), (toe + direction * 7, y + 2), (toe + direction * 5, GROUND_Y), (x - direction * 12, GROUND_Y), (x - 13, y + 2)],
        leather,
        ink,
        4,
    )
    painter.line([(x - direction * 8, y - 3), (x + direction * 7, y - 1)], ink, 2)


def draw_motion_arc(painter: Painter, zone: str | None, ink: Any) -> None:
    if zone == "head":
        painter.arc((153, 45, 371, 245), 198, 338, (238, 205, 111, 132), 7)
        painter.arc((166, 57, 359, 231), 200, 336, ink, 1.5)
    elif zone == "legs":
        painter.arc((145, 208, 374, 362), 190, 343, (206, 116, 68, 132), 8)
        painter.arc((158, 218, 365, 352), 192, 340, ink, 1.5)
    else:
        painter.arc((146, 116, 375, 321), 191, 343, (231, 220, 180, 128), 7)
        painter.arc((159, 128, 365, 308), 194, 340, ink, 1.5)


def draw_weapon(painter: Painter, weapon: dict[str, Any], grip: Point, angle: float) -> None:
    palette = {key: hex_rgba(value) for key, value in weapon["palette"].items()}
    direction = (math.cos(math.radians(angle)), math.sin(math.radians(angle)))
    perpendicular = (-direction[1], direction[0])
    kind = weapon["kind"]
    if kind == "spear":
        length = weapon["length"]
        butt = (grip[0] - direction[0] * 26, grip[1] - direction[1] * 26)
        end = (grip[0] + direction[0] * length, grip[1] + direction[1] * length)
        painter.line([butt, end], palette["dark"], weapon["shaftWidth"] + 4)
        painter.line([butt, end], palette["wood"], weapon["shaftWidth"])
        painter.line([butt, end], palette["light"], 2.5)
        painter.line([butt, point(butt, 12, angle + 90)], palette["band"], 4)
        socket_start = (end[0] - direction[0] * 16, end[1] - direction[1] * 16)
        painter.line([socket_start, end], palette["steelDark"], weapon["headWidth"] + 4)
        painter.ellipse(
            (end[0] - direction[0] * 18 - weapon["headWidth"], end[1] - direction[1] * 18 - weapon["headWidth"],
             end[0] - direction[0] * 18 + weapon["headWidth"], end[1] - direction[1] * 18 + weapon["headWidth"]),
            palette["steelDark"], palette["dark"], 2,
        )
        base = (end[0] - direction[0] * 14, end[1] - direction[1] * 14)
        mid = (end[0] + direction[0] * 18 + perpendicular[0] * weapon["headWidth"] * 0.8,
               end[1] + direction[1] * 18 + perpendicular[1] * weapon["headWidth"] * 0.8)
        tip = (end[0] + direction[0] * 44, end[1] + direction[1] * 44)
        rear_mid = (end[0] + direction[0] * 18 - perpendicular[0] * weapon["headWidth"] * 0.8,
                    end[1] + direction[1] * 18 - perpendicular[1] * weapon["headWidth"] * 0.8)
        painter.polygon([base, mid, tip, rear_mid], palette["steel"], palette["dark"], 3)
        painter.line([base, tip], palette["steelDark"], 1.5)
    elif kind == "captain-sword":
        length = weapon["length"]
        pommel = (grip[0] - direction[0] * 12, grip[1] - direction[1] * 12)
        guard = (grip[0] + direction[0] * weapon["gripLength"], grip[1] + direction[1] * weapon["gripLength"])
        tip = (grip[0] + direction[0] * length, grip[1] + direction[1] * length)
        painter.line([pommel, guard], palette["dark"], 10)
        painter.line([pommel, guard], palette["grip"], 5)
        guard_half = weapon["guardWidth"] / 2
        painter.line(
            [(guard[0] - perpendicular[0] * guard_half, guard[1] - perpendicular[1] * guard_half),
             (guard[0] + perpendicular[0] * guard_half, guard[1] + perpendicular[1] * guard_half)],
            palette["dark"], 7,
        )
        painter.line(
            [(guard[0] - perpendicular[0] * guard_half, guard[1] - perpendicular[1] * guard_half),
             (guard[0] + perpendicular[0] * guard_half, guard[1] + perpendicular[1] * guard_half)],
            palette["accent"], 3,
        )
        blade_start = (guard[0] + direction[0] * 2, guard[1] + direction[1] * 2)
        painter.line([blade_start, tip], palette["dark"], weapon["bladeWidth"] + 4)
        painter.line([blade_start, tip], palette["blade"], weapon["bladeWidth"])
        painter.line([blade_start, tip], palette["edge"], 2)
        painter.ellipse((pommel[0] - weapon["pommelRadius"], pommel[1] - weapon["pommelRadius"], pommel[0] + weapon["pommelRadius"], pommel[1] + weapon["pommelRadius"]), palette["accent"], palette["dark"], 3)
        # Kite shield rides the rear forearm like a separate attachment.
        shield_centre = (grip[0] - perpendicular[0] * 34 + direction[0] * 6, grip[1] - perpendicular[1] * 34 + direction[1] * 6)
        half_w, half_h = 30, 40
        shield = [
            (shield_centre[0] - perpendicular[0] * half_w - direction[0] * 6, shield_centre[1] - perpendicular[1] * half_w - direction[1] * 6),
            (shield_centre[0] + perpendicular[0] * half_w - direction[0] * 6, shield_centre[1] + perpendicular[1] * half_w - direction[1] * 6),
            (shield_centre[0] + perpendicular[0] * (half_w - 4) + direction[0] * half_h * 0.55, shield_centre[1] + perpendicular[1] * (half_w - 4) + direction[1] * half_h * 0.55),
            (shield_centre[0] + direction[0] * half_h, shield_centre[1] + direction[1] * half_h),
            (shield_centre[0] - perpendicular[0] * (half_w - 4) + direction[0] * half_h * 0.55, shield_centre[1] - perpendicular[1] * (half_w - 4) + direction[1] * half_h * 0.55),
        ]
        painter.polygon(shield, palette["shield"], palette["shieldDark"], 5)
        painter.polygon(
            [(shield_centre[0] - perpendicular[0] * 12, shield_centre[1] - perpendicular[1] * 12),
             (shield_centre[0] + perpendicular[0] * 12, shield_centre[1] + perpendicular[1] * 12),
             (shield_centre[0] + direction[0] * 26, shield_centre[1] + direction[1] * 26)],
            palette["shieldLight"], None,
        )
        boss = (shield_centre[0] + direction[0] * 8, shield_centre[1] + direction[1] * 8)
        painter.ellipse((boss[0] - 9, boss[1] - 9, boss[0] + 9, boss[1] + 9), palette["boss"], palette["shieldDark"], 3)
    elif kind in ("longsword", "dussack"):
        length = weapon["length"]
        pommel = (grip[0] - direction[0] * 13, grip[1] - direction[1] * 13)
        guard = (grip[0] + direction[0] * weapon["gripLength"], grip[1] + direction[1] * weapon["gripLength"])
        tip = (grip[0] + direction[0] * length, grip[1] + direction[1] * length)
        painter.line([pommel, guard], palette["dark"], 11)
        painter.line([pommel, guard], palette["grip"], 6)
        guard_half = weapon["guardWidth"] / 2
        painter.line(
            [(guard[0] - perpendicular[0] * guard_half, guard[1] - perpendicular[1] * guard_half),
             (guard[0] + perpendicular[0] * guard_half, guard[1] + perpendicular[1] * guard_half)],
            palette["dark"],
            8,
        )
        painter.line(
            [(guard[0] - perpendicular[0] * guard_half, guard[1] - perpendicular[1] * guard_half),
             (guard[0] + perpendicular[0] * guard_half, guard[1] + perpendicular[1] * guard_half)],
            palette["guard"],
            4,
        )
        if kind == "longsword":
            blade_start = (guard[0] + direction[0] * 2, guard[1] + direction[1] * 2)
            painter.line([blade_start, tip], palette["dark"], weapon["bladeWidth"] + 5)
            painter.line([blade_start, tip], palette["blade"], weapon["bladeWidth"])
            painter.line([blade_start, tip], palette["edge"], 2)
        else:
            blade_start = (guard[0] + direction[0] * 2, guard[1] + direction[1] * 2)
            bulge = (tip[0] - direction[0] * 18 + perpendicular[0] * 5, tip[1] - direction[1] * 18 + perpendicular[1] * 5)
            painter.line([blade_start, bulge, tip], palette["dark"], weapon["bladeWidth"] + 5)
            painter.line([blade_start, bulge, tip], palette["blade"], weapon["bladeWidth"])
            painter.line([blade_start, bulge, tip], palette["edge"], 2)
            # Knuckle bow distinguishes the historical dussack attachment.
            painter.arc((grip[0] - 17, grip[1] - 17, grip[0] + 18, grip[1] + 18), 200, 520, palette["guard"], 3)
        painter.ellipse((pommel[0] - weapon["pommelRadius"], pommel[1] - weapon["pommelRadius"], pommel[0] + weapon["pommelRadius"], pommel[1] + weapon["pommelRadius"]), palette["guard"], palette["dark"], 3)
    else:
        length = weapon["length"]
        end = (grip[0] + direction[0] * length, grip[1] + direction[1] * length)
        head_start = (end[0] - direction[0] * 30, end[1] - direction[1] * 30)
        painter.line([grip, end], palette["dark"], weapon["shaftWidth"] + 7)
        painter.line([grip, end], palette["wood"], weapon["shaftWidth"])
        painter.line([grip, end], palette["light"], 3)
        painter.line([head_start, end], palette["dark"], weapon["headWidth"] + 7)
        painter.line([head_start, end], palette["wood"], weapon["headWidth"])
        painter.line([head_start, end], palette["light"], 4)
        painter.line([head_start, point(head_start, 10, angle + 90)], palette["band"], 4)


def draw_claws(painter: Painter, joints: dict[str, Point], palette: dict[str, Any], length: float) -> None:
    """Blackened claw fans replace weapon attachments for the wretch and boss."""
    ink = palette["ink"]
    for wrist_name in ("rearWrist", "frontWrist"):
        wrist = joints[wrist_name]
        elbow = joints[wrist_name.replace("Wrist", "Elbow")]
        forearm = (wrist[0] - elbow[0], wrist[1] - elbow[1])
        length_ratio = max(1.0, math.hypot(*forearm))
        along = (forearm[0] / length_ratio, forearm[1] / length_ratio)
        across = (-along[1], along[0])
        for offset, reach in ((-0.5, 0.75), (-0.17, 1.0), (0.17, 1.0), (0.5, 0.75)):
            base = (wrist[0] + across[0] * offset * 7, wrist[1] + across[1] * offset * 7)
            tip = (base[0] + along[0] * length * reach - across[0] * offset * 6,
                   base[1] + along[1] * length * reach - across[1] * offset * 6)
            painter.line([base, tip], ink, 6)
            painter.line([base, tip], palette["claw"], 3)


def draw_meyer(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    # Rear limbs.
    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["breeches"], 28)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["hose"], 20)
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["doublet"], 27)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["clothLight"], 19)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    torso_length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / torso_length, torso_vec[0] / torso_length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.56
    waist_half = rig["proportions"]["hipWidth"] * 0.68
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["doublet"], ink, 5)
    painter.line([joints["chest"], joints["pelvis"]], c["gold"], 4)
    for offset in (-20, 20):
        painter.line(
            [(joints["chest"][0] + across[0] * offset, joints["chest"][1] + across[1] * offset),
             (joints["pelvis"][0] + across[0] * offset * 0.55, joints["pelvis"][1] + across[1] * offset * 0.55)],
            c["doubletDark"],
            5,
        )
        painter.line(
            [(joints["chest"][0] + across[0] * (offset - 3), joints["chest"][1] + across[1] * (offset - 3)),
             (joints["pelvis"][0] + across[0] * (offset - 1), joints["pelvis"][1] + across[1] * (offset - 1))],
            c["gold"],
            2,
        )
    # Peplum tabs.
    for offset in (-29, -14, 0, 14, 29):
        base = (joints["pelvis"][0] + across[0] * offset, joints["pelvis"][1] + across[1] * offset)
        tip = (base[0] - torso_vec[0] / torso_length * 24, base[1] - torso_vec[1] / torso_length * 24)
        painter.line([base, tip], ink, 12)
        painter.line([base, tip], c["doublet" if offset % 28 else "gold"], 7)

    # Front limbs and costume panels.
    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["breeches"], 30)
    painter.line([joints["frontHip"], joints["frontKnee"]], c["hose"], 6)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["hose"], 21)
    draw_boot(painter, joints["rearAnkle"], False, ink, c["leather"])
    draw_boot(painter, joints["frontAnkle"], True, ink, c["leather"])
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["doublet"], 29)
    painter.line([joints["frontShoulder"], joints["frontElbow"]], c["gold"], 4)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["clothLight"], 20)

    # Neck, head and face always retain the same geometry.
    neck = joints["neck"]
    head = joints["head"]
    painter.line([joints["chest"], neck], ink, 18)
    painter.line([joints["chest"], neck], c["clothLight"], 11)
    radius = rig["proportions"]["headRadius"]
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 5)
    painter.polygon([(head[0] + radius - 3, head[1] - 5), (head[0] + radius + 10, head[1] + 1), (head[0] + radius - 4, head[1] + 7)], c["skin"], ink, 3)
    painter.arc((head[0] - 14, head[1] + 2, head[0] + 19, head[1] + 29), 5, 175, c["hair"], 8)
    eye_y = head[1] - 5 if pose.expression != "dead" else head[1] + 1
    painter.line([(head[0] + 8, eye_y), (head[0] + 14, eye_y - (2 if pose.expression == "focus" else 0))], ink, 3)
    # Burgundy cap and clean two-feather silhouette.
    painter.arc((head[0] - 30, head[1] - 35, head[0] + 31, head[1] + 2), 180, 360, ink, 12)
    painter.arc((head[0] - 29, head[1] - 34, head[0] + 30, head[1] + 1), 180, 360, c["doublet"], 7)
    feather_base = (head[0] - 13, head[1] - 29)
    painter.line([feather_base, (head[0] - 45, head[1] - 67)], ink, 10)
    painter.line([feather_base, (head[0] - 45, head[1] - 67)], c["clothLight"], 6)
    painter.line([(head[0] - 10, head[1] - 31), (head[0] - 29, head[1] - 70)], ink, 8)
    painter.line([(head[0] - 10, head[1] - 31), (head[0] - 29, head[1] - 70)], c["hose"], 4)

    # The weapon is a separate attachment placed on the fixed front-wrist landmark.
    draw_weapon(painter, weapon, joints["frontWrist"], pose.weapon_angle)
    for wrist in (joints["rearWrist"], joints["frontWrist"]):
        painter.ellipse((wrist[0] - 8, wrist[1] - 8, wrist[0] + 8, wrist[1] + 8), c["skinLight"], ink, 3)


def draw_thug(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["hose"], 30)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["hose"], 22)
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["tunic"], 27)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["skin"], 19)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / length, torso_vec[0] / length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.57
    waist_half = rig["proportions"]["hipWidth"] * 0.72
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["brigandine"], ink, 5)
    painter.line([joints["chest"], joints["pelvis"]], c["tunicDark"], 3)
    for along in (0.25, 0.55, 0.82):
        centre = (mix(joints["chest"][0], joints["pelvis"][0], along), mix(joints["chest"][1], joints["pelvis"][1], along))
        for side in (-21, 21):
            painter.ellipse((centre[0] + across[0] * side - 2, centre[1] + across[1] * side - 2, centre[0] + across[0] * side + 2, centre[1] + across[1] * side + 2), c["metal"], ink, 1)
    # Patched jerkin panel and ochre sash from the canonical reference.
    patch_centre = (mix(joints["chest"][0], joints["pelvis"][0], 0.42) - across[0] * 19, mix(joints["chest"][1], joints["pelvis"][1], 0.42) - across[1] * 19)
    painter.polygon([(patch_centre[0] - 10, patch_centre[1] - 9), (patch_centre[0] + 10, patch_centre[1] - 8), (patch_centre[0] + 9, patch_centre[1] + 10), (patch_centre[0] - 11, patch_centre[1] + 9)], c["leather"], ink, 2)
    sash_left = (joints["pelvis"][0] - across[0] * 34, joints["pelvis"][1] - across[1] * 34)
    sash_right = (joints["pelvis"][0] + across[0] * 34, joints["pelvis"][1] + across[1] * 34)
    painter.line([sash_left, sash_right], ink, 13)
    painter.line([sash_left, sash_right], c["accent"], 8)

    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["hose"], 32)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["hose"], 23)
    draw_boot(painter, joints["rearAnkle"], False, ink, c["leather"])
    draw_boot(painter, joints["frontAnkle"], True, ink, c["leather"])
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["tunic"], 29)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["skin"], 20)

    head = joints["head"]
    radius = rig["proportions"]["headRadius"]
    painter.line([joints["chest"], joints["neck"]], ink, 18)
    painter.line([joints["chest"], joints["neck"]], c["tunic"], 10)
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 5)
    painter.polygon([(head[0] + radius - 4, head[1] - 6), (head[0] + radius + 10, head[1]), (head[0] + radius - 4, head[1] + 7)], c["skin"], ink, 3)
    painter.arc((head[0] - 16, head[1] + 1, head[0] + 19, head[1] + 29), 0, 175, c["hair"], 9)
    painter.line([(head[0] + 7, head[1] - 5), (head[0] + 15, head[1] - 8)], ink, 4)
    # Soft brown cap, reduced to a stable two-shape silhouette.
    painter.polygon([(head[0] - 27, head[1] - 24), (head[0] - 10, head[1] - 39), (head[0] + 20, head[1] - 31), (head[0] + 29, head[1] - 17), (head[0] - 23, head[1] - 11)], c["leather"], ink, 5)

    draw_weapon(painter, weapon, joints["frontWrist"], pose.weapon_angle)
    for wrist in (joints["rearWrist"], joints["frontWrist"]):
        painter.ellipse((wrist[0] - 8, wrist[1] - 8, wrist[0] + 8, wrist[1] + 8), c["skinLight"], ink, 3)


def draw_spear(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["hose"], 28)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["hose"], 20)
    # Mail sleeves read as one cool metal mass against the slate waffenrock.
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["mail"], 25)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["mailDark"], 18)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / length, torso_vec[0] / length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.55
    waist_half = rig["proportions"]["hipWidth"] * 0.7
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["waffenrock"], ink, 5)
    painter.line([joints["chest"], joints["pelvis"]], c["waffenrockDark"], 4)
    # Heraldic breast cross keeps the silhouette readable at phone scale.
    centre = (mix(joints["chest"][0], joints["pelvis"][0], 0.35), mix(joints["chest"][1], joints["pelvis"][1], 0.35))
    painter.line([(centre[0] - 11, centre[1] - 14), (centre[0] + 11, centre[1] + 14)], c["accent"], 9)
    painter.line([(centre[0] + 11, centre[1] - 14), (centre[0] - 11, centre[1] + 14)], c["accent"], 9)
    # Skirt of the waffenrock with one pale hem stripe.
    hem_left = (joints["pelvis"][0] - across[0] * 36, joints["pelvis"][1] - across[1] * 36)
    hem_right = (joints["pelvis"][0] + across[0] * 36, joints["pelvis"][1] + across[1] * 36)
    painter.line([hem_left, hem_right], ink, 14)
    painter.line([hem_left, hem_right], c["clothLight"], 9)

    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["hose"], 30)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["hose"], 21)
    draw_boot(painter, joints["rearAnkle"], False, ink, c["leather"])
    draw_boot(painter, joints["frontAnkle"], True, ink, c["leather"])
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["mail"], 27)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["mailDark"], 19)
    # Leather vambraces over both wrists.
    for wrist in (joints["rearWrist"], joints["frontWrist"]):
        elbow_name = "rearElbow" if wrist is joints["rearWrist"] else "frontElbow"
        elbow = joints[elbow_name]
        painter.line([elbow, wrist], ink, 24)
        painter.line([elbow, wrist], c["leather"], 17)

    head = joints["head"]
    radius = rig["proportions"]["headRadius"]
    painter.line([joints["chest"], joints["neck"]], ink, 18)
    painter.line([joints["chest"], joints["neck"]], c["mail"], 10)
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 5)
    painter.polygon([(head[0] + radius - 4, head[1] - 5), (head[0] + radius + 10, head[1] + 1), (head[0] + radius - 4, head[1] + 7)], c["skin"], ink, 3)
    painter.line([(head[0] + 7, head[1] - 4), (head[0] + 15, head[1] - 7)], ink, 4)
    # Steel kettle hat with a wide down-swept brim.
    painter.arc((head[0] - radius - 4, head[1] - radius - 16, head[0] + radius + 4, head[1] + 2), 180, 360, ink, 10)
    painter.arc((head[0] - radius - 3, head[1] - radius - 15, head[0] + radius + 3, head[1] + 1), 180, 360, c["steel"], 6)
    painter.line([(head[0] - radius - 12, head[1] - 6), (head[0] + radius + 12, head[1] - 6)], ink, 8)
    painter.line([(head[0] - radius - 12, head[1] - 6), (head[0] + radius + 12, head[1] - 6)], c["steelDark"], 4)

    draw_weapon(painter, weapon, joints["frontWrist"], pose.weapon_angle)
    for wrist in (joints["rearWrist"], joints["frontWrist"]):
        painter.ellipse((wrist[0] - 7, wrist[1] - 7, wrist[0] + 7, wrist[1] + 7), c["skinLight"], ink, 3)


def draw_captain(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["plate"], 32)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["mail"], 22)
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["plateLight"], 27)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["plate"], 19)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / length, torso_vec[0] / length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.6
    waist_half = rig["proportions"]["hipWidth"] * 0.72
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["plate"], ink, 6)
    # Breastplate plate highlight and central ridge.
    painter.line([(joints["chest"][0] + across[0] * (shoulder_half - 8), joints["chest"][1] + across[1] * (shoulder_half - 8)),
                  (joints["pelvis"][0] + across[0] * (waist_half - 6), joints["pelvis"][1] + across[1] * (waist_half - 6))], c["plateLight"], 7)
    painter.line([joints["chest"], joints["pelvis"]], c["plateDark"], 4)
    # Crimson fauld skirt under the breastplate.
    fauld_left = (joints["pelvis"][0] - across[0] * 40, joints["pelvis"][1] - across[1] * 40)
    fauld_right = (joints["pelvis"][0] + across[0] * 40, joints["pelvis"][1] + across[1] * 40)
    painter.line([fauld_left, fauld_right], ink, 17)
    painter.line([fauld_left, fauld_right], c["doublet"], 12)
    for offset in (-24, 0, 24):
        painter.line(
            [(joints["pelvis"][0] + across[0] * offset, joints["pelvis"][1] + across[1] * offset),
             (joints["pelvis"][0] + across[0] * offset * 0.82, joints["pelvis"][1] + across[1] * offset * 0.82 + 14)],
            ink, 3,
        )

    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["plate"], 34)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["mail"], 23)
    draw_boot(painter, joints["rearAnkle"], False, ink, c["leather"])
    draw_boot(painter, joints["frontAnkle"], True, ink, c["leather"])
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["plateLight"], 29)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["plate"], 20)
    # Round pauldron caps give the shoulder line a plated read.
    for shoulder in (joints["rearShoulder"], joints["frontShoulder"]):
        painter.ellipse((shoulder[0] - 15, shoulder[1] - 15, shoulder[0] + 15, shoulder[1] + 15), c["plateLight"], ink, 4)

    head = joints["head"]
    radius = rig["proportions"]["headRadius"]
    painter.line([joints["chest"], joints["neck"]], ink, 18)
    painter.line([joints["chest"], joints["neck"]], c["mail"], 10)
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 5)
    painter.polygon([(head[0] + radius - 4, head[1] - 5), (head[0] + radius + 10, head[1] + 1), (head[0] + radius - 4, head[1] + 7)], c["skin"], ink, 3)
    painter.line([(head[0] + 7, head[1] - 4), (head[0] + 15, head[1] - 7)], ink, 4)
    # Open sallet with a swept back and one orange plume.
    painter.arc((head[0] - radius - 2, head[1] - radius - 12, head[0] + radius + 2, head[1] + 4), 200, 20, ink, 11)
    painter.arc((head[0] - radius - 1, head[1] - radius - 11, head[0] + radius + 1, head[1] + 3), 205, 15, c["plateLight"], 6)
    painter.line([(head[0] - 6, head[1] - radius - 8), (head[0] - 26, head[1] - radius - 34)], ink, 8)
    painter.line([(head[0] - 6, head[1] - radius - 8), (head[0] - 26, head[1] - radius - 34)], c["plume"], 5)

    draw_weapon(painter, weapon, joints["frontWrist"], pose.weapon_angle)
    for wrist in (joints["rearWrist"], joints["frontWrist"]):
        painter.ellipse((wrist[0] - 7, wrist[1] - 7, wrist[0] + 7, wrist[1] + 7), c["skinLight"], ink, 3)


def draw_wretch(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["skin"], 24)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["skinLight"], 17)
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["skin"], 23)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["skinLight"], 16)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / length, torso_vec[0] / length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.5
    waist_half = rig["proportions"]["hipWidth"] * 0.66
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["skin"], ink, 5)
    # Gaunt rib shadows.
    for offset in (-14, 0, 14):
        painter.line(
            [(joints["chest"][0] + across[0] * offset, joints["chest"][1] + across[1] * offset + 4),
             (mix(joints["chest"][0], joints["pelvis"][0], 0.35) + across[0] * offset * 0.6, mix(joints["chest"][1], joints["pelvis"][1], 0.35) + across[1] * offset * 0.6)],
            c["ragDark"], 4,
        )
    # Rust-stained rag loincloth and one shoulder wrap.
    painter.line(
        [(joints["pelvis"][0] - across[0] * 32, joints["pelvis"][1] - across[1] * 32),
         (joints["pelvis"][0] + across[0] * 32, joints["pelvis"][1] + across[1] * 32)],
        ink, 14,
    )
    painter.line(
        [(joints["pelvis"][0] - across[0] * 32, joints["pelvis"][1] - across[1] * 32),
         (joints["pelvis"][0] + across[0] * 32, joints["pelvis"][1] + across[1] * 32)],
        c["rag"], 9,
    )
    wrap_centre = (mix(joints["chest"][0], joints["neck"][0], 0.5), mix(joints["chest"][1], joints["neck"][1], 0.5))
    painter.line([wrap_centre, (wrap_centre[0] + across[0] * 20, wrap_centre[1] + across[1] * 20)], c["rag"], 12)

    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["skin"], 26)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["skinLight"], 18)
    # Bare cracked feet instead of boots: a short dark wedge per foot.
    for ankle, front in ((joints["rearAnkle"], False), (joints["frontAnkle"], True)):
        direction = 1 if front else -1
        painter.polygon(
            [(ankle[0] - 9 * direction, ankle[1] - 8), (ankle[0] + 13 * direction, ankle[1] - 2), (ankle[0] + 15 * direction, GROUND_Y), (ankle[0] - 11 * direction, GROUND_Y)],
            c["skinLight"], ink, 3,
        )
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["skin"], 25)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["skinLight"], 17)

    head = joints["head"]
    radius = rig["proportions"]["headRadius"]
    painter.line([joints["chest"], joints["neck"]], ink, 16)
    painter.line([joints["chest"], joints["neck"]], c["skin"], 9)
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 5)
    painter.polygon([(head[0] + radius - 4, head[1] - 5), (head[0] + radius + 10, head[1] + 1), (head[0] + radius - 4, head[1] + 7)], c["skin"], ink, 3)
    # Sunken eye and broken chain collar.
    painter.line([(head[0] + 6, head[1] - 4), (head[0] + 14, head[1] - 2)], ink, 4)
    painter.line([(head[0] + 7, head[1] + 6), (head[0] + 12, head[1] + 7)], ink, 3)
    painter.arc((head[0] - radius - 2, head[1] - 8, head[0] + radius + 2, head[1] + 12), 250, 110, ink, 8)
    painter.arc((head[0] - radius - 2, head[1] - 8, head[0] + radius + 2, head[1] + 12), 250, 110, c["chain"], 4)

    draw_claws(painter, joints, c, 17)


def draw_grotesque(painter: Painter, rig: dict[str, Any], weapon: dict[str, Any], pose: Pose, joints: dict[str, Point]) -> None:
    c = {name: hex_rgba(value) for name, value in rig["palette"].items()}
    ink = c["ink"]
    if pose.motion_arc:
        draw_motion_arc(painter, pose.zone, ink)

    thick_limb(painter, [joints["rearHip"], joints["rearKnee"]], ink, c["hide"], 42)
    thick_limb(painter, [joints["rearKnee"], joints["rearAnkle"]], ink, c["hideDark"], 32)
    thick_limb(painter, [joints["rearShoulder"], joints["rearElbow"]], ink, c["hide"], 40)
    thick_limb(painter, [joints["rearElbow"], joints["rearWrist"]], ink, c["hideDark"], 30)

    torso_vec = (joints["chest"][0] - joints["pelvis"][0], joints["chest"][1] - joints["pelvis"][1])
    length = max(1.0, math.hypot(*torso_vec))
    across = (-torso_vec[1] / length, torso_vec[0] / length)
    shoulder_half = rig["proportions"]["shoulderWidth"] * 0.62
    waist_half = rig["proportions"]["hipWidth"] * 0.78
    torso = [
        (joints["chest"][0] - across[0] * shoulder_half, joints["chest"][1] - across[1] * shoulder_half),
        (joints["chest"][0] + across[0] * shoulder_half, joints["chest"][1] + across[1] * shoulder_half),
        (joints["pelvis"][0] + across[0] * waist_half, joints["pelvis"][1] + across[1] * waist_half),
        (joints["pelvis"][0] - across[0] * waist_half, joints["pelvis"][1] - across[1] * waist_half),
    ]
    painter.polygon(torso, c["hide"], ink, 6)
    # Cracked hide plates with ember glow in the seams.
    for along in (0.18, 0.45, 0.72):
        centre = (mix(joints["chest"][0], joints["pelvis"][0], along), mix(joints["chest"][1], joints["pelvis"][1], along))
        for side in (-30, 0, 30):
            painter.line(
                [(centre[0] + across[0] * side - 12, centre[1] + across[1] * side), (centre[0] + across[0] * side + 12, centre[1] + across[1] * side)],
                ink, 5,
            )
            painter.line(
                [(centre[0] + across[0] * side - 10, centre[1] + across[1] * side), (centre[0] + across[0] * side + 10, centre[1] + across[1] * side)],
                c["ember"], 2,
            )
    # Iron band girdle and a dragging broken chain.
    painter.line(
        [(joints["pelvis"][0] - across[0] * 44, joints["pelvis"][1] - across[1] * 44),
         (joints["pelvis"][0] + across[0] * 44, joints["pelvis"][1] + across[1] * 44)],
        ink, 16,
    )
    painter.line(
        [(joints["pelvis"][0] - across[0] * 44, joints["pelvis"][1] - across[1] * 44),
         (joints["pelvis"][0] + across[0] * 44, joints["pelvis"][1] + across[1] * 44)],
        c["chain"], 10,
    )
    drag_start = (joints["pelvis"][0] - across[0] * 40, joints["pelvis"][1] - across[1] * 40)
    painter.line([drag_start, (drag_start[0] - 34, GROUND_Y - 4), (drag_start[0] - 20, GROUND_Y - 2)], c["chain"], 7)

    thick_limb(painter, [joints["frontHip"], joints["frontKnee"]], ink, c["hide"], 44)
    thick_limb(painter, [joints["frontKnee"], joints["frontAnkle"]], ink, c["hideDark"], 33)
    # Clawed feet.
    for ankle, front in ((joints["rearAnkle"], False), (joints["frontAnkle"], True)):
        direction = 1 if front else -1
        painter.polygon(
            [(ankle[0] - 14 * direction, ankle[1] - 12), (ankle[0] + 18 * direction, ankle[1] - 4), (ankle[0] + 21 * direction, GROUND_Y), (ankle[0] - 16 * direction, GROUND_Y)],
            c["hideDark"], ink, 4,
        )
        for claw_offset in (-8, 0, 8):
            painter.line([(ankle[0] + claw_offset * direction, GROUND_Y - 1), (ankle[0] + (claw_offset + 6) * direction, GROUND_Y)], c["claw"], 4)
    thick_limb(painter, [joints["frontShoulder"], joints["frontElbow"]], ink, c["hide"], 42)
    thick_limb(painter, [joints["frontElbow"], joints["frontWrist"]], ink, c["hideDark"], 31)
    # Massive pauldron plates.
    for shoulder in (joints["rearShoulder"], joints["frontShoulder"]):
        painter.ellipse((shoulder[0] - 24, shoulder[1] - 24, shoulder[0] + 24, shoulder[1] + 24), c["plateLight"], ink, 5)
        painter.arc((shoulder[0] - 24, shoulder[1] - 24, shoulder[0] + 24, shoulder[1] + 24), 200, 60, c["rust"], 4)

    head = joints["head"]
    radius = rig["proportions"]["headRadius"]
    painter.line([joints["chest"], joints["neck"]], ink, 24)
    painter.line([joints["chest"], joints["neck"]], c["hideDark"], 14)
    painter.ellipse((head[0] - radius, head[1] - radius, head[0] + radius, head[1] + radius), c["skin"], ink, 6)
    # Heavy brow, ember eye, and broken chain mane.
    painter.line([(head[0] + 2, head[1] - 10), (head[0] + radius + 4, head[1] - 8)], ink, 8)
    painter.line([(head[0] + 8, head[1] - 4), (head[0] + 18, head[1] - 4)], c["ember"], 5)
    painter.arc((head[0] - radius - 4, head[1] - radius - 2, head[0] + radius, head[1] + radius), 160, 350, ink, 10)
    painter.arc((head[0] - radius - 4, head[1] - radius - 2, head[0] + radius, head[1] + radius), 160, 350, c["chain"], 5)
    painter.polygon([(head[0] + radius - 6, head[1] + 4), (head[0] + radius + 12, head[1] + 8), (head[0] + radius - 4, head[1] + 12)], c["skinLight"], ink, 3)

    draw_claws(painter, joints, c, 26)


def base_pose(actor: str) -> Pose:
    if actor == "meyer":
        return Pose(torso=-90, rear_leg=(101, 81), front_leg=(78, 101), rear_arm=(108, 61), front_arm=(70, 109), weapon_angle=-64)
    if actor == "spear":
        return Pose(torso=-86, rear_leg=(104, 80), front_leg=(76, 102), rear_arm=(96, 58), front_arm=(62, 100), weapon_angle=-34)
    if actor == "captain":
        return Pose(torso=-85, rear_leg=(103, 81), front_leg=(77, 101), rear_arm=(100, 60), front_arm=(66, 106), weapon_angle=-52)
    if actor == "wretch":
        return Pose(torso=-80, rear_leg=(107, 77), front_leg=(73, 105), rear_arm=(112, 70), front_arm=(64, 116), weapon_angle=-30)
    if actor == "grotesque":
        return Pose(torso=-72, rear_leg=(112, 74), front_leg=(68, 108), rear_arm=(118, 74), front_arm=(58, 122), weapon_angle=-26)
    return Pose(torso=-84, rear_leg=(105, 79), front_leg=(75, 103), rear_arm=(111, 64), front_arm=(68, 112), weapon_angle=-66)


def crouched_pose(actor: str, weapon_angle: float = -18) -> Pose:
    if actor == "meyer":
        return Pose(torso=-77, root_dx=-34, rear_leg=(58, 119), front_leg=(126, 58), rear_arm=(42, 74), front_arm=(17, 43), weapon_angle=weapon_angle)
    if actor == "spear":
        return Pose(torso=-76, root_dx=-26, rear_leg=(56, 120), front_leg=(127, 56), rear_arm=(44, 72), front_arm=(19, 45), weapon_angle=weapon_angle)
    if actor == "captain":
        return Pose(torso=-74, root_dx=-26, rear_leg=(56, 121), front_leg=(126, 57), rear_arm=(45, 73), front_arm=(20, 46), weapon_angle=weapon_angle)
    if actor == "wretch":
        return Pose(torso=-70, root_dx=-22, rear_leg=(53, 123), front_leg=(129, 54), rear_arm=(47, 77), front_arm=(22, 49), weapon_angle=weapon_angle)
    if actor == "grotesque":
        return Pose(torso=-66, root_dx=-20, rear_leg=(52, 124), front_leg=(130, 53), rear_arm=(48, 78), front_arm=(23, 50), weapon_angle=weapon_angle)
    return Pose(torso=-72, root_dx=-24, rear_leg=(55, 122), front_leg=(128, 55), rear_arm=(46, 76), front_arm=(21, 48), weapon_angle=weapon_angle)


def state_pose(actor: str, state: str, index: int) -> Pose:
    base = base_pose(actor)
    phase = index / FRAME_COUNT * math.tau
    wave = math.sin(phase)
    if state == "idle":
        return replace(base, torso=base.torso + wave * 1.6, root_dx=wave * 1.5, weapon_angle=base.weapon_angle + wave * 2.5)
    if state == "move":
        stride = wave * 22
        return replace(
            base,
            torso=base.torso + 4,
            root_dx=math.sin(phase * 2) * 2,
            rear_leg=(101 + stride, 83 - stride * 0.55),
            front_leg=(79 - stride, 99 + stride * 0.55),
            rear_arm=(103 - stride * 0.45, 70 - stride * 0.3),
            front_arm=(74 + stride * 0.35, 105 + stride * 0.25),
            weapon_angle=-67 + wave * 4,
        )
    if state == "crouch":
        crouch = crouched_pose(actor)
        settle = (0, 0.35, 0.72, 1, 0.86, 1)[index]
        return Pose(
            torso=mix(base.torso, crouch.torso, settle),
            root_dx=mix(base.root_dx, crouch.root_dx, settle),
            rear_leg=(mix(base.rear_leg[0], crouch.rear_leg[0], settle), mix(base.rear_leg[1], crouch.rear_leg[1], settle)),
            front_leg=(mix(base.front_leg[0], crouch.front_leg[0], settle), mix(base.front_leg[1], crouch.front_leg[1], settle)),
            rear_arm=(mix(base.rear_arm[0], crouch.rear_arm[0], settle), mix(base.rear_arm[1], crouch.rear_arm[1], settle)),
            front_arm=(mix(base.front_arm[0], crouch.front_arm[0], settle), mix(base.front_arm[1], crouch.front_arm[1], settle)),
            weapon_angle=mix(base.weapon_angle, crouch.weapon_angle, settle),
        )
    if state == "dodge":
        amount = (0, 0.5, 1, 1, 0.55, 0)[index]
        crouch = crouched_pose(actor, -8)
        return replace(crouch, torso=mix(base.torso, -58 if actor == "meyer" else -55, amount), root_dx=mix(0, -58 if actor == "meyer" else -44, amount), weapon_angle=mix(base.weapon_angle, -10, amount))
    if state == "block":
        amount = (0.55, 0.8, 1, 0.92, 1, 0.86)[index]
        return replace(base, torso=base.torso + 3, rear_arm=(42, 18), front_arm=(25, -12), weapon_angle=mix(-58, -47, amount))
    if state == "switch":
        angles = (-68, -30, 12, 58, -12, -68)
        return replace(base, rear_arm=(88, 44), front_arm=(74, 52), weapon_angle=angles[index], torso=base.torso + math.sin(phase) * 4)
    if state in ("hitstun", "hitstun_torso"):
        force = (0.4, 1, 0.82, 0.56, 0.25, 0)[index]
        return replace(base, torso=base.torso - force * 30, root_dx=-force * 11, rear_arm=(138, 116), front_arm=(122, 145), weapon_angle=-85 + force * 28, expression="hurt", cue="contact" if index == 0 else "recovery")
    if state == "hitstun_head":
        force = (0.45, 1, 0.84, 0.56, 0.24, 0)[index]
        return replace(base, torso=base.torso - force * 38, root_dx=-force * 12, rear_arm=(150, 98), front_arm=(120, 62), weapon_angle=-92, expression="hurt", cue="contact" if index == 0 else "recovery")
    if state == "hitstun_legs":
        force = (0.45, 1, 0.9, 0.6, 0.28, 0)[index]
        crouch = crouched_pose(actor, -12)
        return replace(crouch, torso=crouch.torso - force * 16, root_dx=-force * 14, rear_arm=(87, 63), front_arm=(54, 91), expression="hurt", cue="contact" if index == 0 else "recovery")
    if state == "guardbreak":
        force = (0.2, 0.72, 1, 0.82, 0.48, 0.25)[index]
        return replace(base, torso=base.torso - force * 24, root_dx=-force * 14, rear_arm=(155, 130), front_arm=(24, -18), weapon_angle=-127 + force * 16, expression="hurt", cue="contact" if index < 2 else "recovery")
    if state == "dead":
        settle = (0.08, 0.3, 0.58, 0.82, 1, 1)[index]
        return Pose(
            torso=mix(base.torso, -10, settle),
            root_dx=mix(0, -38, settle),
            rear_leg=(mix(base.rear_leg[0], 165, settle), mix(base.rear_leg[1], 165, settle)),
            front_leg=(mix(base.front_leg[0], 22, settle), mix(base.front_leg[1], 18, settle)),
            rear_arm=(mix(base.rear_arm[0], 165, settle), mix(base.rear_arm[1], 168, settle)),
            front_arm=(mix(base.front_arm[0], 14, settle), mix(base.front_arm[1], 8, settle)),
            weapon_angle=mix(base.weapon_angle, -125, settle),
            expression="dead",
            cue="contact" if index == 0 else "recovery",
        )
    raise ValueError(f"Unknown state: {state}")


def attack_pose(actor: str, zone: str, index: int, heavy: bool, weapon_kind: str | None = None) -> Pose:
    base = base_pose(actor)
    weight = 1.0 if heavy else 0.72
    # Anyone holding a shaft plants their feet and delivers reach with the point
    # instead of a deep forward lunge, so the long shaft keeps its safety margin.
    # That holds for the spearman and for Meyer once he picks one up.
    lunge = 0.62 if actor == "spear" or weapon_kind == "spear" else 1.0
    # The soldier was trained to plant his shaft; a fencing master who has just
    # grabbed one braces it further back, which also keeps the point inside the
    # canvas margin that the soldier's own stance only just respects.
    brace = 40.0 if weapon_kind == "spear" and actor != "spear" else 0.0
    if index == 0:
        return replace(base, cue="anticipation", zone=zone)
    if zone == "head":
        if index == 1:
            return replace(base, torso=-98, root_dx=-8, rear_arm=(12, -25), front_arm=(-25, -55), weapon_angle=-101, cue="anticipation", zone=zone)
        if index == 2:
            return replace(base, torso=-78, root_dx=-78 * weight - brace, rear_leg=(106, 78), front_leg=(68, 111), rear_arm=(27, 5), front_arm=(-4, 22), weapon_angle=-24, cue="contact", zone=zone, motion_arc=True)
        if index == 3:
            return replace(base, torso=-67, root_dx=-70 * weight * lunge - brace, rear_arm=(42, 24), front_arm=(18, 42), weapon_angle=17, cue="overshoot", zone=zone, motion_arc=True)
    elif zone == "legs":
        crouch = crouched_pose(actor, 14 if heavy else 8)
        if index == 1:
            return replace(crouch, torso=-89, root_dx=-12, rear_arm=(126, 90), front_arm=(111, 68), weapon_angle=-146, cue="anticipation", zone=zone)
        if index == 2:
            return replace(crouch, torso=-63, root_dx=-78 * weight, rear_arm=(44, 64), front_arm=(19, 38), weapon_angle=18 if heavy else 11, cue="contact", zone=zone, motion_arc=True)
        if index == 3:
            return replace(crouch, torso=-54, root_dx=-72 * weight * lunge, rear_arm=(60, 78), front_arm=(35, 54), weapon_angle=37 if heavy else 28, cue="overshoot", zone=zone, motion_arc=True)
    else:
        if index == 1:
            return replace(base, torso=-98, root_dx=-8, rear_arm=(142, 116), front_arm=(125, 154), weapon_angle=-158, cue="anticipation", zone=zone)
        if index == 2:
            return replace(base, torso=-74, root_dx=-78 * weight * lunge - brace, rear_arm=(38, 28), front_arm=(9, 12), weapon_angle=-3, cue="contact", zone=zone, motion_arc=True)
        if index == 3:
            return replace(base, torso=-65, root_dx=-72 * weight * lunge - brace, rear_arm=(55, 42), front_arm=(23, 38), weapon_angle=21, cue="overshoot", zone=zone, motion_arc=True)
    if index == 4:
        recovery = 0.55 if heavy else 0.38
        return replace(base, torso=mix(base.torso, -72, recovery), root_dx=-7 * weight, rear_arm=(89, 63), front_arm=(61, 82), weapon_angle=39 if zone == "legs" else -24, cue="recovery", zone=zone)
    return replace(base, cue="neutral", zone=zone)


MEYER_ATTACKS: dict[str, tuple[str, bool]] = {
    # Improvised kits. Meyer can pick up anything and swing it, but only the two
    # fencing weapons carry his learned routes: a club has a two-beat cut and a
    # hurled throw, a spear has a planted thrust, and that is the whole kit.
    "cl_l1": ("torso", False), "cl_l2": ("torso", False), "cl_h": ("head", True),
    "cl_throw": ("head", True),
    "sp_l1": ("torso", False), "sp_h": ("torso", True), "sp_throw": ("head", True),
    "ls_l1": ("torso", False), "ls_l2": ("torso", False), "ls_l3": ("head", True),
    "ls_lh": ("head", True), "ls_l2h": ("torso", True), "ls_h": ("head", True),
    "ls_hl": ("torso", False), "ls_dodge_l": ("torso", False), "ls_air_l": ("head", True),
    "ls_counter": ("head", True), "ls_switch_in": ("torso", False),
    "ls_low_l": ("legs", False), "ls_low_h": ("legs", True),
    "ds_l1": ("torso", False), "ds_l2": ("torso", False), "ds_l3": ("torso", False),
    "ds_lh": ("head", True), "ds_l2h": ("torso", True), "ds_h": ("head", True),
    "ds_hl": ("torso", False), "ds_dodge_l": ("torso", False), "ds_air_l": ("head", True),
    "ds_counter": ("head", True), "ds_switch_in": ("torso", False),
    "ds_low_l": ("legs", False), "ds_low_h": ("legs", True),
}

THUG_ATTACKS: dict[str, tuple[str, bool]] = {
    "thug_overhead": ("head", True),
    "thug_body": ("torso", False),
    "thug_low": ("legs", True),
}

SPEAR_ATTACKS: dict[str, tuple[str, bool]] = {
    "spear_thrust": ("torso", True),
}
CAPTAIN_ATTACKS: dict[str, tuple[str, bool]] = {
    "captain_cut": ("head", True),
    "captain_bash": ("torso", True),
}
WRETCH_ATTACKS: dict[str, tuple[str, bool]] = {
    "wretch_claw": ("torso", False),
}
GROTESQUE_ATTACKS: dict[str, tuple[str, bool]] = {
    "boss_sweep": ("legs", True),
    "boss_leap": ("torso", True),
    "boss_shock": ("torso", True),
}

# States are the exact runtime inventory: NPCs only animate what the
# simulation can present, and each actor carries its own generic hitstun.
NPC_WEAPONS = {
    "thug": "club",
    "spear": "spear",
    "captain": "captain-sword",
    # Claw actors carry no weapon attachment; "claws" names their clip folder.
    "wretch": "claws",
    "grotesque": "claws",
}
NPC_ATTACKS = {
    "thug": THUG_ATTACKS,
    "spear": SPEAR_ATTACKS,
    "captain": CAPTAIN_ATTACKS,
    "wretch": WRETCH_ATTACKS,
    "grotesque": GROTESQUE_ATTACKS,
}
NPC_STATES = {
    "thug": ("idle", "move", "crouch", "dodge", "block", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead"),
    "spear": ("idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"),
    "captain": ("idle", "move", "block", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead"),
    "wretch": ("idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"),
    "grotesque": ("idle", "move", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "dead"),
}

STATES = ("idle", "move", "crouch", "dodge", "block", "switch", "hitstun", "hitstun_head", "hitstun_torso", "hitstun_legs", "guardbreak", "dead")


# Meyer's kits: the two fencing weapons he trained with and the improvised
# things he can pick up off the street. One prefix per kit, so the attack table
# stays a single source of truth.
MEYER_KITS: tuple[tuple[str, str], ...] = (("longsword", "ls_"), ("dussack", "ds_"), ("club", "cl_"), ("spear", "sp_"))


def clip_inventory() -> list[dict[str, Any]]:
    clips: list[dict[str, Any]] = []
    for weapon, prefix in MEYER_KITS:
        for state in STATES:
            clips.append({"actor": "meyer", "weapon": weapon, "id": state, "kind": "state", "playback": "loop" if state in ("idle", "move", "crouch", "block") else "once"})
        for attack_id, (zone, heavy) in MEYER_ATTACKS.items():
            if attack_id.startswith(prefix):
                clips.append({"actor": "meyer", "weapon": weapon, "id": attack_id, "kind": "attack", "zone": zone, "heavy": heavy, "playback": "once"})
    for actor in ("thug", "spear", "captain", "wretch", "grotesque"):
        weapon_name = NPC_WEAPONS[actor]
        for state in NPC_STATES[actor]:
            clips.append({"actor": actor, "weapon": weapon_name, "id": state, "kind": "state", "playback": "loop" if state in ("idle", "move", "crouch", "block") else "once"})
    for actor in ("thug", "spear", "captain", "wretch", "grotesque"):
        weapon_name = NPC_WEAPONS[actor]
        for attack_id, (zone, heavy) in NPC_ATTACKS[actor].items():
            clips.append({"actor": actor, "weapon": weapon_name, "id": attack_id, "kind": "attack", "zone": zone, "heavy": heavy, "playback": "once"})
    return clips


def render_frame(rig: dict[str, Any], weapon: dict[str, Any], clip: dict[str, Any], index: int) -> tuple[Image.Image, Pose, dict[str, Point]]:
    actor = clip["actor"]
    pose = attack_pose(actor, clip["zone"], index, bool(clip["heavy"]), weapon.get("kind")) if clip["kind"] == "attack" else state_pose(actor, clip["id"], index)
    joints = skeleton(rig, pose)
    painter = Painter()
    if actor == "meyer":
        draw_meyer(painter, rig, weapon, pose, joints)
    elif actor == "thug":
        draw_thug(painter, rig, weapon, pose, joints)
    elif actor == "spear":
        draw_spear(painter, rig, weapon, pose, joints)
    elif actor == "captain":
        draw_captain(painter, rig, weapon, pose, joints)
    elif actor == "wretch":
        draw_wretch(painter, rig, weapon, pose, joints)
    else:
        draw_grotesque(painter, rig, weapon, pose, joints)
    image = painter.finish()
    return image, pose, joints


def save_lossless_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", lossless=True, quality=100, method=3, exact=True)


def make_preview_frame(image: Image.Image, label: str, width: int = 384, height: int = 420) -> Image.Image:
    tile = Image.new("RGBA", (width, height), (27, 25, 24, 255))
    checker = ImageDraw.Draw(tile)
    for y in range(0, 384, 24):
        for x in range(0, 384, 24):
            checker.rectangle((x, y, x + 23, y + 23), fill=(43, 40, 37, 255) if (x // 24 + y // 24) % 2 else (50, 46, 42, 255))
    tile.alpha_composite(image, (0, 0))
    checker.line((0, GROUND_Y, width, GROUND_Y), fill=(200, 153, 76, 150), width=1)
    checker.text((12, 391), label, fill=(238, 225, 198, 255), font=ImageFont.load_default())
    return tile


def preview_sheet(out: Path, rows: Sequence[tuple[str, Sequence[Path]]], columns: int = FRAME_COUNT) -> None:
    tile_w, tile_h = 384, 420
    sheet = Image.new("RGBA", (tile_w * columns, tile_h * len(rows)), (21, 19, 18, 255))
    for row_index, (label, frames) in enumerate(rows):
        for column, frame in enumerate(frames[:columns]):
            image = Image.open(frame).convert("RGBA")
            tile = make_preview_frame(image, f"{label} · {column + 1:02d}")
            sheet.alpha_composite(tile, (column * tile_w, row_index * tile_h))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "PNG", optimize=True)


def build_previews(output: Path) -> None:
    def paths(actor: str, weapon: str, clip: str) -> list[Path]:
        return [output / actor / weapon / clip / f"{index:02d}.webp" for index in range(1, FRAME_COUNT + 1)]

    preview_sheet(output / "previews/meyer-longsword-animation.png", [
        ("idle", paths("meyer", "longsword", "idle")),
        ("move", paths("meyer", "longsword", "move")),
        ("crouch", paths("meyer", "longsword", "crouch")),
        ("directional dodge", paths("meyer", "longsword", "dodge")),
        ("head / heavy", paths("meyer", "longsword", "ls_h")),
        ("torso / light", paths("meyer", "longsword", "ls_l1")),
        ("legs / duck-light", paths("meyer", "longsword", "ls_low_l")),
        ("legs / duck-heavy", paths("meyer", "longsword", "ls_low_h")),
    ])
    preview_sheet(output / "previews/meyer-dussack-animation.png", [
        ("idle", paths("meyer", "dussack", "idle")),
        ("move", paths("meyer", "dussack", "move")),
        ("crouch", paths("meyer", "dussack", "crouch")),
        ("directional dodge", paths("meyer", "dussack", "dodge")),
        ("head / heavy", paths("meyer", "dussack", "ds_h")),
        ("torso / light", paths("meyer", "dussack", "ds_l1")),
        ("legs / duck-light", paths("meyer", "dussack", "ds_low_l")),
        ("legs / duck-heavy", paths("meyer", "dussack", "ds_low_h")),
    ])
    preview_sheet(output / "previews/thug-animation.png", [
        ("idle", paths("thug", "club", "idle")),
        ("move", paths("thug", "club", "move")),
        ("crouch", paths("thug", "club", "crouch")),
        ("guard", paths("thug", "club", "block")),
        ("head / overhead", paths("thug", "club", "thug_overhead")),
        ("torso / body", paths("thug", "club", "thug_body")),
        ("legs / sweep", paths("thug", "club", "thug_low")),
        ("defeat", paths("thug", "club", "dead")),
    ])
    preview_sheet(output / "previews/spear-animation.png", [
        ("idle", paths("spear", "spear", "idle")),
        ("move", paths("spear", "spear", "move")),
        ("thrust", paths("spear", "spear", "spear_thrust")),
        ("hit", paths("spear", "spear", "hitstun")),
        ("defeat", paths("spear", "spear", "dead")),
    ])
    preview_sheet(output / "previews/captain-animation.png", [
        ("idle", paths("captain", "captain-sword", "idle")),
        ("move", paths("captain", "captain-sword", "move")),
        ("guard", paths("captain", "captain-sword", "block")),
        ("cut", paths("captain", "captain-sword", "captain_cut")),
        ("bash", paths("captain", "captain-sword", "captain_bash")),
        ("guardbreak", paths("captain", "captain-sword", "guardbreak")),
        ("defeat", paths("captain", "captain-sword", "dead")),
    ])
    preview_sheet(output / "previews/wretch-animation.png", [
        ("idle", paths("wretch", "claws", "idle")),
        ("move", paths("wretch", "claws", "move")),
        ("claw", paths("wretch", "claws", "wretch_claw")),
        ("hit", paths("wretch", "claws", "hitstun")),
        ("defeat", paths("wretch", "claws", "dead")),
    ])
    preview_sheet(output / "previews/grotesque-animation.png", [
        ("idle", paths("grotesque", "claws", "idle")),
        ("move", paths("grotesque", "claws", "move")),
        ("sweep", paths("grotesque", "claws", "boss_sweep")),
        ("leap", paths("grotesque", "claws", "boss_leap")),
        ("shock", paths("grotesque", "claws", "boss_shock")),
        ("defeat", paths("grotesque", "claws", "dead")),
    ])
    contacts = [
        ("Spear · head", paths("spear", "spear", "hitstun_head")[0]),
        ("Spear · torso", paths("spear", "spear", "hitstun")[0]),
        ("Spear · legs", paths("spear", "spear", "hitstun_legs")[0]),
        ("Captain · head", paths("captain", "captain-sword", "hitstun_head")[0]),
        ("Captain · torso", paths("captain", "captain-sword", "hitstun")[0]),
        ("Captain · legs", paths("captain", "captain-sword", "hitstun_legs")[0]),
        ("Wretch · head", paths("wretch", "claws", "hitstun_head")[0]),
        ("Wretch · torso", paths("wretch", "claws", "hitstun")[0]),
        ("Wretch · legs", paths("wretch", "claws", "hitstun_legs")[0]),
        ("Grotesque · head", paths("grotesque", "claws", "hitstun_head")[0]),
        ("Grotesque · torso", paths("grotesque", "claws", "hitstun")[0]),
        ("Grotesque · legs", paths("grotesque", "claws", "hitstun_legs")[0]),
        ("Meyer LS · head", paths("meyer", "longsword", "ls_h")[2]),
        ("Meyer LS · torso", paths("meyer", "longsword", "ls_l1")[2]),
        ("Meyer LS · legs", paths("meyer", "longsword", "ls_low_h")[2]),
        ("Meyer DS · head", paths("meyer", "dussack", "ds_h")[2]),
        ("Meyer DS · torso", paths("meyer", "dussack", "ds_l1")[2]),
        ("Meyer DS · legs", paths("meyer", "dussack", "ds_low_h")[2]),
        ("Thug · head", paths("thug", "club", "thug_overhead")[2]),
        ("Thug · torso", paths("thug", "club", "thug_body")[2]),
        ("Thug · legs", paths("thug", "club", "thug_low")[2]),
    ]
    columns = 3
    rows = math.ceil(len(contacts) / columns)
    sheet = Image.new("RGBA", (384 * columns, 420 * rows), (21, 19, 18, 255))
    for index, (label, path) in enumerate(contacts):
        tile = make_preview_frame(Image.open(path).convert("RGBA"), label)
        sheet.alpha_composite(tile, ((index % columns) * 384, (index // columns) * 420))
    sheet.save(output / "previews/contact-zones.png", "PNG", optimize=True)


def generate(output: Path, clean: bool) -> dict[str, Any]:
    if clean and output.exists():
        for child in output.iterdir():
            if child.name not in ("source", "README.md"):
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    output.mkdir(parents=True, exist_ok=True)
    rigs = {name: load_json(SOURCE / f"rigs/{name}.json") for name in ("meyer", "thug", "spear", "captain", "wretch", "grotesque")}
    if any(rig.get("rasterScale") != RASTER_SCALE for rig in rigs.values()):
        raise ValueError(f"Every rig must use the canonical raster scale {RASTER_SCALE}")
    weapons = {name: load_json(SOURCE / f"weapons/{name}.json") for name in ("longsword", "dussack", "club", "spear", "captain-sword")}
    manifest: dict[str, Any] = {
        "schemaVersion": 2,
        "generator": "tools/generate-fixed-rig-art-v2.py",
        "canvas": list(CANVAS),
        "rootScalePolicy": "one canonical scale per actor; no alpha-mass or per-clip correction",
        "rasterScale": RASTER_SCALE,
        "groundPolicy": "bottom-centre root at [192,350], maximum one pixel drift",
        "actors": {name: {"rigId": rig["id"], "rootScale": rig["rootScale"], "rasterScale": rig["rasterScale"], "footAnchor": rig["footAnchor"], "proportions": rig["proportions"]} for name, rig in rigs.items()},
        "clips": [],
    }
    for clip in clip_inventory():
        rig = rigs[clip["actor"]]
        weapon = weapons[clip["weapon"]] if clip["weapon"] in weapons else {"kind": "none", "palette": {}}
        clip_dir = output / clip["actor"] / clip["weapon"] / clip["id"]
        clip_dir.mkdir(parents=True, exist_ok=True)
        frame_records: list[dict[str, Any]] = []
        for index in range(FRAME_COUNT):
            image, pose, joints = render_frame(rig, weapon, clip, index)
            frame_path = clip_dir / f"{index + 1:02d}.webp"
            save_lossless_webp(image, frame_path)
            alpha_bbox = image.getchannel("A").getbbox()
            frame_records.append({
                "file": frame_path.relative_to(output).as_posix(),
                "holdTicks": FRAME_HOLDS[index],
                "cue": pose.cue if clip["kind"] == "state" else FRAME_CUES[index],
                "rootScale": rig["rootScale"],
                "rasterScale": rig["rasterScale"],
                "footAnchor": rig["footAnchor"],
                "alphaBBox": list(alpha_bbox) if alpha_bbox else None,
                "groundRow": (alpha_bbox[3] - 1) if alpha_bbox else None,
                "landmarks": {name: [round(Painter.transform(value)[0], 3), round(Painter.transform(value)[1], 3)] for name, value in joints.items()},
                "sha256": sha256(frame_path),
            })
        clip_record = {**clip, "canvas": list(CANVAS), "rootScale": rig["rootScale"], "rasterScale": rig["rasterScale"], "footAnchor": rig["footAnchor"], "frames": frame_records}
        with (clip_dir / "clip.json").open("w", encoding="utf-8") as handle:
            json.dump(clip_record, handle, indent=2, sort_keys=True)
            handle.write("\n")
        manifest["clips"].append(clip_record)
    manifest["inventory"] = {
        "clipCount": len(manifest["clips"]),
        "frameCount": sum(len(clip["frames"]) for clip in manifest["clips"]),
        "actorClipCounts": {
            actor: sum(clip["actor"] == actor for clip in manifest["clips"])
            for actor in ("meyer", "thug", "spear", "captain", "wretch", "grotesque")
        },
    }
    with (output / "manifest-v2.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")
    build_previews(output)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--no-clean", action="store_true", help="Preserve stale generated files")
    args = parser.parse_args()
    manifest = generate(args.out.resolve(), clean=not args.no_clean)
    print(json.dumps({"output": str(args.out.resolve()), **manifest["inventory"]}, indent=2))


if __name__ == "__main__":
    main()
