import { clamp } from '../sim/math.js';
import { laneDepthRange, levelExitX, roadBounds } from '../sim/world.js';
import { laneNarrowingAt } from '../sim/waves.js';
import type { GameSnapshot, SceneryId } from '../sim/types.js';

export type ProceduralDrawingContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

type ProceduralSurface = OffscreenCanvas | HTMLCanvasElement;

const SURFACE_WIDTH = 3072;
const SURFACE_HEIGHT = 306;
const HORIZON = 236;
const ROAD_BOTTOM = 720;
const SCENES: readonly SceneryId[] = ['cobbled-streets', 'town-gate', 'sala-darmi', 'castello'];
const MAX_SURFACE_COUNT = SCENES.length;

type ScenePalette = {
  distantWall: string;
  distantRoof: string;
  distantRoofLight: string;
  plaster: string;
  plasterWarm: string;
  plasterShade: string;
  masonry: string;
  masonryLight: string;
  masonryDark: string;
  wood: string;
  woodLight: string;
  roof: string;
  roofAlt: string;
  roofDark: string;
  window: string;
  windowFrame: string;
  accent: string;
  accentAlt: string;
  ground: string;
};

const SCENE_PALETTES: Readonly<Record<SceneryId, ScenePalette>> = {
  'cobbled-streets': {
    distantWall: '#657a7d',
    distantRoof: '#344952',
    distantRoofLight: '#5c6d70',
    plaster: '#9a8b7b',
    plasterWarm: '#ad9475',
    plasterShade: '#6f7c79',
    masonry: '#66777a',
    masonryLight: '#9ba39a',
    masonryDark: '#435b62',
    wood: '#4b3b34',
    woodLight: '#876348',
    roof: '#3e3034',
    roofAlt: '#584146',
    roofDark: '#263b45',
    window: '#d59a55',
    windowFrame: '#1d3039',
    accent: '#a5484d',
    accentAlt: '#c39c55',
    ground: '#324b52'
  },
  'town-gate': {
    distantWall: '#607579',
    distantRoof: '#324650',
    distantRoofLight: '#6b7d7e',
    plaster: '#877f75',
    plasterWarm: '#a58a69',
    plasterShade: '#566a6c',
    masonry: '#6f7d7c',
    masonryLight: '#a9aa97',
    masonryDark: '#45565b',
    wood: '#403630',
    woodLight: '#795c43',
    roof: '#303d46',
    roofAlt: '#4c4141',
    roofDark: '#202f38',
    window: '#d8a45b',
    windowFrame: '#1a2d36',
    accent: '#a3454c',
    accentAlt: '#c4a25e',
    ground: '#314951'
  },
  'sala-darmi': {
    distantWall: '#6e8180',
    distantRoof: '#2e414b',
    distantRoofLight: '#617679',
    plaster: '#89928a',
    plasterWarm: '#a69a7a',
    plasterShade: '#657773',
    masonry: '#687875',
    masonryLight: '#adb0a0',
    masonryDark: '#42565d',
    wood: '#584039',
    woodLight: '#946746',
    roof: '#2d3945',
    roofAlt: '#544348',
    roofDark: '#1e323d',
    window: '#e2b866',
    windowFrame: '#192c36',
    accent: '#9f4549',
    accentAlt: '#d1ad5d',
    ground: '#304850'
  },
  castello: {
    distantWall: '#53676c',
    distantRoof: '#293d48',
    distantRoofLight: '#5e7071',
    plaster: '#7b8781',
    plasterWarm: '#9c896d',
    plasterShade: '#596d6e',
    masonry: '#687576',
    masonryLight: '#a2a69a',
    masonryDark: '#3d515b',
    wood: '#443833',
    woodLight: '#79583f',
    roof: '#293743',
    roofAlt: '#513d42',
    roofDark: '#1d2e38',
    window: '#d38f4c',
    windowFrame: '#172b35',
    accent: '#873c45',
    accentAlt: '#b99555',
    ground: '#2b424b'
  }
};

interface RenaissanceBuildingSpec {
  x: number;
  width: number;
  top: number;
  bottom: number;
  side: number;
  roofHeight: number;
  seed: number;
  facade: string;
  sideTone: string;
  roof: string;
  stone?: boolean;
  timber?: boolean;
  windows?: number;
  balcony?: boolean;
  arcade?: number;
  awning?: boolean;
  sign?: boolean;
  door?: boolean;
  battlements?: boolean;
}


function sceneIndex(scene: SceneryId): number {
  const index = SCENES.indexOf(scene);
  return index < 0 ? 0 : index;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function noise(index: number, salt = 0): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawPath(
  context: ProceduralDrawingContext,
  points: readonly { x: number; y: number }[],
  close = true
): void {
  const first = points[0];
  if (!first) return;
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const next of points.slice(1)) context.lineTo(next.x, next.y);
  if (close) context.closePath();
}

function drawArchShape(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const springY = y + height * 0.42;
  context.beginPath();
  context.moveTo(x, y + height);
  context.lineTo(x, springY);
  context.quadraticCurveTo(x, y, x + width * 0.5, y);
  context.quadraticCurveTo(x + width, y, x + width, springY);
  context.lineTo(x + width, y + height);
  context.closePath();
}

function drawMasonry(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  base: string,
  joint: string,
  rowHeight = 12
): void {
  context.fillStyle = base;
  context.fillRect(x, y, width, height);
  context.strokeStyle = joint;
  context.lineWidth = 0.8;
  const rows = Math.ceil(height / rowHeight);
  for (let row = 0; row <= rows; row += 1) {
    const yy = y + row * rowHeight + (row < rows ? noise(seed + row * 3, 4) * 1.4 : 0);
    context.beginPath();
    context.moveTo(x, yy);
    context.lineTo(x + width, yy);
    context.stroke();
    let cursor = x - (row % 2 ? 18 : 0);
    while (cursor < x + width) {
      const brickWidth = 30 + noise(seed + row * 17 + Math.floor(cursor), 8) * 20;
      context.beginPath();
      context.moveTo(cursor, yy);
      context.lineTo(cursor, Math.min(y + height, yy + rowHeight));
      context.stroke();
      cursor += brickWidth;
    }
  }
}

function drawPlasterDetails(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  shadow: string,
  highlight: string
): void {
  context.save();
  context.globalAlpha = 0.3;
  for (let patch = 0; patch < 3; patch += 1) {
    const patchWidth = 20 + noise(seed + patch * 11, 1) * 34;
    const patchHeight = 10 + noise(seed + patch * 17, 2) * 22;
    const patchX = x + 16 + noise(seed + patch * 19, 3) * Math.max(1, width - patchWidth - 28);
    const patchY = y + 18 + noise(seed + patch * 23, 5) * Math.max(1, height - patchHeight - 36);
    drawPath(context, [
      { x: patchX, y: patchY + patchHeight * 0.25 },
      { x: patchX + patchWidth * 0.22, y: patchY },
      { x: patchX + patchWidth * 0.86, y: patchY + patchHeight * 0.08 },
      { x: patchX + patchWidth, y: patchY + patchHeight * 0.72 },
      { x: patchX + patchWidth * 0.58, y: patchY + patchHeight },
      { x: patchX + patchWidth * 0.08, y: patchY + patchHeight * 0.78 }
    ]);
    context.fillStyle = patch % 2 === 0 ? shadow : highlight;
    context.fill();
    context.strokeStyle = patch % 2 === 0 ? shadow : highlight;
    context.lineWidth = 0.7;
    for (let hatch = 0; hatch < 3; hatch += 1) {
      const hx = patchX + 5 + hatch * 8;
      context.beginPath();
      context.moveTo(hx, patchY + patchHeight * 0.34);
      context.lineTo(hx + 7, patchY + patchHeight * 0.74);
      context.stroke();
    }
  }
  context.restore();
}

function roundedWindow(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  glow: number
): void {
  context.save();
  const light = clamp(glow, 0, 1);
  const recess = context.createLinearGradient(x, y, x + width, y + height);
  recess.addColorStop(0, '#172d38');
  recess.addColorStop(0.45, '#253c43');
  recess.addColorStop(1, '#101f2b');
  context.fillStyle = recess;
  drawArchShape(context, x - 4, y - 4, width + 8, height + 8);
  context.fill();
  const interior = context.createLinearGradient(x, y, x, y + height);
  interior.addColorStop(0, `rgba(251,199,112,${0.24 + light * 0.28})`);
  interior.addColorStop(0.7, `rgba(217,142,67,${0.22 + light * 0.3})`);
  interior.addColorStop(1, `rgba(103,61,43,${0.26 + light * 0.18})`);
  context.fillStyle = interior;
  drawArchShape(context, x, y, width, height);
  context.fill();
  context.strokeStyle = '#1b2b34';
  context.lineWidth = 1.8;
  context.beginPath();
  context.moveTo(x + width * 0.5, y + width * 0.14);
  context.lineTo(x + width * 0.5, y + height);
  context.moveTo(x, y + height * 0.52);
  context.lineTo(x + width, y + height * 0.52);
  context.stroke();
  context.strokeStyle = 'rgba(234,215,171,0.46)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + 2, y + height - 2);
  context.lineTo(x + width - 2, y + height - 2);
  context.moveTo(x + 3, y + 4);
  context.lineTo(x + 3, y + height - 5);
  context.stroke();
  context.fillStyle = '#a38a67';
  context.fillRect(x - 4, y + height, width + 8, 4);
  if (noise(Math.round(x + y), 18) > 0.56) {
    context.fillStyle = 'rgba(28,38,41,0.4)';
    context.fillRect(x + 2, y + height * 0.58, width * 0.16, height * 0.38);
  }
  context.restore();
}

function drawRoof(
  context: ProceduralDrawingContext,
  x: number,
  baseY: number,
  width: number,
  height: number,
  color: string,
  seed = 0
): void {
  const ridgeX = x + width * 0.47;
  const peakY = baseY - height;
  const leftBase = x - 17;
  const rightBase = x + width + 17;
  const sideDepth = Math.min(46, Math.max(18, width * 0.12));
  context.save();
  context.lineJoin = 'round';
  drawPath(context, [
    { x: leftBase, y: baseY },
    { x: ridgeX, y: peakY },
    { x: rightBase, y: baseY },
    { x: rightBase + sideDepth, y: baseY + 11 },
    { x: ridgeX + sideDepth * 0.6, y: peakY + 11 },
    { x: leftBase + 5, y: baseY + 10 }
  ]);
  context.fillStyle = '#263943';
  context.fill();
  context.strokeStyle = 'rgba(17,30,37,0.68)';
  context.lineWidth = 1.6;
  context.stroke();

  drawPath(context, [
    { x: leftBase, y: baseY },
    { x: ridgeX, y: peakY },
    { x: rightBase, y: baseY }
  ]);
  context.fillStyle = color;
  context.fill();
  drawPath(context, [
    { x: ridgeX, y: peakY },
    { x: rightBase, y: baseY },
    { x: rightBase + sideDepth, y: baseY + 11 },
    { x: ridgeX + sideDepth * 0.6, y: peakY + 11 }
  ]);
  context.fillStyle = 'rgba(22,36,43,0.38)';
  context.fill();

  const rows = Math.min(7, Math.max(4, Math.floor(height / 11)));
  context.strokeStyle = 'rgba(195,163,116,0.38)';
  context.lineWidth = 0.85;
  for (let row = 1; row <= rows; row += 1) {
    const fraction = row / (rows + 1);
    const yy = peakY + height * fraction + noise(seed + row * 13, 7) * 1.6;
    const leftX = ridgeX - (ridgeX - leftBase) * fraction;
    const rightX = ridgeX + (rightBase - ridgeX) * fraction;
    context.beginPath();
    context.moveTo(leftX, yy);
    context.lineTo(ridgeX, peakY + height * fraction - 1);
    context.lineTo(rightX, yy + 0.5);
    context.stroke();
    const tileCount = Math.max(2, Math.floor(width / 72));
    for (let tile = 0; tile < tileCount; tile += 1) {
      const tx = leftX + (rightX - leftX) * ((tile + 0.45 + noise(seed + row * 41 + tile, 9) * 0.2) / tileCount);
      const tileTilt = (tx - ridgeX) * 0.06;
      context.beginPath();
      context.moveTo(tx, yy - 3);
      context.lineTo(tx + tileTilt, yy + 3);
      context.stroke();
    }
  }
  context.strokeStyle = 'rgba(225,201,157,0.42)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(leftBase + 2, baseY + 2);
  context.lineTo(rightBase - 2, baseY + 2);
  context.moveTo(ridgeX - 4, peakY + 3);
  context.lineTo(ridgeX + 4, peakY + 3);
  context.stroke();
  context.restore();
}

function drawVoussoirs(
  context: ProceduralDrawingContext,
  centerX: number,
  springY: number,
  radiusX: number,
  radiusY: number,
  count: number,
  color: string,
  seed: number
): void {
  const outerX = radiusX + 5;
  const outerY = radiusY + 5;
  const innerX = Math.max(3, radiusX - 1);
  const innerY = Math.max(3, radiusY - 1);
  context.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    const start = Math.PI - index * Math.PI / count;
    const end = Math.PI - (index + 1) * Math.PI / count;
    drawPath(context, [
      { x: centerX + Math.cos(start) * innerX, y: springY - Math.sin(start) * innerY },
      { x: centerX + Math.cos(start) * outerX, y: springY - Math.sin(start) * outerY },
      { x: centerX + Math.cos(end) * outerX, y: springY - Math.sin(end) * outerY },
      { x: centerX + Math.cos(end) * innerX, y: springY - Math.sin(end) * innerY }
    ]);
    context.globalAlpha = 0.68 + noise(seed + index, 10) * 0.22;
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawArchOpening(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  stone: string,
  opening: string,
  glow: number,
  seed: number
): void {
  drawArchShape(context, x, y, width, height);
  context.fillStyle = opening;
  context.fill();
  if (glow > 0) {
    context.fillStyle = `rgba(229,170,86,${clamp(glow, 0, 1) * 0.42})`;
    drawArchShape(context, x + 4, y + 5, width - 8, height - 5);
    context.fill();
  }
  const springY = y + height * 0.42;
  drawVoussoirs(context, x + width * 0.5, springY, width * 0.5, height * 0.42, 9, stone, seed);
  context.strokeStyle = 'rgba(20,34,40,0.72)';
  context.lineWidth = 1.5;
  drawArchShape(context, x, y, width, height);
  context.stroke();
}

function drawDoor(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  wood: string,
  stone: string,
  seed: number
): void {
  drawArchOpening(context, x - 4, y - 4, width + 8, height + 4, stone, '#1b2b34', 0, seed);
  drawArchShape(context, x, y, width, height);
  context.fillStyle = wood;
  context.fill();
  context.strokeStyle = 'rgba(19,29,34,0.72)';
  context.lineWidth = 1.4;
  context.stroke();
  context.strokeStyle = 'rgba(206,162,103,0.3)';
  context.lineWidth = 1;
  for (let plank = 1; plank < 4; plank += 1) {
    const px = x + width * plank / 4;
    context.beginPath();
    context.moveTo(px, y + 7);
    context.lineTo(px, y + height);
    context.stroke();
  }
  context.fillStyle = '#c09559';
  context.beginPath();
  context.arc(x + width * 0.72, y + height * 0.56, 2.3, 0, Math.PI * 2);
  context.fill();
}

function drawArcade(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
  stone: string,
  stoneLight: string,
  opening: string,
  seed: number
): void {
  if (count <= 0) return;
  const bay = width / count;
  for (let index = 0; index < count; index += 1) {
    const archX = x + index * bay + bay * 0.13;
    const archWidth = bay * 0.72;
    drawArchOpening(
      context,
      archX,
      y,
      archWidth,
      height,
      index % 2 === 0 ? stone : stoneLight,
      opening,
      index % 3 === 0 ? 0.16 : 0.05,
      seed + index * 7
    );
    context.fillStyle = index % 2 === 0 ? stoneLight : stone;
    context.fillRect(archX - 5, y + height * 0.35, 10, height * 0.65 + 6);
    context.fillRect(archX + archWidth - 5, y + height * 0.35, 10, height * 0.65 + 6);
    context.fillRect(archX - 8, y + height * 0.33, archWidth + 16, 5);
    context.fillStyle = 'rgba(231,214,172,0.38)';
    context.fillRect(archX - 5, y + height * 0.35, 2, height * 0.64);
  }
}

function drawTimberFrame(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  wood: string,
  highlight: string,
  seed: number
): void {
  context.save();
  context.lineJoin = 'round';
  context.strokeStyle = 'rgba(27,30,30,0.34)';
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(x + width * 0.24, y);
  context.lineTo(x + width * 0.24, y + height);
  context.moveTo(x + width * 0.71, y);
  context.lineTo(x + width * 0.71, y + height);
  context.moveTo(x, y + height * 0.47);
  context.lineTo(x + width, y + height * 0.47);
  context.moveTo(x + 2, y + height * 0.08);
  context.lineTo(x + width * 0.24, y + height * 0.47);
  context.moveTo(x + width * 0.71, y + height * 0.47);
  context.lineTo(x + width - 2, y + height * 0.08);
  context.stroke();
  context.strokeStyle = wood;
  context.lineWidth = 4;
  context.stroke();
  context.strokeStyle = highlight;
  context.globalAlpha = 0.38;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x + width * 0.24 + 2, y + 2);
  context.lineTo(x + width * 0.24 + 2, y + height - 2);
  context.moveTo(x + width * 0.71 + 2, y + 2);
  context.lineTo(x + width * 0.71 + 2, y + height - 2);
  context.stroke();
  for (let grain = 0; grain < 4; grain += 1) {
    const gx = x + 8 + noise(seed + grain * 13, 2) * Math.max(8, width - 16);
    context.beginPath();
    context.moveTo(gx, y + 6);
    context.lineTo(gx + 5, y + Math.min(height - 4, 16 + noise(seed + grain, 6) * (height - 22)));
    context.stroke();
  }
  context.restore();
}

function drawBalcony(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  palette: ScenePalette,
  seed: number
): void {
  context.fillStyle = 'rgba(19,32,38,0.42)';
  context.fillRect(x - 6, y + 4, width + 12, 8);
  context.fillStyle = palette.wood;
  context.fillRect(x, y, width, 6);
  context.strokeStyle = palette.woodLight;
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(x + 4, y + 5);
  context.lineTo(x + width - 4, y + 5);
  for (let post = 0; post <= 5; post += 1) {
    const px = x + 8 + post * (width - 16) / 5;
    context.moveTo(px, y + 5);
    context.lineTo(px, y + 30 + noise(seed + post, 4) * 5);
  }
  context.stroke();
  context.strokeStyle = 'rgba(28,34,34,0.76)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + 4, y + 30);
  context.lineTo(x + width - 4, y + 30);
  context.stroke();
  context.fillStyle = palette.accent;
  context.globalAlpha = 0.7;
  context.fillRect(x + width * 0.18, y + 13, width * 0.64, 7);
  context.globalAlpha = 1;
}

function drawClothAwning(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  depth: number,
  color: string,
  stripe: string,
  seed: number
): void {
  drawPath(context, [
    { x, y },
    { x: x + width, y: y + noise(seed, 1) * 2 },
    { x: x + width - 6, y: y + depth },
    { x: x + 7, y: y + depth - 2 }
  ]);
  context.fillStyle = color;
  context.fill();
  const stripeCount = Math.max(3, Math.floor(width / 22));
  context.fillStyle = stripe;
  context.globalAlpha = 0.45;
  for (let index = 0; index < stripeCount; index += 2) {
    const sx = x + index * width / stripeCount;
    drawPath(context, [
      { x: sx, y: y },
      { x: sx + width / stripeCount * 0.52, y: y },
      { x: sx + width / stripeCount * 0.45, y: y + depth },
      { x: sx - 3, y: y + depth - 2 }
    ]);
    context.fill();
  }
  context.globalAlpha = 1;
  context.strokeStyle = 'rgba(26,30,31,0.62)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(x + 2, y + depth - 2);
  context.lineTo(x + width - 7, y + depth);
  context.stroke();
  for (let scallop = 0; scallop < stripeCount; scallop += 1) {
    const sx = x + 7 + scallop * (width - 14) / Math.max(1, stripeCount - 1);
    context.beginPath();
    context.arc(sx, y + depth - 1, 4, 0, Math.PI);
    context.stroke();
  }
}

function drawHangingSign(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  color: string,
  accent: string,
  seed: number
): void {
  context.strokeStyle = '#28363a';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x - width * 0.28, y - 16);
  context.lineTo(x - width * 0.28, y - 4);
  context.moveTo(x + width * 0.28, y - 16);
  context.lineTo(x + width * 0.28, y - 4);
  context.stroke();
  drawPath(context, [
    { x: x - width * 0.5, y: y - 4 },
    { x: x + width * 0.5, y: y - 4 },
    { x: x + width * 0.44, y: y + 25 },
    { x: x - width * 0.44, y: y + 25 }
  ]);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(22,29,31,0.72)';
  context.lineWidth = 1.2;
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(x, y + 10, 5 + noise(seed, 3) * 2, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(244,219,162,0.64)';
  context.fillRect(x - 1, y + 4, 2, 12);
}

function drawChimney(
  context: ProceduralDrawingContext,
  x: number,
  top: number,
  width: number,
  height: number,
  palette: ScenePalette,
  seed: number
): void {
  context.fillStyle = 'rgba(21,35,42,0.42)';
  context.fillRect(x + 5, top + 4, width, height);
  context.fillStyle = palette.masonry;
  context.fillRect(x, top, width, height);
  context.fillStyle = palette.masonryLight;
  context.fillRect(x + 2, top + 2, 2, height - 4);
  context.fillStyle = palette.masonryDark;
  context.fillRect(x - 4, top - 4, width + 8, 5);
  context.fillRect(x + width * 0.28, top + 10 + noise(seed, 2) * 8, width * 0.45, 2);
}

function drawChurchTower(
  context: ProceduralDrawingContext,
  x: number,
  baseY: number,
  width: number,
  height: number,
  palette: ScenePalette,
  seed: number,
  clock = false
): void {
  const top = baseY - height;
  context.fillStyle = 'rgba(17,32,39,0.28)';
  context.fillRect(x + width * 0.2, top + 8, width * 0.9, height);
  drawMasonry(context, x, top, width, height, seed, palette.distantWall, 'rgba(26,45,51,0.24)', 10);
  context.fillStyle = palette.masonryLight;
  context.fillRect(x + 4, top + 4, 4, height - 8);
  context.fillStyle = palette.distantRoof;
  context.fillRect(x - 4, top + height * 0.55, width + 8, 7);
  drawArchOpening(context, x + width * 0.2, top + height * 0.24, width * 0.6, height * 0.34,
    palette.masonryLight, '#20353e', 0.2, seed + 2);
  if (clock) {
    context.fillStyle = '#d0b16e';
    context.beginPath();
    context.arc(x + width * 0.5, top + height * 0.16, width * 0.14, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#263943';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + width * 0.5, top + height * 0.16);
    context.lineTo(x + width * 0.5, top + height * 0.09);
    context.moveTo(x + width * 0.5, top + height * 0.16);
    context.lineTo(x + width * 0.58, top + height * 0.19);
    context.stroke();
  }
  drawRoof(context, x - 12, top + 2, width + 24, Math.max(25, width * 0.48), palette.distantRoof, seed + 4);
  context.strokeStyle = '#b79b64';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(x + width * 0.5, top - Math.max(12, width * 0.18));
  context.lineTo(x + width * 0.5, top - 3);
  context.moveTo(x + width * 0.4, top - Math.max(8, width * 0.12));
  context.lineTo(x + width * 0.6, top - Math.max(8, width * 0.12));
  context.stroke();
}

function drawDistantRoofscape(
  context: ProceduralDrawingContext,
  offset: number,
  palette: ScenePalette,
  seed: number,
  towerX: number,
  towerHeight: number,
  clock = false
): void {
  context.fillStyle = palette.distantWall;
  context.globalAlpha = 0.58;
  context.fillRect(offset, 134, SURFACE_WIDTH, SURFACE_HEIGHT - 134);
  context.globalAlpha = 1;
  for (let index = -2; index < 19; index += 1) {
    const x = offset + index * 176 + noise(seed + index, 1) * 30;
    const width = 124 + noise(seed + index * 3, 2) * 66;
    const baseY = 189 + noise(seed + index * 7, 3) * 20;
    const peakY = baseY - 34 - noise(seed + index * 5, 4) * 29;
    context.fillStyle = index % 3 === 0 ? palette.distantWall : palette.distantRoofLight;
    context.globalAlpha = 0.52 + noise(seed + index, 5) * 0.17;
    context.fillRect(x, baseY - 12, width, 117);
    drawPath(context, [
      { x: x - 12, y: baseY },
      { x: x + width * 0.5, y: peakY },
      { x: x + width + 12, y: baseY },
      { x: x + width + 4, y: baseY + 7 },
      { x: x + width * 0.5, y: peakY + 8 },
      { x: x - 4, y: baseY + 7 }
    ]);
    context.fillStyle = palette.distantRoof;
    context.fill();
    context.strokeStyle = 'rgba(211,193,151,0.18)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 16, baseY - 3);
    context.lineTo(x + width * 0.5, peakY + 6);
    context.lineTo(x + width - 15, baseY - 3);
    context.stroke();
    for (let window = 0; window < 2; window += 1) {
      const wx = x + width * (0.22 + window * 0.48);
      context.fillStyle = `rgba(230,181,100,${0.18 + noise(seed + index + window, 9) * 0.2})`;
      context.fillRect(wx, baseY + 13, 8, 14);
      context.fillStyle = 'rgba(20,39,46,0.42)';
      context.fillRect(wx + 3, baseY + 13, 1, 14);
    }
    if (index % 3 !== 1) {
      drawChimney(context, x + width * (0.68 + noise(seed + index, 12) * 0.1), peakY - 18, 10, 25, palette, seed + index);
    }
  }
  context.globalAlpha = 1;
  drawChurchTower(context, offset + towerX, 224, 74, towerHeight, palette, seed + 31, clock);
  if (towerHeight > 125) {
    drawChimney(context, offset + towerX - 84, 105, 14, 29, palette, seed + 42);
  }
  context.fillStyle = 'rgba(204,208,190,0.18)';
  context.fillRect(offset, 198, SURFACE_WIDTH, 29);
}

function drawRenaissanceBuilding(
  context: ProceduralDrawingContext,
  spec: RenaissanceBuildingSpec,
  palette: ScenePalette
): void {
  const { x, width, top, bottom, side, roofHeight, seed } = spec;
  const sideTop = top + 7 + noise(seed, 1) * 4;
  const sideBottom = bottom + 2;
  drawRoof(context, x - 9, top + 6, width + 18, roofHeight, spec.roof, seed + 4);
  context.fillStyle = 'rgba(17,29,35,0.24)';
  drawPath(context, [
    { x: x - 8, y: bottom - 3 },
    { x: x + width + side + 14, y: bottom + 4 },
    { x: x + width + side + 5, y: bottom + 12 },
    { x: x - 12, y: bottom + 7 }
  ]);
  context.fill();
  drawPath(context, [
    { x: x + width, y: sideTop },
    { x: x + width + side, y: sideTop + 12 },
    { x: x + width + side, y: sideBottom },
    { x: x + width, y: bottom }
  ]);
  context.fillStyle = spec.sideTone;
  context.fill();
  if (spec.stone) {
    drawMasonry(context, x + width + 1, sideTop + 2, side - 2, sideBottom - sideTop - 3, seed + 18,
      spec.sideTone, 'rgba(27,45,50,0.28)', 11);
  } else {
    context.strokeStyle = 'rgba(226,210,177,0.16)';
    context.lineWidth = 1;
    for (let seam = 1; seam < 4; seam += 1) {
      context.beginPath();
      context.moveTo(x + width + side * seam / 4, sideTop + 14);
      context.lineTo(x + width + side * seam / 4, sideBottom - 4);
      context.stroke();
    }
  }
  context.fillStyle = spec.facade;
  context.fillRect(x, top, width, bottom - top);
  if (spec.stone) {
    drawMasonry(context, x, top, width, bottom - top, seed, spec.facade, 'rgba(27,45,50,0.3)', 12);
  } else {
    drawPlasterDetails(context, x, top, width, bottom - top, seed, palette.plasterShade, palette.plasterWarm);
  }
  context.fillStyle = 'rgba(238,217,170,0.18)';
  context.fillRect(x + 4, top + 4, width - 8, 3);
  context.fillStyle = 'rgba(26,39,42,0.35)';
  context.fillRect(x, bottom - 7, width, 7);
  context.strokeStyle = 'rgba(231,216,179,0.28)';
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(x + 5, top + 2);
  context.lineTo(x + width - 6, top + 2);
  context.stroke();

  const windowCount = spec.windows ?? 2;
  const windowWidth = Math.min(40, Math.max(22, (width - 54) / Math.max(1, windowCount) * 0.48));
  for (let window = 0; window < windowCount; window += 1) {
    const fraction = (window + 1) / (windowCount + 1);
    const wx = x + width * fraction - windowWidth * 0.5 + (noise(seed + window, 21) - 0.5) * 7;
    const wy = top + 25 + (window % 2) * 8;
    roundedWindow(context, wx, wy, windowWidth, 35 + (window % 2) * 5,
      0.35 + noise(seed + window * 9, 22) * 0.5);
  }
  if (spec.timber) drawTimberFrame(context, x + 2, top + 4, width - 4, bottom - top - 10, palette.wood, palette.woodLight, seed + 28);
  if (spec.arcade) {
    drawArcade(context, x + 18, top + 91, width - 36, Math.max(54, bottom - top - 83), spec.arcade,
      palette.masonryDark, palette.masonryLight, '#263d45', seed + 38);
  }
  if (spec.balcony) drawBalcony(context, x + width * 0.18, top + 76, width * 0.64, palette, seed + 48);
  if (spec.awning) {
    drawClothAwning(context, x + width * 0.1, top + 71, width * 0.8, 24,
      palette.accent, palette.accentAlt, seed + 55);
  }
  if (spec.sign) drawHangingSign(context, x + width * 0.78, top + 77, 34, palette.accentAlt, palette.accent, seed + 64);
  if (spec.door) {
    drawDoor(context, x + width * (0.44 + noise(seed, 73) * 0.12), bottom - 73, 30, 70,
      palette.wood, palette.masonryLight, seed + 80);
  }
  if (spec.battlements) {
    context.fillStyle = spec.facade;
    for (let merlon = 0; merlon < Math.floor(width / 34); merlon += 1) {
      context.fillRect(x + merlon * 34 + 5, top - 12, 20, 14);
    }
    context.fillStyle = 'rgba(22,37,44,0.5)';
    context.fillRect(x, top - 2, width, 4);
  }
}

function drawHangingCloth(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  stripe: string,
  sway: number
): void {
  context.save();
  context.translate(x, y);
  drawPath(context, [
    { x: -width * 0.5, y: 0 },
    { x: width * 0.5, y: 0 },
    { x: width * 0.44 + sway, y: height * 0.82 },
    { x: 0, y: height },
    { x: -width * 0.48 - sway, y: height * 0.76 }
  ]);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(16,27,31,0.62)';
  context.lineWidth = 1.2;
  context.stroke();
  context.fillStyle = stripe;
  context.globalAlpha = 0.48;
  context.beginPath();
  context.moveTo(-width * 0.15, 0);
  context.lineTo(width * 0.04, 0);
  context.lineTo(width * 0.02 + sway * 0.2, height * 0.94);
  context.lineTo(-width * 0.18 - sway * 0.2, height * 0.78);
  context.closePath();
  context.fill();
  context.globalAlpha = 0.32;
  context.strokeStyle = '#f0d9a2';
  context.lineWidth = 0.8;
  for (let fold = -1; fold <= 1; fold += 1) {
    context.beginPath();
    context.moveTo(fold * width * 0.14, 3);
    context.lineTo(fold * width * 0.12 + sway * 0.3, height * 0.8);
    context.stroke();
  }
  context.globalAlpha = 1;
  context.restore();
}

function drawGatehouseLandmark(
  context: ProceduralDrawingContext,
  x: number,
  baseY: number,
  width: number,
  palette: ScenePalette,
  seed: number
): void {
  const towerWidth = width * 0.22;
  const towerTop = baseY - 142;
  const wallTop = baseY - 108;
  context.fillStyle = 'rgba(15,29,36,0.28)';
  context.fillRect(x - 8, baseY - 3, width + 26, 14);
  for (const towerX of [x, x + width - towerWidth]) {
    drawMasonry(context, towerX, towerTop, towerWidth, baseY - towerTop, seed + Math.round(towerX),
      palette.masonry, 'rgba(24,41,47,0.34)', 11);
    context.fillStyle = palette.masonryLight;
    context.fillRect(towerX + 5, towerTop + 5, 5, baseY - towerTop - 10);
    context.fillStyle = palette.masonryDark;
    context.fillRect(towerX - 5, towerTop - 4, towerWidth + 10, 7);
    for (let merlon = 0; merlon < 4; merlon += 1) {
      context.fillStyle = palette.masonryLight;
      context.fillRect(towerX + 7 + merlon * (towerWidth - 17) / 3, towerTop - 18, 17, 16);
    }
    drawArchOpening(context, towerX + towerWidth * 0.25, towerTop + 27, towerWidth * 0.5, 37,
      palette.masonryLight, '#1c3039', 0.12, seed + merlonSeed(towerX));
  }
  context.fillStyle = palette.masonry;
  context.fillRect(x + towerWidth - 3, wallTop, width - towerWidth * 2 + 6, baseY - wallTop);
  drawMasonry(context, x + towerWidth, wallTop + 3, width - towerWidth * 2, baseY - wallTop - 3,
    seed + 9, palette.masonry, 'rgba(23,41,47,0.32)', 12);
  context.fillStyle = palette.masonryLight;
  context.fillRect(x + towerWidth - 2, wallTop - 4, width - towerWidth * 2 + 4, 7);
  for (let merlon = 0; merlon < 8; merlon += 1) {
    context.fillRect(x + towerWidth + 8 + merlon * (width - towerWidth * 2 - 20) / 7, wallTop - 17, 18, 14);
  }
  drawArchOpening(context, x + width * 0.32, wallTop + 38, width * 0.36, baseY - wallTop - 35,
    palette.masonryLight, '#162a34', 0.12, seed + 12);
  context.strokeStyle = palette.woodLight;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x + width * 0.34, wallTop + 86);
  context.lineTo(x + width * 0.66, wallTop + 86);
  context.moveTo(x + width * 0.39, wallTop + 104);
  context.lineTo(x + width * 0.39, baseY - 8);
  context.moveTo(x + width * 0.61, wallTop + 104);
  context.lineTo(x + width * 0.61, baseY - 8);
  context.stroke();
  context.fillStyle = palette.accent;
  drawPath(context, [
    { x: x + width * 0.5, y: wallTop - 8 },
    { x: x + width * 0.5, y: wallTop + 50 },
    { x: x + width * 0.61, y: wallTop + 42 },
    { x: x + width * 0.5, y: wallTop + 34 }
  ]);
  context.fill();
  context.strokeStyle = 'rgba(235,213,166,0.45)';
  context.lineWidth = 1;
  context.stroke();
}

function merlonSeed(value: number): number {
  return Math.round(value * 0.37);
}

function drawKeepLandmark(
  context: ProceduralDrawingContext,
  x: number,
  baseY: number,
  width: number,
  palette: ScenePalette,
  seed: number
): void {
  const towerWidth = width * 0.24;
  const wallTop = baseY - 104;
  const towerTop = baseY - 166;
  context.fillStyle = 'rgba(15,27,34,0.34)';
  context.fillRect(x - 10, baseY - 2, width + 22, 13);
  context.fillStyle = palette.masonry;
  context.fillRect(x + towerWidth * 0.5, wallTop, width - towerWidth, baseY - wallTop);
  drawMasonry(context, x + towerWidth * 0.5, wallTop, width - towerWidth, baseY - wallTop,
    seed + 1, palette.masonry, 'rgba(22,39,45,0.34)', 11);
  for (const towerX of [x, x + width - towerWidth]) {
    drawMasonry(context, towerX, towerTop, towerWidth, baseY - towerTop, seed + Math.round(towerX),
      palette.masonryLight, 'rgba(24,40,45,0.38)', 10);
    context.fillStyle = palette.masonryDark;
    context.fillRect(towerX - 5, towerTop - 5, towerWidth + 10, 7);
    for (let merlon = 0; merlon < 4; merlon += 1) {
      context.fillStyle = palette.masonryLight;
      context.fillRect(towerX + 7 + merlon * (towerWidth - 17) / 3, towerTop - 19, 16, 16);
    }
    drawArchOpening(context, towerX + towerWidth * 0.2, towerTop + 33, towerWidth * 0.6, 46,
      palette.masonryLight, '#172c36', 0.16, seed + 20 + Math.round(towerX));
  }
  context.fillStyle = palette.masonryLight;
  context.fillRect(x + towerWidth * 0.5, wallTop - 5, width - towerWidth, 7);
  for (let merlon = 0; merlon < 7; merlon += 1) {
    context.fillRect(x + towerWidth * 0.65 + merlon * (width - towerWidth * 1.3) / 6, wallTop - 18, 18, 15);
  }
  drawArcade(context, x + towerWidth * 0.7, wallTop + 31, width - towerWidth * 1.45, baseY - wallTop - 30,
    4, palette.masonryDark, palette.masonryLight, '#1b313b', seed + 30);
  context.fillStyle = palette.accent;
  drawPath(context, [
    { x: x + width * 0.5, y: towerTop - 5 },
    { x: x + width * 0.5, y: towerTop + 45 },
    { x: x + width * 0.61, y: towerTop + 38 },
    { x: x + width * 0.5, y: towerTop + 30 }
  ]);
  context.fill();
}

function drawMarketStall(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  width: number,
  palette: ScenePalette,
  seed: number,
  scene: SceneryId
): void {
  const awningColor = scene === 'castello' ? palette.accentAlt : palette.accent;
  const awningStripe = scene === 'sala-darmi' ? palette.accentAlt : palette.plasterWarm;
  context.fillStyle = 'rgba(9,22,28,0.38)';
  context.beginPath();
  context.ellipse(x + width * 0.5, y + 62, width * 0.62, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = palette.wood;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x + 10, y + 7);
  context.lineTo(x + 10, y + 56);
  context.moveTo(x + width - 10, y + 7);
  context.lineTo(x + width - 10, y + 56);
  context.stroke();
  drawClothAwning(context, x, y, width, 31, awningColor, awningStripe, seed + 2);
  context.fillStyle = scene === 'town-gate' ? palette.masonryDark : palette.woodLight;
  drawPath(context, [
    { x: x + 3, y: y + 46 },
    { x: x + width - 3, y: y + 46 },
    { x: x + width - 13, y: y + 57 },
    { x: x + 13, y: y + 57 }
  ]);
  context.fill();
  context.strokeStyle = 'rgba(22,30,32,0.7)';
  context.lineWidth = 1.3;
  context.stroke();
  context.fillStyle = palette.masonryLight;
  context.fillRect(x + 16, y + 58, 23, 13);
  context.fillStyle = palette.accentAlt;
  context.fillRect(x + 19, y + 55, 17, 5);
  context.fillStyle = palette.wood;
  context.fillRect(x + width - 42, y + 53, 25, 18);
  context.strokeStyle = 'rgba(208,174,119,0.42)';
  context.lineWidth = 1;
  context.strokeRect(x + width - 42, y + 53, 25, 18);
  context.fillStyle = palette.masonry;
  context.beginPath();
  context.arc(x + width * 0.18, y + 65, 10, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(228,207,163,0.27)';
  context.beginPath();
  context.arc(x + width * 0.18 - 2, y + 62, 6, 0, Math.PI * 2);
  context.fill();
}

function drawWeaponRack(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  palette: ScenePalette,
  seed: number
): void {
  context.fillStyle = 'rgba(18,30,36,0.38)';
  context.fillRect(x - 4, y + 28, 70, 7);
  context.strokeStyle = palette.wood;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x, y + 31);
  context.lineTo(x + 7, y);
  context.moveTo(x + 59, y + 31);
  context.lineTo(x + 52, y);
  context.stroke();
  for (let weapon = 0; weapon < 4; weapon += 1) {
    const wx = x + 10 + weapon * 14;
    context.strokeStyle = weapon % 2 === 0 ? palette.masonryLight : '#c89c5c';
    context.lineWidth = 1.7;
    context.beginPath();
    context.moveTo(wx, y + 27);
    context.lineTo(wx + 8, y - 12 - noise(seed + weapon, 4) * 12);
    context.stroke();
    context.strokeStyle = palette.woodLight;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(wx - 2, y + 13);
    context.lineTo(wx + 5, y + 16);
    context.stroke();
  }
}

function drawTorch(
  context: ProceduralDrawingContext,
  x: number,
  y: number,
  palette: ScenePalette,
  seed: number,
  time: number
): void {
  const flicker = 0.84 + Math.sin(time * 7 + seed) * 0.12 + Math.sin(time * 13 + seed * 0.7) * 0.06;
  const light = context.createRadialGradient(x, y - 13, 2, x, y - 13, 34);
  light.addColorStop(0, `rgba(241,179,78,${0.22 * flicker})`);
  light.addColorStop(1, 'rgba(241,179,78,0)');
  context.fillStyle = light;
  context.beginPath();
  context.arc(x, y - 13, 34, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = palette.wood;
  context.fillRect(x - 3, y - 4, 6, 22);
  context.fillStyle = palette.masonryLight;
  context.fillRect(x - 7, y - 5, 14, 4);
  context.fillStyle = '#d67d3e';
  drawPath(context, [
    { x, y: y - 7 - flicker * 11 },
    { x: x + 6, y: y - 1 },
    { x: x + 2, y: y + 2 },
    { x: x - 5, y: y + 1 }
  ]);
  context.fill();
  context.fillStyle = '#f3d18a';
  context.beginPath();
  context.arc(x, y - 3 - flicker * 5, 2.3, 0, Math.PI * 2);
  context.fill();
}

function drawStreetFoundation(
  context: ProceduralDrawingContext,
  offset: number,
  palette: ScenePalette,
  seed: number
): void {
  context.fillStyle = palette.ground;
  context.fillRect(offset, 214, SURFACE_WIDTH, SURFACE_HEIGHT - 214);
  context.fillStyle = 'rgba(227,203,157,0.19)';
  context.fillRect(offset, 222, SURFACE_WIDTH, 3);
  context.strokeStyle = 'rgba(17,32,38,0.38)';
  context.lineWidth = 1;
  for (let stone = -1; stone < 22; stone += 1) {
    const x = offset + stone * 146 + noise(seed + stone, 4) * 28;
    const width = 88 + noise(seed + stone * 3, 5) * 42;
    drawPath(context, [
      { x, y: 227 + noise(seed + stone, 6) * 2 },
      { x: x + width, y: 226 + noise(seed + stone * 2, 7) * 2 },
      { x: x + width - 9, y: 236 },
      { x: x + 8, y: 236 }
    ]);
    context.fillStyle = stone % 3 === 0 ? palette.masonryLight : palette.masonryDark;
    context.globalAlpha = stone % 3 === 0 ? 0.52 : 0.68;
    context.fill();
    context.globalAlpha = 1;
    context.stroke();
  }
}

export class ProceduralSceneRenderer {
  readonly width: number;
  readonly height: number;
  private readonly surfaces = new Map<SceneryId, ProceduralSurface>();
  private readonly failedSurfaces = new Set<SceneryId>();
  private activeScene: SceneryId | null = null;
  private previousScene: SceneryId | null = null;
  private transition = 1;

  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
  }

  draw(snapshot: GameSnapshot, cameraX: number, dt: number): void {
    const requested = snapshot.scenery ?? 'sala-darmi';
    this.updateScene(requested, dt);
    const safeCamera = Number.isFinite(cameraX) ? cameraX : 0;
    const context = this.contextFromGlobal();
    if (!context) return;

    this.drawSky(context, requested, snapshot.time, snapshot.bossPhase);
    if (this.previousScene && this.transition < 1) {
      this.drawStaticPlane(context, this.previousScene, safeCamera, 1 - this.transition);
    }
    this.drawStaticPlane(context, requested, safeCamera, this.previousScene ? this.transition : 1);
    this.drawRoad(context, snapshot, safeCamera);
    this.drawForegroundStructure(context, requested, safeCamera, snapshot.time);
    this.drawAtmosphere(context, requested, snapshot.time, snapshot.bossPhase, safeCamera);
  }

  /** The renderer supplies the real context through this setter each frame. */
  private drawingContext: ProceduralDrawingContext | null = null;

  setContext(context: ProceduralDrawingContext): void {
    this.drawingContext = context;
  }

  private contextFromGlobal(): ProceduralDrawingContext | null {
    return this.drawingContext;
  }

  private updateScene(scene: SceneryId, dt: number): void {
    if (scene !== this.activeScene) {
      this.previousScene = this.activeScene;
      this.activeScene = scene;
      this.transition = this.previousScene === null || dt === 0 ? 1 : 0;
    } else if (this.transition < 1) {
      this.transition = Math.min(1, this.transition + Math.max(0, dt) / 0.55);
    }
  }

  private drawSky(
    context: ProceduralDrawingContext,
    scene: SceneryId,
    time: number,
    bossPhase: number
  ): void {
    const index = sceneIndex(scene);
    const sky = context.createLinearGradient(0, 0, 0, 300);
    const storm = bossPhase >= 2;
    sky.addColorStop(0, storm ? '#1b2635' : index === 3 ? '#263847' : '#304d59');
    sky.addColorStop(0.55, storm ? '#4a3039' : index === 2 ? '#73909a' : '#55747d');
    sky.addColorStop(1, storm ? '#6b3b3e' : '#d0a879');
    context.fillStyle = sky;
    context.fillRect(0, 0, this.width, this.height);

    const moonX = 1040 - Math.sin(time * 0.03) * 30;
    const moonY = index === 3 ? 82 : 62;
    const moon = context.createRadialGradient(moonX, moonY, 4, moonX, moonY, 66);
    moon.addColorStop(0, storm ? 'rgba(249,207,158,0.92)' : 'rgba(234,220,182,0.82)');
    moon.addColorStop(0.36, storm ? 'rgba(236,171,125,0.22)' : 'rgba(216,229,212,0.18)');
    moon.addColorStop(1, 'rgba(205,218,201,0)');
    context.fillStyle = moon;
    context.beginPath();
    context.arc(moonX, moonY, 66, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = storm ? '#edc696' : '#e1dfc3';
    context.beginPath();
    context.arc(moonX, moonY, index === 3 ? 17 : 12, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = 'rgba(221,234,223,0.54)';
    for (let star = 0; star < 34; star += 1) {
      const x = (star * 157 + index * 31) % this.width;
      const y = 22 + (star * 47) % 148;
      const radius = 0.7 + (star % 3) * 0.35;
      context.globalAlpha = 0.22 + 0.14 * Math.sin(time * 1.4 + star);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    const haze = context.createLinearGradient(0, 188, 0, HORIZON + 24);
    haze.addColorStop(0, 'rgba(203,201,169,0)');
    haze.addColorStop(1, storm ? 'rgba(83,47,54,0.54)' : 'rgba(219,191,146,0.46)');
    context.fillStyle = haze;
    context.fillRect(0, 160, this.width, 110);
  }

  private drawStaticPlane(
    context: ProceduralDrawingContext,
    scene: SceneryId,
    cameraX: number,
    alpha: number
  ): void {
    if (alpha <= 0) return;
    const parallax = scene === 'castello' ? 0.18 : scene === 'sala-darmi' ? 0.24 : 0.34;
    const surface = this.surfaceFor(scene);
    context.save();
    context.globalAlpha = clamp(alpha, 0, 1);
    if (surface) {
      const offset = -positiveModulo(cameraX * parallax, SURFACE_WIDTH);
      for (let x = offset - SURFACE_WIDTH; x < this.width + SURFACE_WIDTH; x += SURFACE_WIDTH) {
        context.drawImage(surface, x, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
      }
    } else {
      context.translate(-cameraX * parallax, 0);
      this.drawArchitecture(context, scene, 0);
    }
    context.restore();
  }

  private surfaceFor(scene: SceneryId): ProceduralSurface | null {
    if (!SCENES.includes(scene)) return null;
    const existing = this.surfaces.get(scene);
    if (existing) return existing;
    if (this.failedSurfaces.has(scene)) return null;
    if (this.surfaces.size >= MAX_SURFACE_COUNT) return null;
    try {
      let surface: ProceduralSurface | null = null;
      if (typeof OffscreenCanvas !== 'undefined') {
        surface = new OffscreenCanvas(SURFACE_WIDTH, SURFACE_HEIGHT);
      } else if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = SURFACE_WIDTH;
        canvas.height = SURFACE_HEIGHT;
        surface = canvas;
      }
      if (!surface) {
        this.failedSurfaces.add(scene);
        return null;
      }
      const context = surface.getContext('2d') as ProceduralDrawingContext | null;
      if (!context) {
        this.failedSurfaces.add(scene);
        return null;
      }
      context.clearRect(0, 0, SURFACE_WIDTH, SURFACE_HEIGHT);
      this.drawArchitecture(context, scene, 0);
      this.surfaces.set(scene, surface);
      return surface;
    } catch {
      this.failedSurfaces.add(scene);
      return null;
    }
  }

  private drawArchitecture(context: ProceduralDrawingContext, scene: SceneryId, offset: number): void {
    if (scene === 'town-gate') this.drawTownGate(context, offset);
    else if (scene === 'sala-darmi') this.drawSalaDarmi(context, offset);
    else if (scene === 'castello') this.drawCastello(context, offset);
    else this.drawCobbledStreet(context, offset);
  }

  private drawCobbledStreet(context: ProceduralDrawingContext, offset: number): void {
    const palette = SCENE_PALETTES['cobbled-streets'];
    drawDistantRoofscape(context, offset, palette, 11, 720, 128);
    const buildings: readonly RenaissanceBuildingSpec[] = [
      { x: -135, width: 268, top: 143, bottom: 268, side: 36, roofHeight: 42, seed: 11, facade: palette.plasterShade, sideTone: palette.masonryDark, roof: palette.roofDark, timber: true, windows: 2, awning: true, door: true },
      { x: 152, width: 362, top: 112, bottom: 268, side: 58, roofHeight: 54, seed: 23, facade: palette.plasterWarm, sideTone: palette.plasterShade, roof: palette.roofAlt, timber: true, windows: 3, balcony: true, sign: true, awning: true },
      { x: 548, width: 230, top: 153, bottom: 268, side: 28, roofHeight: 38, seed: 37, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roof, stone: true, windows: 2, arcade: 2, door: true },
      { x: 815, width: 448, top: 92, bottom: 268, side: 64, roofHeight: 61, seed: 49, facade: palette.plaster, sideTone: palette.plasterShade, roof: palette.roofDark, timber: true, windows: 3, balcony: true, awning: true },
      { x: 1302, width: 294, top: 134, bottom: 268, side: 42, roofHeight: 45, seed: 63, facade: palette.plasterWarm, sideTone: palette.masonryDark, roof: palette.roofAlt, windows: 2, arcade: 2, sign: true, door: true },
      { x: 1635, width: 386, top: 118, bottom: 268, side: 56, roofHeight: 49, seed: 77, facade: palette.plasterShade, sideTone: palette.plaster, roof: palette.roof, timber: true, windows: 3, balcony: true },
      { x: 2074, width: 250, top: 151, bottom: 268, side: 31, roofHeight: 39, seed: 91, facade: palette.masonryLight, sideTone: palette.masonryDark, roof: palette.roofDark, stone: true, windows: 2, arcade: 2, door: true },
      { x: 2367, width: 462, top: 99, bottom: 268, side: 61, roofHeight: 58, seed: 103, facade: palette.plasterWarm, sideTone: palette.plasterShade, roof: palette.roofAlt, timber: true, windows: 3, awning: true, sign: true },
      { x: 2875, width: 320, top: 132, bottom: 268, side: 45, roofHeight: 44, seed: 117, facade: palette.plaster, sideTone: palette.masonryDark, roof: palette.roof, windows: 2, balcony: true, door: true }
    ];
    for (const building of buildings) {
      drawRenaissanceBuilding(context, { ...building, x: building.x + offset }, palette);
    }
    for (let index = 0; index < 7; index += 1) {
      const x = offset + 112 + index * 446 + noise(index + 19, 2) * 34;
      drawHangingCloth(context, x, 116 + (index % 3) * 8, 34 + (index % 2) * 9,
        52 + (index % 3) * 10, index % 2 === 0 ? palette.accent : palette.accentAlt,
        palette.plasterWarm, index % 3 - 1);
    }
    drawStreetFoundation(context, offset, palette, 121);
  }

  private drawTownGate(context: ProceduralDrawingContext, offset: number): void {
    const palette = SCENE_PALETTES['town-gate'];
    drawDistantRoofscape(context, offset, palette, 211, 1430, 151, true);
    const buildings: readonly RenaissanceBuildingSpec[] = [
      { x: -140, width: 304, top: 128, bottom: 268, side: 46, roofHeight: 43, seed: 211, facade: palette.plasterShade, sideTone: palette.masonryDark, roof: palette.roofDark, windows: 2, arcade: 2, door: true },
      { x: 202, width: 410, top: 96, bottom: 268, side: 58, roofHeight: 56, seed: 223, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roof, stone: true, windows: 3, battlements: true },
      { x: 682, width: 300, top: 139, bottom: 268, side: 35, roofHeight: 42, seed: 237, facade: palette.plasterWarm, sideTone: palette.plasterShade, roof: palette.roofAlt, timber: true, windows: 2, awning: true, sign: true },
      { x: 1582, width: 364, top: 104, bottom: 268, side: 60, roofHeight: 51, seed: 251, facade: palette.masonryLight, sideTone: palette.masonryDark, roof: palette.roofDark, stone: true, windows: 3, balcony: true },
      { x: 1998, width: 260, top: 147, bottom: 268, side: 35, roofHeight: 38, seed: 263, facade: palette.plaster, sideTone: palette.plasterShade, roof: palette.roofAlt, windows: 2, arcade: 2, door: true },
      { x: 2305, width: 470, top: 91, bottom: 268, side: 66, roofHeight: 62, seed: 277, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roof, stone: true, windows: 3, battlements: true, awning: true },
      { x: 2822, width: 342, top: 123, bottom: 268, side: 48, roofHeight: 47, seed: 289, facade: palette.plasterWarm, sideTone: palette.masonryDark, roof: palette.roofAlt, timber: true, windows: 2, balcony: true }
    ];
    for (const building of buildings) {
      drawRenaissanceBuilding(context, { ...building, x: building.x + offset }, palette);
    }
    drawGatehouseLandmark(context, offset + 1018, 254, 470, palette, 301);
    for (let index = 0; index < 5; index += 1) {
      const x = offset + 162 + index * 612;
      drawHangingCloth(context, x, 106 + (index % 2) * 8, 42, 70,
        index % 2 === 0 ? palette.accent : palette.accentAlt, palette.masonryLight, index - 2);
    }
    drawStreetFoundation(context, offset, palette, 319);
  }

  private drawSalaDarmi(context: ProceduralDrawingContext, offset: number): void {
    const palette = SCENE_PALETTES['sala-darmi'];
    drawDistantRoofscape(context, offset, palette, 411, 560, 136);
    const buildings: readonly RenaissanceBuildingSpec[] = [
      { x: -175, width: 620, top: 88, bottom: 268, side: 56, roofHeight: 48, seed: 411, facade: palette.plasterShade, sideTone: palette.masonryDark, roof: palette.roofDark, windows: 3, arcade: 4, balcony: true },
      { x: 492, width: 396, top: 126, bottom: 268, side: 46, roofHeight: 41, seed: 427, facade: palette.plasterWarm, sideTone: palette.plasterShade, roof: palette.roofAlt, windows: 2, awning: true, sign: true },
      { x: 930, width: 716, top: 78, bottom: 268, side: 64, roofHeight: 56, seed: 439, facade: palette.plaster, sideTone: palette.masonryDark, roof: palette.roof, windows: 4, arcade: 5, balcony: true },
      { x: 1701, width: 284, top: 145, bottom: 268, side: 34, roofHeight: 38, seed: 457, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roofDark, stone: true, windows: 2, arcade: 2, door: true },
      { x: 2030, width: 520, top: 101, bottom: 268, side: 58, roofHeight: 51, seed: 467, facade: palette.plasterShade, sideTone: palette.plaster, roof: palette.roofAlt, windows: 3, arcade: 4, timber: true },
      { x: 2601, width: 382, top: 121, bottom: 268, side: 49, roofHeight: 45, seed: 479, facade: palette.plasterWarm, sideTone: palette.masonryDark, roof: palette.roofDark, windows: 3, balcony: true, sign: true }
    ];
    for (const building of buildings) {
      drawRenaissanceBuilding(context, { ...building, x: building.x + offset }, palette);
    }
    for (let index = 0; index < 6; index += 1) {
      const x = offset + 96 + index * 516;
      context.strokeStyle = palette.wood;
      context.lineWidth = 2.6;
      context.beginPath();
      context.moveTo(x, 37);
      context.lineTo(x, 93);
      context.stroke();
      context.fillStyle = index % 2 === 0 ? palette.accent : palette.accentAlt;
      context.beginPath();
      context.arc(x, 96, 10 + (index % 3) * 2, 0, Math.PI * 2);
      context.fill();
      drawHangingCloth(context, x, 99, 35 + (index % 2) * 8, 58 + (index % 3) * 8,
        index % 2 === 0 ? palette.accent : palette.accentAlt, palette.plasterWarm, 0);
      if (index % 2 === 0) drawWeaponRack(context, x - 33, 189, palette, index + 12);
    }
    drawStreetFoundation(context, offset, palette, 491);
  }

  private drawCastello(context: ProceduralDrawingContext, offset: number): void {
    const palette = SCENE_PALETTES.castello;
    drawDistantRoofscape(context, offset, palette, 611, 1870, 166, true);
    const buildings: readonly RenaissanceBuildingSpec[] = [
      { x: -145, width: 392, top: 103, bottom: 268, side: 59, roofHeight: 51, seed: 611, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roof, stone: true, windows: 3, battlements: true, arcade: 3 },
      { x: 302, width: 278, top: 139, bottom: 268, side: 38, roofHeight: 39, seed: 629, facade: palette.masonryLight, sideTone: palette.masonryDark, roof: palette.roofAlt, stone: true, windows: 2, door: true },
      { x: 632, width: 482, top: 91, bottom: 268, side: 63, roofHeight: 58, seed: 643, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roofDark, stone: true, windows: 3, battlements: true, arcade: 3 },
      { x: 1180, width: 328, top: 129, bottom: 268, side: 45, roofHeight: 44, seed: 659, facade: palette.plasterShade, sideTone: palette.masonryDark, roof: palette.roofAlt, windows: 2, balcony: true },
      { x: 1576, width: 526, top: 97, bottom: 268, side: 67, roofHeight: 59, seed: 677, facade: palette.masonryLight, sideTone: palette.masonryDark, roof: palette.roof, stone: true, windows: 4, battlements: true, arcade: 4 },
      { x: 2176, width: 286, top: 146, bottom: 268, side: 39, roofHeight: 40, seed: 691, facade: palette.plasterWarm, sideTone: palette.masonryDark, roof: palette.roofAlt, windows: 2, awning: true, sign: true },
      { x: 2510, width: 452, top: 106, bottom: 268, side: 58, roofHeight: 53, seed: 709, facade: palette.masonry, sideTone: palette.masonryDark, roof: palette.roofDark, stone: true, windows: 3, battlements: true, arcade: 3 }
    ];
    for (const building of buildings) {
      drawRenaissanceBuilding(context, { ...building, x: building.x + offset }, palette);
    }
    drawKeepLandmark(context, offset + 1004, 256, 500, palette, 733);
    for (let index = 0; index < 5; index += 1) {
      const x = offset + 180 + index * 648;
      drawHangingCloth(context, x, 82 + (index % 2) * 9, 42, 73,
        index % 2 === 0 ? palette.accent : palette.accentAlt, palette.masonryLight, index);
    }
    drawStreetFoundation(context, offset, palette, 751);
  }

  private drawRoad(context: ProceduralDrawingContext, snapshot: GameSnapshot, cameraX: number): void {
    const bounds = roadBounds(snapshot.roadWidth);
    context.save();
    context.translate(-cameraX, 0);
    const road = context.createLinearGradient(0, HORIZON, 0, ROAD_BOTTOM);
    road.addColorStop(0, '#48616a');
    road.addColorStop(0.3, '#405b61');
    road.addColorStop(1, '#263d46');
    context.fillStyle = road;
    context.fillRect(bounds.minX, HORIZON, bounds.maxX - bounds.minX, ROAD_BOTTOM - HORIZON);
    context.save();
    context.beginPath();
    context.rect(bounds.minX, HORIZON, bounds.maxX - bounds.minX, ROAD_BOTTOM - HORIZON);
    context.clip();
    this.drawCobblePerspective(context, bounds.minX, bounds.maxX, cameraX);
    context.restore();

    context.fillStyle = '#273a40';
    context.fillRect(bounds.minX - 13, HORIZON, 13, ROAD_BOTTOM - HORIZON);
    context.fillRect(bounds.maxX, HORIZON, 13, ROAD_BOTTOM - HORIZON);
    context.strokeStyle = 'rgba(215,205,172,0.52)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(bounds.minX, HORIZON);
    context.lineTo(bounds.minX, ROAD_BOTTOM);
    context.moveTo(bounds.maxX, HORIZON);
    context.lineTo(bounds.maxX, ROAD_BOTTOM);
    context.stroke();
    this.drawLane(context, snapshot);
    this.drawExit(context, snapshot);
    context.restore();
  }

  private drawCobblePerspective(context: ProceduralDrawingContext, minX: number, maxX: number, cameraX: number): void {
    // This is a side-scrolling road, not a triangular corridor toward its far
    // end. Every visible lane stays paved; only the stone spacing foreshortens.
    const visibleMin = Math.max(minX, cameraX - 100), visibleMax = Math.min(maxX, cameraX + this.width + 100);
    let y = HORIZON + 2, row = 0;
    while (y < ROAD_BOTTOM + 24) {
      const depth = (y - HORIZON) / (ROAD_BOTTOM - HORIZON);
      const h = 7 + depth * 17, w = 18 + depth * 35;
      const stagger = (row % 2) * w * 0.5;
      const first = Math.floor((visibleMin - stagger) / w) - 1, last = Math.ceil((visibleMax - stagger) / w);
      for (let col = first; col <= last; col++) {
        const n = noise(row * 149 + col * 41, 31), x = col * w + stagger;
        const jitter = (n - .5) * 3, gap = 1.2 + depth * .5;
        const left = x + gap, right = x + w - gap, bottom = y + h - 1.1;
        context.beginPath(); context.moveTo(left + 2, y + jitter + 1);
        context.lineTo(right - 3, y - jitter + 1); context.lineTo(right, y + 3);
        context.lineTo(right - 1, bottom - 2); context.lineTo(right - 4, bottom);
        context.lineTo(left + 2, bottom + jitter * .5); context.lineTo(left, bottom - 3);
        context.lineTo(left - .3, y + 4); context.closePath();
        const tone = Math.round(39 + n * 25 - depth * 7);
        context.fillStyle = `rgb(${tone + 4},${tone + 20},${tone + 25})`; context.fill();
        context.strokeStyle = 'rgba(13,28,33,.58)'; context.lineWidth = .8; context.stroke();
        context.strokeStyle = n > .55 ? 'rgba(198,190,158,.25)' : 'rgba(130,157,155,.16)';
        context.beginPath(); context.moveTo(left + 3, y + 2); context.lineTo(right - 3, y + 2); context.stroke();
        if (n > .7 && depth > .15) { context.strokeStyle = 'rgba(12,27,31,.23)'; context.beginPath(); context.moveTo(left + w * .36, y + 4); context.lineTo(left + w * .43, y + h * .5); context.lineTo(left + w * .3, bottom - 1); context.stroke(); }
      }
      y += h; row++;
    }
  }

  private drawLane(context: ProceduralDrawingContext, snapshot: GameSnapshot): void {
    const lane = snapshot.lane;
    if (!lane) return;
    const bounds = roadBounds(snapshot.roadWidth);
    const from = Math.max(bounds.minX, lane.from - lane.approach);
    const to = Math.min(bounds.maxX, lane.to + lane.approach);
    context.save();
    context.fillStyle = 'rgba(13,26,33,0.19)';
    context.fillRect(lane.from, lane.minZ - 18, lane.to - lane.from, lane.maxZ - lane.minZ + 36);
    context.strokeStyle = 'rgba(239,211,158,0.32)';
    context.lineWidth = 2;
    context.strokeRect(lane.from, lane.minZ - 18, lane.to - lane.from, lane.maxZ - lane.minZ + 36);
    for (let x = from; x <= to; x += 42) {
      const range = laneDepthRange(x, lane);
      const narrowing = laneNarrowingAt(x, lane);
      for (const z of [range.minZ - 12, range.maxZ + 14]) {
        const postHeight = 14 + narrowing * 9;
        context.fillStyle = '#5d4b3b';
        context.fillRect(x - 4, z - postHeight, 8, postHeight);
        context.fillStyle = '#b18b55';
        context.beginPath();
        context.arc(x, z - postHeight, 6, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  private drawExit(context: ProceduralDrawingContext, snapshot: GameSnapshot): void {
    const bounds = roadBounds(snapshot.roadWidth);
    const near = levelExitX(snapshot.roadWidth);
    const width = Math.max(42, bounds.maxX - near);
    const open = snapshot.exitOpen;
    context.save();
    context.fillStyle = open ? 'rgba(244,203,123,0.12)' : 'rgba(9,21,27,0.18)';
    context.fillRect(near, 290, width, 330);
    for (const x of [near - 12, bounds.maxX - 7]) {
      context.fillStyle = '#526a6e';
      context.fillRect(x, 262, 16, 362);
      context.fillStyle = '#9a9a82';
      context.fillRect(x - 4, 254, 24, 12);
      context.strokeStyle = 'rgba(12,26,31,0.85)';
      context.lineWidth = 2;
      context.strokeRect(x, 262, 16, 362);
    }
    if (open) {
      const glow = context.createLinearGradient(near, 600, near, 280);
      const pulse = 0.5 + Math.sin(snapshot.time * 4.1) * 0.5;
      glow.addColorStop(0, `rgba(255,232,172,${0.26 + pulse * 0.1})`);
      glow.addColorStop(1, 'rgba(255,232,172,0)');
      context.fillStyle = glow;
      context.fillRect(near + 8, 280, width - 16, 320);
      context.fillStyle = '#f5dfa5';
      context.strokeStyle = '#382d22';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(near + width * 0.3, 570);
      context.lineTo(near + width * 0.65, 570);
      context.lineTo(near + width * 0.65, 558);
      context.lineTo(near + width * 0.88, 582);
      context.lineTo(near + width * 0.65, 606);
      context.lineTo(near + width * 0.65, 594);
      context.lineTo(near + width * 0.3, 594);
      context.closePath();
      context.fill();
      context.stroke();
    } else {
      context.strokeStyle = '#9c876a';
      context.lineWidth = 10;
      for (let plank = 0; plank < 3; plank += 1) {
        const y = 324 + plank * 78;
        context.beginPath();
        context.moveTo(near - 4, y);
        context.lineTo(bounds.maxX + 7, y + 5);
        context.stroke();
      }
      context.strokeStyle = '#a8ac9c';
      context.lineWidth = 6;
      context.beginPath();
      context.moveTo(near + 12, 300);
      context.lineTo(near + 12, 566);
      context.moveTo(bounds.maxX - 18, 300);
      context.lineTo(bounds.maxX - 18, 566);
      context.stroke();
    }
    context.restore();
  }

  private drawForegroundStructure(
    context: ProceduralDrawingContext,
    scene: SceneryId,
    cameraX: number,
    time: number
  ): void {
    const parallax = 0.68;
    const palette = SCENE_PALETTES[scene];
    const spacing = 760;
    context.save();
    context.translate(-cameraX * parallax, 0);
    const start = Math.floor((cameraX * parallax - 620) / spacing) * spacing;
    for (let index = -1; index < 7; index += 1) {
      const x = start + index * spacing + (index % 2 === 0 ? 34 : 492);
      const screenX = x - cameraX * parallax;
      if (screenX < -230 || screenX > this.width + 230) continue;
      if (screenX > 255 && screenX < this.width - 225) continue;
      const stallWidth = 142 + (index % 3) * 18;
      drawMarketStall(context, x, 211 + (index % 2) * 3, stallWidth, palette, index + 91, scene);
      drawHangingCloth(context, x + stallWidth * 0.54, 188, 29 + (index % 2) * 6, 44,
        index % 2 === 0 ? palette.accent : palette.accentAlt, palette.plasterWarm,
        Math.sin(time * 0.8 + index) * 1.5);
      if (scene === 'sala-darmi') {
        drawWeaponRack(context, x + stallWidth * 0.12, 222, palette, index + 14);
      } else if (scene === 'castello') {
        drawTorch(context, x + stallWidth * 0.79, 222, palette, index + 23, time);
      } else if (scene === 'town-gate') {
        drawHangingSign(context, x + stallWidth * 0.28, 182, 28, palette.accentAlt, palette.accent, index + 31);
      }
    }
    context.restore();
  }

  private drawAtmosphere(
    context: ProceduralDrawingContext,
    scene: SceneryId,
    time: number,
    bossPhase: number,
    cameraX: number
  ): void {
    context.save();
    const horizon = context.createLinearGradient(0, 190, 0, 330);
    horizon.addColorStop(0, 'rgba(190,210,201,0)');
    horizon.addColorStop(0.5, scene === 'castello' ? 'rgba(115,64,57,0.15)' : 'rgba(237,209,156,0.12)');
    horizon.addColorStop(1, 'rgba(22,42,48,0.2)');
    context.fillStyle = horizon;
    context.fillRect(0, 180, this.width, 170);

    const emberColor = scene === 'castello' || bossPhase >= 1 ? '#ec8d4b' : '#f0d395';
    const flecks = scene === 'castello' || bossPhase >= 1 ? 12 : 7;
    for (let index = 0; index < flecks; index += 1) {
      const x = positiveModulo(index * 211 - cameraX * 0.2 + time * (5 + index % 4), this.width + 80) - 40;
      const y = 176 + positiveModulo(index * 67 - time * (7 + index % 3), 130);
      const radius = 0.7 + (index % 3) * 0.45;
      context.globalAlpha = 0.12 + (index % 4) * 0.045;
      context.fillStyle = emberColor;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (bossPhase >= 1) {
      context.save();
      context.globalAlpha = bossPhase >= 2 ? 0.25 : 0.11;
      context.strokeStyle = '#151522';
      context.lineWidth = bossPhase >= 2 ? 9 : 5;
      for (let index = 0; index < 7; index += 1) {
        const y = 252 + index * 57;
        context.beginPath();
        context.moveTo(index % 2 ? this.width : 0, y);
        context.bezierCurveTo(
          this.width * 0.26,
          y - 80,
          this.width * 0.76,
          y + 100,
          index % 2 ? 0 : this.width,
          y + 24
        );
        context.stroke();
      }
      context.restore();
    }
    context.restore();
  }
}
