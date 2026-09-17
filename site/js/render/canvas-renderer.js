import { ATTACKS } from '../sim/attacks.js';
import { clamp } from '../sim/math.js';
import { ITEM_LIFETIME_SECONDS, ITEM_REACH_STATES, itemWithinReach, levelExitX } from '../sim/world.js';
import { attackMotionFor, clamp01, poseForActor } from './procedural-rig.js';
import { ProceduralSceneRenderer } from './procedural-scene.js';
/**
 * The lift is deliberately larger than the procedural rig's tallest body. It
 * also preserves the exported measurement used by existing HUD/debug checks.
 */
export const BAR_LIFT = Object.freeze({
    meyer: 200,
    thug: 186,
    spear: 193,
    captain: 208,
    wretch: 174,
    grotesque: 356
});
const MAX_PARTICLES = 260;
const MAX_FLOATING_TEXTS = 24;
const MAX_IMPACT_MARKS = 32;
const TAU = Math.PI * 2;
const PROCEDURAL_ANIMATION_READINESS = Object.freeze({
    declaredClips: 1,
    readyClips: 1,
    plannedClips: 1,
    declaredAssets: 0,
    loadedAssets: 0,
    pendingAssets: 0,
    failedAssets: 0,
    unsupportedAssets: 0,
    normalizedClips: 1,
    unnormalizedClipIds: Object.freeze([]),
    minScaleCorrection: 1,
    maxScaleCorrection: 1,
    failures: Object.freeze([]),
    source: 'procedural',
    rasterDependencies: 0
});
const PROCEDURAL_BACKGROUND_READINESS = Object.freeze({
    declared: 4,
    loaded: 4,
    pending: 0,
    failed: 0,
    source: 'procedural',
    rasterDependencies: 0
});
export class CanvasRenderer {
    debug;
    width = 1280;
    height = 720;
    context;
    scene;
    particles = [];
    floatingTexts = [];
    impactMarks = [];
    bladeHistory = new Map();
    shake = 0;
    cameraOffsetX = 0;
    constructor(canvas, debug = false) {
        this.debug = debug;
        const dpr = this.renderDpr();
        canvas.width = Math.round(this.width * dpr);
        canvas.height = Math.round(this.height * dpr);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context)
            throw new Error('Canvas 2D is unavailable.');
        this.context = context;
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        context.imageSmoothingEnabled = true;
        this.scene = new ProceduralSceneRenderer(this.width, this.height);
        this.scene.setContext(context);
    }
    getAnimationReadiness() {
        return PROCEDURAL_ANIMATION_READINESS;
    }
    getBackgroundReadiness() {
        return PROCEDURAL_BACKGROUND_READINESS;
    }
    handle(event) {
        const x = finite(event.x, this.width * 0.5);
        const y = finite(event.z, this.height * 0.5);
        const contactY = y + this.hitZoneOffset(event.hitZone) + this.crouchedContactOffset(event.hitZone, event.targetCrouched === true);
        const kind = this.impactKind(event);
        if (kind)
            this.spawnImpact(x, contactY, kind, event);
        if (event.type === 'boss-phase')
            this.shake = Math.max(this.shake, 16);
        if (event.type === 'death') {
            const seed = ((event.actorId ?? 1) * 0.913 + (event.targetId ?? 0) * 0.371) % 1;
            for (let index = 0; index < 20; index += 1) {
                const angle = (seed + index * 0.61803398875) * TAU;
                const variation = ((index * 37 + (event.actorId ?? 0) * 11) % 19) / 18;
                this.pushParticle({
                    x,
                    y: y - 34,
                    vx: Math.cos(angle) * (45 + variation * 112),
                    vy: -70 - Math.abs(Math.sin(angle)) * 150,
                    life: 0.46 + variation * 0.42,
                    maxLife: 0.9,
                    size: 2.5 + variation * 6,
                    color: variation > 0.55 ? '#c6a35f' : '#263a40',
                    gravity: 285,
                    shape: variation > 0.6 ? 'shard' : 'dot'
                });
            }
        }
        if (event.type === 'signature' && event.text) {
            this.pushText({ x, y: y - 102, text: event.text, delay: 0, life: 0.38, maxLife: 0.38, large: true });
        }
        else if ((event.type === 'parry' || event.type === 'interception' || event.type === 'guardbreak') && event.text) {
            this.pushText({ x, y: y - 84, text: event.text, delay: 0, life: 0.54, maxLife: 0.54, large: false });
        }
        else if ((event.type === 'hit' || event.type === 'heavy-hit') && event.amount) {
            this.pushText({ x, y: contactY - 22, text: String(event.amount), delay: 1 / 60, life: 0.18, maxLife: 0.18, large: false });
        }
        else if (event.type === 'item-heal' && event.amount) {
            this.pushText({ x, y: y - 76, text: `+${event.amount}`, delay: 0, life: 0.42, maxLife: 0.42, large: true });
        }
        else if (event.type === 'weapon-break' && event.text) {
            this.pushText({ x, y: y - 68, text: `${event.text.toUpperCase()} SPLITS`, delay: 0, life: 0.46, maxLife: 0.46, large: false });
            for (let index = 0; index < 14; index += 1) {
                const angle = index / 14 * TAU + 0.4;
                this.pushParticle({
                    x,
                    y: y - 44,
                    vx: Math.cos(angle) * (48 + (index % 5) * 24),
                    vy: Math.sin(angle) * 72 - 50,
                    life: 0.3 + (index % 4) * 0.06,
                    maxLife: 0.5,
                    size: 2 + (index % 3),
                    color: '#8f6645',
                    gravity: 430,
                    shape: 'shard'
                });
            }
            this.shake = Math.max(this.shake, 7);
        }
        else if (event.type === 'item-pickup' && event.text) {
            this.pushText({ x, y: y - 80, text: event.text.toUpperCase(), delay: 0, life: 0.34, maxLife: 0.34, large: false });
        }
        else if (event.type === 'weapon-switch') {
            for (let index = 0; index < 7; index += 1) {
                const angle = index / 7 * TAU;
                this.pushParticle({
                    x,
                    y: y - 68,
                    vx: Math.cos(angle) * 36,
                    vy: Math.sin(angle) * 30 - 34,
                    life: 0.22,
                    maxLife: 0.22,
                    size: 2,
                    color: '#e7d39a',
                    gravity: 120,
                    shape: 'shard'
                });
            }
        }
    }
    render(snapshot, dt, focusPlayerIndex = 0) {
        this.synchronizeViewport();
        const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        this.updateEffects(safeDt);
        const focus = snapshot.actors.find(a => a.team === 'players' && a.playerIndex === focusPlayerIndex) ?? snapshot.actors.find(a => a.team === 'players');
        const cameraX = focus && snapshot.phase !== 'title'
            ? clamp(focus.x - this.width * 0.42, 0, Math.max(0, levelExitX(snapshot.roadWidth) + 100 - this.width))
            : finite(snapshot.cameraX, 0);
        this.cameraOffsetX = -cameraX;
        const shakeX = this.shake > 0 ? Math.sin(snapshot.tick * 2.399) * this.shake * 0.5 : 0;
        const shakeY = this.shake > 0 ? Math.cos(snapshot.tick * 1.731) * this.shake * 0.28 : 0;
        this.shake = Math.max(0, this.shake - 48 * safeDt);
        const context = this.context;
        context.save();
        context.translate(shakeX, shakeY);
        this.scene.setContext(context);
        this.scene.draw(snapshot, cameraX, safeDt);
        context.save();
        context.translate(this.cameraOffsetX, 0);
        const visibleActors = snapshot.actors.filter((actor) => this.isOnscreen(actor.x, cameraX, actor.radius + 170));
        const visibleItems = snapshot.items.filter((item) => this.isOnscreen(item.x, cameraX, 120));
        const sortedActors = [...visibleActors].sort((left, right) => left.z - right.z || left.id - right.id);
        for (const actor of sortedActors)
            this.drawShadow(actor);
        for (const item of visibleItems)
            this.drawItemShadow(item);
        this.drawItemOffers(snapshot, cameraX);
        const entries = [
            ...sortedActors.map((actor, index) => ({ depth: finite(actor.z, 0), order: index, actor })),
            ...visibleItems.map((item, index) => ({ depth: finite(item.z, 0), order: 1000 + index, item }))
        ];
        entries.sort((left, right) => left.depth - right.depth || left.order - right.order);
        const visibleIds = new Set();
        for (const entry of entries) {
            if (entry.actor) {
                visibleIds.add(entry.actor.id);
                this.drawActor(entry.actor, snapshot.time);
            }
            else if (entry.item) {
                this.drawItem(entry.item, snapshot.time);
            }
        }
        for (const id of this.bladeHistory.keys()) {
            if (!visibleIds.has(id))
                this.bladeHistory.delete(id);
        }
        this.drawImpactMarks();
        this.drawParticles();
        this.drawFloatingTexts();
        if (this.debug)
            this.drawDebug(snapshot);
        context.restore();
        this.drawOffscreenIndicators(snapshot, cameraX);
        context.restore();
    }
    synchronizeViewport() {
        const canvas = this.context.canvas;
        if (typeof canvas.getBoundingClientRect !== 'function')
            return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1)
            return;
        const ratio = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
        const dpr = Math.min(2, ratio, Math.sqrt(2_000_000 / (rect.width * rect.height)));
        const pixelsW = Math.max(1, Math.round(rect.width * dpr));
        const pixelsH = Math.max(1, Math.round(rect.height * dpr));
        const logicalWidth = pixelsW * this.height / pixelsH;
        if (canvas.width !== pixelsW || canvas.height !== pixelsH || Math.abs(this.width - logicalWidth) > 0.1) {
            canvas.width = pixelsW;
            canvas.height = pixelsH;
            this.width = logicalWidth;
            this.scene = new ProceduralSceneRenderer(this.width, this.height);
        }
        const scale = pixelsH / this.height;
        this.context.setTransform(scale, 0, 0, scale, 0, 0);
        this.context.imageSmoothingEnabled = true;
    }
    renderDpr() {
        const ratio = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
            ? Math.max(1, window.devicePixelRatio)
            : 1;
        const pixelCap = Math.sqrt(2_000_000 / (this.width * this.height));
        return Math.min(2, pixelCap, ratio);
    }
    isOnscreen(x, cameraX, margin) {
        const screenX = x - cameraX;
        return screenX >= -margin && screenX <= this.width + margin;
    }
    spawnImpact(x, y, kind, event) {
        const count = kind === 'guardbreak' ? 18 : kind === 'parry' || kind === 'interception' ? 15 : kind === 'heavy' ? 11 : 8;
        const color = kind === 'parry' ? '#f6d879'
            : kind === 'interception' ? '#e5ece1'
                : kind === 'blocked' ? '#ced2c1'
                    : kind === 'armor' ? '#a9cad0'
                        : kind === 'guardbreak' ? '#e7b85f' : '#d9664e';
        const seed = ((event.actorId ?? 1) * 1.37 + (event.targetId ?? 0) * 0.71) % TAU;
        for (let index = 0; index < count; index += 1) {
            const angle = seed + index / count * TAU;
            const variation = ((index * 47) % 13) / 12;
            const speed = 55 + variation * (kind === 'heavy' || kind === 'guardbreak' ? 165 : 112);
            this.pushParticle({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 58,
                life: kind === 'guardbreak' ? 0.12 + variation * 0.16 : 0.08 + variation * 0.08,
                maxLife: kind === 'guardbreak' ? 0.28 : 0.16,
                size: 1.5 + variation * 3.8,
                color,
                gravity: 370,
                shape: kind === 'parry' || kind === 'interception' ? 'shard' : 'dot'
            });
        }
        const maxLife = kind === 'guardbreak' ? 0.3 : kind === 'heavy' ? 0.16 : kind === 'parry' || kind === 'interception' ? 0.24 : 0.14;
        this.pushImpactMark({ x, y, life: maxLife, maxLife, kind, angle: seed * 0.17 });
        const shake = kind === 'guardbreak' ? 16 : kind === 'heavy' ? 10 : kind === 'interception' ? 8 : kind === 'parry' ? 7 : kind === 'armor' ? 5 : 4;
        this.shake = Math.max(this.shake, shake);
    }
    pushParticle(particle) {
        this.particles.push(particle);
        if (this.particles.length > MAX_PARTICLES)
            this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
    pushText(text) {
        this.floatingTexts.push(text);
        if (this.floatingTexts.length > MAX_FLOATING_TEXTS)
            this.floatingTexts.splice(0, this.floatingTexts.length - MAX_FLOATING_TEXTS);
    }
    pushImpactMark(mark) {
        this.impactMarks.push(mark);
        if (this.impactMarks.length > MAX_IMPACT_MARKS)
            this.impactMarks.splice(0, this.impactMarks.length - MAX_IMPACT_MARKS);
    }
    drawActor(actor, time) {
        const pose = poseForActor(actor, time);
        const scale = this.depthScale(actor.z) * pose.scale;
        const deathFade = actor.state === 'dead'
            ? clamp01(1 - actor.stateElapsed / Math.max(0.01, actor.stateDuration))
            : 1;
        const context = this.context;
        const previous = this.bladeHistory.get(actor.id);
        context.save();
        context.globalAlpha = deathFade;
        context.translate(actor.x, actor.z);
        context.scale(actor.facing * scale, scale);
        context.translate(0, -pose.jump);
        context.rotate(pose.bodyRotation);
        if (actor.team === 'players') {
            context.shadowColor = actor.flashTimer > 0 ? 'rgba(255,241,196,0.95)' : 'rgba(231,182,100,0.55)';
            context.shadowBlur = actor.flashTimer > 0 ? 9 : 4;
        }
        if (actor.archetype === 'grotesque')
            this.drawGrotesque(actor);
        else if (actor.archetype === 'wretch')
            this.drawWretch(actor, pose);
        else
            this.drawHumanoid(actor, pose, previous);
        if (actor.flashTimer > 0) {
            context.shadowBlur = 0;
            context.globalCompositeOperation = 'screen';
            context.globalAlpha = clamp(actor.flashTimer * 5, 0, 0.44);
            context.fillStyle = '#fff1c4';
            context.beginPath();
            context.ellipse(0, -78, actor.archetype === 'grotesque' ? 55 : 30, actor.archetype === 'grotesque' ? 80 : 56, 0, 0, TAU);
            context.fill();
        }
        context.restore();
        this.bladeHistory.set(actor.id, { x: pose.blade.tip.x, y: pose.blade.tip.y, facing: actor.facing });
        if (actor.team === 'enemies' && actor.state !== 'dead')
            this.drawActorBar(actor, pose, scale);
    }
    drawHumanoid(actor, pose, previous) {
        const palette = this.palette(actor);
        this.drawStowedWeapon(actor, palette);
        this.drawLimb(pose.rearHip, pose.rearKnee, pose.rearFoot, 12, palette.dark, palette.body);
        this.drawBoot(pose.rearFoot, palette.dark, -0.08);
        this.drawLimb(pose.frontHip, pose.frontKnee, pose.frontFoot, 13, palette.dark, palette.bodyLight);
        this.drawBoot(pose.frontFoot, palette.dark, 0.08);
        this.drawTailoredBody(actor, pose, palette);
        this.drawLimb(pose.rearArm.root, pose.rearArm.elbow, pose.rearArm.end, 10, palette.dark, palette.body);
        this.drawArmCuff(pose.rearArm.end, palette.accent);
        if (actor.archetype === 'captain')
            this.drawShield(pose, palette);
        this.drawWeaponTrail(actor, pose, previous);
        this.drawWeapon(actor, pose, palette);
        this.drawLimb(pose.frontArm.root, pose.frontArm.elbow, pose.frontArm.end, 10.5, palette.dark, palette.bodyLight);
        this.drawArmCuff(pose.frontArm.end, palette.accent);
        this.drawHand(pose.frontHand, palette.skin, palette.dark, 5.5);
        if (pose.twoHanded)
            this.drawHand(pose.rearHand, palette.skin, palette.dark, 5.2);
        else
            this.drawHand(pose.supportHand, palette.skin, palette.dark, 5);
        this.drawFace(actor, pose, palette);
    }
    drawTailoredBody(actor, pose, palette) {
        const c = this.context, top = pose.chest.y - 9, waist = pose.hip.y + 1;
        const w = actor.archetype === 'captain' ? 25 : 21;
        const shade = c.createLinearGradient(-w, top, w, waist);
        shade.addColorStop(0, palette.bodyLight);
        shade.addColorStop(.45, palette.body);
        shade.addColorStop(1, palette.dark);
        c.fillStyle = palette.skinShadow;
        c.beginPath();
        c.roundRect(-5, pose.neck.y - 4, 11, Math.max(8, top - pose.neck.y + 12), 3);
        c.fill();
        c.beginPath();
        c.moveTo(-w, top + 7);
        c.quadraticCurveTo(-w * .9, top, -7, top);
        c.lineTo(6, top);
        c.quadraticCurveTo(w * .9, top, w, top + 7);
        c.bezierCurveTo(w - 2, top + 18, w * .68, waist - 12, w * .72, waist);
        c.lineTo(w * .82, waist + 9);
        c.quadraticCurveTo(0, waist + 14, -w * .85, waist + 8);
        c.lineTo(-w * .73, waist);
        c.bezierCurveTo(-w * .69, waist - 16, -w - 2, top + 19, -w, top + 7);
        c.closePath();
        c.fillStyle = shade;
        c.fill();
        c.strokeStyle = palette.dark;
        c.lineWidth = 1.3;
        c.stroke();
        c.fillStyle = palette.cream;
        c.beginPath();
        c.moveTo(-9, top);
        c.lineTo(-2, top + 15);
        c.lineTo(6, top + 2);
        c.lineTo(5, top - 2);
        c.lineTo(-5, top - 3);
        c.closePath();
        c.fill();
        c.strokeStyle = 'rgba(255,241,207,0.42)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(-w + 5, top + 9);
        c.quadraticCurveTo(-w * .6, (top + waist) / 2, -w * .7, waist - 5);
        c.stroke();
        if (actor.archetype === 'captain') {
            const steel = c.createLinearGradient(-w, top, w, waist);
            steel.addColorStop(0, '#536975');
            steel.addColorStop(.4, '#b6c0b9');
            steel.addColorStop(.53, '#d8d8c7');
            steel.addColorStop(.6, '#70868b');
            steel.addColorStop(1, '#354b57');
            c.beginPath();
            c.moveTo(-w + 3, top + 8);
            c.lineTo(-7, top + 6);
            c.lineTo(6, top + 6);
            c.lineTo(w - 3, top + 8);
            c.quadraticCurveTo(w + 1, waist - 14, 5, waist - 3);
            c.lineTo(-11, waist - 3);
            c.quadraticCurveTo(-w - 2, waist - 16, -w + 3, top + 8);
            c.closePath();
            c.fillStyle = steel;
            c.fill();
            c.strokeStyle = '#293b43';
            c.stroke();
            c.strokeStyle = '#e3c793';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(3, top + 9);
            c.lineTo(5, waist - 7);
            c.stroke();
            for (let j = 0; j < 3; j++) {
                c.strokeStyle = '#7c8b8c';
                c.beginPath();
                c.moveTo(-17, waist + j * 4);
                c.quadraticCurveTo(0, waist + 5 + j * 4, 18, waist + j * 4);
                c.stroke();
            }
        }
        else {
            for (let j = 0; j < 4; j++) {
                const x = -12 + j * 7;
                c.strokeStyle = j % 2 ? palette.accent : palette.cream;
                c.lineWidth = 2.3;
                c.beginPath();
                c.moveTo(x, top + 15);
                c.quadraticCurveTo(x - 3, top + 24, x - 1, waist - 8);
                c.stroke();
            }
        }
        c.fillStyle = '#3b2723';
        c.beginPath();
        c.roundRect(-w * .82, waist - 4, w * 1.64, 6, 2);
        c.fill();
        c.strokeStyle = palette.accent;
        c.lineWidth = 1.5;
        c.strokeRect(2, waist - 3.5, 6, 5);
        c.fillStyle = palette.dark;
        c.beginPath();
        c.roundRect(-w * .94, waist - 1, 8, 12, 3);
        c.fill();
        c.strokeStyle = '#b68a59';
        c.lineWidth = .8;
        c.stroke();
        c.fillStyle = palette.accent;
        for (let j = 0; j < 3; j++) {
            c.beginPath();
            c.arc(2, top + 18 + j * 8, 1.15, 0, TAU);
            c.fill();
        }
        if (actor.archetype === 'spear') {
            c.strokeStyle = '#846546';
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(-14, top + 5);
            c.lineTo(13, waist);
            c.stroke();
            c.strokeStyle = '#c8ad79';
            c.lineWidth = .8;
            c.stroke();
        }
    }
    drawFace(actor, pose, palette) {
        const c = this.context, h = pose.head, r = pose.headRadius;
        c.save();
        c.translate(h.x, h.y);
        const skin = c.createLinearGradient(-r, -r, r, r * .8);
        skin.addColorStop(0, palette.skinShadow);
        skin.addColorStop(.4, palette.skin);
        skin.addColorStop(.72, palette.skin);
        skin.addColorStop(1, palette.skinShadow);
        c.beginPath();
        c.moveTo(-r * .72, -r * .5);
        c.bezierCurveTo(-r * .65, -r * 1.15, r * .55, -r * 1.18, r * .72, -r * .5);
        c.quadraticCurveTo(r * .8, r * .03, r * .72, r * .42);
        c.lineTo(r * .38, r * .9);
        c.quadraticCurveTo(-r * .15, r * 1.06, -r * .55, r * .57);
        c.closePath();
        c.fillStyle = skin;
        c.fill();
        c.strokeStyle = palette.dark;
        c.lineWidth = 1.15;
        c.stroke();
        c.fillStyle = palette.skinShadow;
        c.beginPath();
        c.ellipse(-r * .65, r * .05, r * .2, r * .3, -.1, 0, TAU);
        c.fill();
        c.strokeStyle = palette.skin;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(-r * .67, r * .04, r * .11, -2, 1);
        c.stroke();
        c.fillStyle = '#eadcc0';
        c.beginPath();
        c.ellipse(r * .36, -r * .19, 3, 1.6, -.08, 0, TAU);
        c.fill();
        c.fillStyle = '#25343a';
        c.beginPath();
        c.ellipse(r * .47, -r * .2, 1.2, 1.5, 0, 0, TAU);
        c.fill();
        c.strokeStyle = '#473329';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(r * .09, -r * .34);
        c.lineTo(r * .62, -r * .31);
        c.stroke();
        c.fillStyle = palette.skin;
        c.beginPath();
        c.moveTo(r * .54, -r * .08);
        c.lineTo(r * .86, r * .24);
        c.lineTo(r * .45, r * .29);
        c.closePath();
        c.fill();
        c.strokeStyle = palette.skinShadow;
        c.lineWidth = .9;
        c.beginPath();
        c.moveTo(r * .84, r * .25);
        c.lineTo(r * .52, r * .3);
        c.stroke();
        c.strokeStyle = '#765043';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(r * .22, r * .58);
        c.quadraticCurveTo(r * .43, r * .61, r * .59, r * .54);
        c.stroke();
        c.fillStyle = actor.archetype === 'meyer' ? '#573b2a' : '#372e29';
        c.beginPath();
        c.moveTo(-r * .78, r * .04);
        c.lineTo(-r * .84, -r * .63);
        c.bezierCurveTo(-r * .7, -r * 1.2, r * .5, -r * 1.2, r * .72, -r * .65);
        c.quadraticCurveTo(r * .3, -r * .53, -r * .05, -r * .63);
        c.lineTo(-r * .48, -r * .18);
        c.lineTo(-r * .51, r * .22);
        c.closePath();
        c.fill();
        c.strokeStyle = '#987347';
        c.lineWidth = .85;
        for (let j = 0; j < 4; j++) {
            c.beginPath();
            c.moveTo(-r * .6 + j * 3, -r * .71);
            c.quadraticCurveTo(-r * .6 + j * 2, -r * .4, -r * .59 + j, -r * .16);
            c.stroke();
        }
        if (actor.archetype === 'meyer') {
            c.fillStyle = '#68352e';
            c.beginPath();
            c.ellipse(-2, -r * .94, r * 1.1, r * .4, -.11, 0, TAU);
            c.fill();
            c.strokeStyle = palette.accent;
            c.lineWidth = 1.7;
            c.beginPath();
            c.ellipse(-1, -r * .85, r * 1.14, 3, -.07, 0, Math.PI);
            c.stroke();
            c.fillStyle = palette.cream;
            c.beginPath();
            c.moveTo(r * .61, -r);
            c.quadraticCurveTo(r * .54, -r * 1.7, r * 1.36, -r * 1.92);
            c.quadraticCurveTo(r * 1.05, -r * 1.17, r * .61, -r);
            c.fill();
            c.strokeStyle = '#ba9d68';
            c.lineWidth = .7;
            c.beginPath();
            c.moveTo(r * .62, -r);
            c.lineTo(r * 1.22, -r * 1.78);
            c.stroke();
        }
        else if (actor.archetype === 'captain' || actor.archetype === 'spear') {
            const metal = c.createLinearGradient(-r, -r, r, 0);
            metal.addColorStop(0, '#415761');
            metal.addColorStop(.48, '#c3d0c7');
            metal.addColorStop(.61, '#80979a');
            metal.addColorStop(1, '#344c5a');
            c.fillStyle = metal;
            c.beginPath();
            c.moveTo(-r * .97, -r * .06);
            c.bezierCurveTo(-r, -r * 1.2, r * .5, -r * 1.42, r * .85, -r * .12);
            c.lineTo(r * 1.18, r * .02);
            c.quadraticCurveTo(r * .1, r * .18, -r * 1.1, r * .11);
            c.closePath();
            c.fill();
            c.strokeStyle = '#273b45';
            c.lineWidth = 1.25;
            c.stroke();
            c.strokeStyle = '#dce0cc';
            c.lineWidth = 1.2;
            c.beginPath();
            c.moveTo(-r * .1, -r * 1.15);
            c.quadraticCurveTo(r * .2, -r * .7, r * .22, -r * .07);
            c.stroke();
            if (actor.archetype === 'captain') {
                c.fillStyle = '#657f86';
                c.beginPath();
                c.moveTo(-r * .72, r * .02);
                c.lineTo(-r * .55, r * .78);
                c.lineTo(-r * .1, r * .6);
                c.lineTo(-r * .23, r * .09);
                c.fill();
            }
        }
        else if (actor.archetype === 'thug') {
            c.fillStyle = '#3c2e28';
            c.beginPath();
            c.moveTo(-r * .36, r * .3);
            c.quadraticCurveTo(-r * .15, r * .67, r * .25, r * .65);
            c.lineTo(r * .58, r * .54);
            c.quadraticCurveTo(r * .4, r * 1.04, -r * .17, r * .89);
            c.closePath();
            c.fill();
            c.strokeStyle = '#89724f';
            c.lineWidth = .7;
            c.beginPath();
            c.moveTo(-r * .06, r * .7);
            c.lineTo(r * .05, r * .86);
            c.stroke();
            c.fillStyle = '#696252';
            c.beginPath();
            c.ellipse(-2, -r * .96, r * .94, r * .25, -.18, 0, TAU);
            c.fill();
        }
        c.restore();
    }
    drawWretch(actor, pose) {
        const context = this.context;
        const pulse = 1 + Math.sin(actor.stateElapsed * 8.5 + actor.id) * 0.035;
        context.save();
        context.scale(pulse, 1 / pulse);
        const body = context.createRadialGradient(-10, -69, 10, 8, -71, 76);
        body.addColorStop(0, '#47636a');
        body.addColorStop(0.58, '#263a43');
        body.addColorStop(1, '#111a23');
        context.fillStyle = body;
        context.beginPath();
        context.moveTo(-28, -22);
        context.quadraticCurveTo(-40, -84, -12, -115);
        context.quadraticCurveTo(7, -131, 28, -102);
        context.quadraticCurveTo(42, -63, 23, -18);
        context.closePath();
        context.fill();
        context.strokeStyle = '#0c151c';
        context.lineWidth = 5;
        context.stroke();
        context.strokeStyle = 'rgba(192,167,119,0.48)';
        context.lineWidth = 3;
        for (let rib = 0; rib < 4; rib += 1) {
            context.beginPath();
            context.moveTo(-18 + rib * 4, -72 + rib * 12);
            context.quadraticCurveTo(0, -61 + rib * 12, 19 - rib * 4, -72 + rib * 12);
            context.stroke();
        }
        this.drawLimb(pose.rearArm.root, point(-45, -42), point(-72, -8), 10, '#0d171d', '#2e4a53');
        this.drawLimb(pose.frontArm.root, point(42, -42), point(76, -9), 11, '#0d171d', '#385762');
        this.drawClaw(point(-72, -8), -0.5);
        this.drawClaw(point(76, -9), 0.3);
        this.drawFace(actor, { ...pose, head: point(-2, -102), headRadius: 19 }, {
            body: '#263a43', bodyLight: '#47636a', dark: '#0d171d', accent: '#819b91', cream: '#d6c49e',
            skin: '#d3c0a0', skinShadow: '#8b765f', steel: '#b3c5c2', leather: '#2b1d25'
        });
        context.fillStyle = '#d6c49e';
        context.beginPath();
        context.arc(-10, -105, 3.5, 0, TAU);
        context.arc(9, -105, 3.5, 0, TAU);
        context.fill();
        context.fillStyle = '#9e414b';
        context.beginPath();
        context.ellipse(0, -91, 13, 5, 0, 0, TAU);
        context.fill();
        context.restore();
    }
    drawGrotesque(actor) {
        const context = this.context;
        const pulse = 1 + Math.sin(actor.stateElapsed * 4.8 + actor.id) * 0.035;
        context.save();
        context.scale(pulse, 1 / pulse);
        const body = context.createRadialGradient(-24, -121, 18, 12, -112, 112);
        body.addColorStop(0, '#72594c');
        body.addColorStop(0.42, '#3a3038');
        body.addColorStop(1, '#161a23');
        context.fillStyle = body;
        context.beginPath();
        context.ellipse(0, -108, 62, 96, 0, 0, TAU);
        context.fill();
        context.strokeStyle = '#10131c';
        context.lineWidth = 8;
        context.stroke();
        context.fillStyle = '#7f6c58';
        context.beginPath();
        context.moveTo(-36, -165);
        context.lineTo(-19, -214);
        context.lineTo(-4, -176);
        context.lineTo(15, -213);
        context.lineTo(37, -163);
        context.closePath();
        context.fill();
        context.strokeStyle = '#15151c';
        context.lineWidth = 6;
        context.stroke();
        context.fillStyle = '#e3c98a';
        context.beginPath();
        context.ellipse(-21, -153, 8, 11, 0, 0, TAU);
        context.ellipse(22, -153, 8, 11, 0, 0, TAU);
        context.fill();
        context.fillStyle = '#4a1d2c';
        context.beginPath();
        context.arc(-20, -153, 3.5, 0, TAU);
        context.arc(22, -153, 3.5, 0, TAU);
        context.fill();
        context.fillStyle = '#171018';
        context.beginPath();
        context.ellipse(0, -125, 31, 12, 0, 0, TAU);
        context.fill();
        context.strokeStyle = '#c38e62';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(-22, -115);
        context.lineTo(-12, -108);
        context.lineTo(-2, -115);
        context.lineTo(9, -107);
        context.lineTo(22, -115);
        context.stroke();
        this.drawLimb(point(-44, -106), point(-73, -55), point(-108, -15), 19, '#11151e', '#302b34');
        this.drawLimb(point(43, -104), point(75, -55), point(110, -12), 19, '#11151e', '#3d3035');
        this.drawClaw(point(-108, -15), -0.7, 16);
        this.drawClaw(point(110, -12), 0.35, 16);
        context.strokeStyle = '#ad9b83';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(-43, -115);
        context.quadraticCurveTo(0, -70, 46, -111);
        context.stroke();
        for (let link = 0; link < 6; link += 1) {
            context.beginPath();
            context.ellipse(-34 + link * 14, -103 + Math.sin(link) * 15, 5, 8, 0.45, 0, TAU);
            context.stroke();
        }
        context.strokeStyle = '#8f6b4c';
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(-40, -28);
        context.lineTo(-54, 4);
        context.moveTo(40, -28);
        context.lineTo(54, 4);
        context.stroke();
        context.fillStyle = '#c2a05f';
        context.beginPath();
        context.arc(-54, 5, 5, 0, TAU);
        context.arc(54, 5, 5, 0, TAU);
        context.fill();
        context.restore();
    }
    drawLimb(root, elbow, end, width, dark, light) {
        const c = this.context;
        const normal = (a, b) => {
            const d = Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y));
            return { x: -(b.y - a.y) / d, y: (b.x - a.x) / d };
        };
        const n0 = normal(root, elbow), n1 = normal(elbow, end);
        const m = { x: (n0.x + n1.x) * 0.5, y: (n0.y + n1.y) * 0.5 };
        const r0 = width * 0.76, r1 = width * 0.56, r2 = width * 0.35;
        const shade = c.createLinearGradient(root.x - width, root.y - width, end.x + width, end.y + width);
        shade.addColorStop(0, light);
        shade.addColorStop(0.4, light);
        shade.addColorStop(1, dark);
        c.beginPath();
        c.moveTo(root.x + n0.x * r0, root.y + n0.y * r0);
        c.quadraticCurveTo(elbow.x + n0.x * r0, elbow.y + n0.y * r0, elbow.x + m.x * r1, elbow.y + m.y * r1);
        c.quadraticCurveTo(end.x + n1.x * r1, end.y + n1.y * r1, end.x + n1.x * r2, end.y + n1.y * r2);
        c.lineTo(end.x - n1.x * r2, end.y - n1.y * r2);
        c.quadraticCurveTo(elbow.x - n1.x * r1, elbow.y - n1.y * r1, elbow.x - m.x * r1, elbow.y - m.y * r1);
        c.quadraticCurveTo(root.x - n0.x * r0, root.y - n0.y * r0, root.x - n0.x * r0, root.y - n0.y * r0);
        c.closePath();
        c.fillStyle = shade;
        c.fill();
        c.strokeStyle = dark;
        c.lineWidth = 1.1;
        c.stroke();
        c.strokeStyle = 'rgba(255,232,194,0.28)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(root.x - n0.x * r0 * .48, root.y - n0.y * r0 * .48);
        c.quadraticCurveTo(elbow.x - m.x * r1 * .55, elbow.y - m.y * r1 * .55, end.x - n1.x * r2 * .5, end.y - n1.y * r2 * .5);
        c.stroke();
        if (width < 12) {
            for (let i = 1; i < 4; i++) {
                const t = i / 5, x = root.x + (elbow.x - root.x) * t, y = root.y + (elbow.y - root.y) * t;
                c.strokeStyle = 'rgba(245,216,169,0.6)';
                c.lineWidth = 1.9;
                c.beginPath();
                c.moveTo(x - n0.x * r0 * .36, y - n0.y * r0 * .36);
                c.lineTo(x + n0.x * r0 * .34 + (elbow.x - root.x) * .06, y + n0.y * r0 * .34 + (elbow.y - root.y) * .06);
                c.stroke();
            }
        }
    }
    drawBoot(foot, color, tilt) {
        const context = this.context;
        context.save();
        context.translate(foot.x, foot.y - 3);
        context.rotate(tilt);
        context.fillStyle = color;
        context.beginPath();
        context.moveTo(-7, 0);
        context.lineTo(15, 0);
        context.quadraticCurveTo(25, 2, 26, 8);
        context.lineTo(-9, 8);
        context.closePath();
        context.fill();
        context.fillStyle = '#a06a46';
        context.fillRect(-6, -17, 12, 19);
        context.strokeStyle = '#101b22';
        context.lineWidth = 3;
        context.stroke();
        context.restore();
    }
    drawArmCuff(hand, color) {
        const context = this.context;
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(hand.x, hand.y, 5.2, 3.8, -0.3, 0, TAU);
        context.fill();
    }
    drawHand(hand, skin, dark, radius) {
        const context = this.context;
        context.fillStyle = skin;
        context.beginPath();
        context.arc(hand.x, hand.y, radius, 0, TAU);
        context.fill();
        context.strokeStyle = dark;
        context.lineWidth = 0.8;
        context.stroke();
        context.strokeStyle = 'rgba(255,226,184,0.46)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(hand.x - radius * 0.4, hand.y);
        context.lineTo(hand.x + radius * 0.35, hand.y + radius * 0.25);
        context.stroke();
    }
    drawWeaponTrail(actor, pose, previous) {
        if (actor.state !== 'attack' || pose.attack.phase === 'anticipation')
            return;
        const context = this.context;
        const trail = pose.bladeTrail;
        if (trail.length < 2 && !previous)
            return;
        const points = trail.length >= 2 ? trail : [
            point(pose.blade.base.x, pose.blade.base.y),
            point(previous?.x ?? pose.blade.tip.x, previous?.y ?? pose.blade.tip.y),
            pose.blade.tip
        ];
        const alpha = pose.attack.phase === 'contact' ? 0.48 : 0.2;
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.lineCap = 'round';
        for (let index = 1; index < points.length; index += 1) {
            const from = points[index - 1];
            const to = points[index];
            if (!from || !to)
                continue;
            context.globalAlpha = alpha * (index / points.length);
            context.strokeStyle = index % 2 ? '#e4eff0' : '#b8dddf';
            context.lineWidth = pose.attack.phase === 'contact' ? 4.5 - index * 0.45 : 3 - index * 0.28;
            context.beginPath();
            context.moveTo(from.x, from.y);
            context.lineTo(to.x, to.y);
            context.stroke();
        }
        context.restore();
    }
    drawWeapon(actor, pose, palette) {
        const context = this.context;
        const blade = pose.blade;
        if (pose.weapon === 'club') {
            this.drawClub(pose, palette);
        }
        else if (pose.weapon === 'spear') {
            this.drawSpear(pose, palette);
        }
        else {
            this.drawBlade(blade, pose.weapon, palette.steel, palette.leather, palette.accent);
        }
        if (pose.attack.phase === 'contact' || actor.state === 'block') {
            context.save();
            context.globalCompositeOperation = 'lighter';
            context.strokeStyle = 'rgba(255,246,207,0.82)';
            context.lineWidth = 2;
            const glintStart = point(blade.tip.x - Math.cos(blade.angle) * 18, blade.tip.y - Math.sin(blade.angle) * 18);
            context.beginPath();
            context.moveTo(glintStart.x, glintStart.y);
            context.lineTo(blade.tip.x, blade.tip.y);
            context.stroke();
            context.restore();
        }
    }
    drawBlade(blade, weapon, steel, leather, accent) {
        const context = this.context;
        const direction = { x: Math.cos(blade.angle), y: Math.sin(blade.angle) };
        const normal = { x: -direction.y, y: direction.x };
        const width = weapon === 'longsword' ? 5.2 : 7.5;
        const shoulder = point(blade.base.x - direction.x * 2, blade.base.y - direction.y * 2);
        const tip = blade.tip;
        drawPath(context, [
            add(shoulder, scale(normal, width)),
            add(tip, scale(normal, 0.8)),
            add(tip, scale(normal, -0.8)),
            add(shoulder, scale(normal, -width))
        ]);
        const metal = context.createLinearGradient(shoulder.x + normal.x * width, shoulder.y + normal.y * width, tip.x + normal.x * width, tip.y + normal.y * width);
        metal.addColorStop(0, '#a8c4c6');
        metal.addColorStop(0.45, steel);
        metal.addColorStop(0.72, '#f0f4e7');
        metal.addColorStop(1, '#7c9b9f');
        context.fillStyle = metal;
        context.fill();
        context.strokeStyle = '#273a40';
        context.lineWidth = 2;
        context.stroke();
        context.strokeStyle = 'rgba(255,255,236,0.74)';
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(shoulder.x + normal.x * 1.1, shoulder.y + normal.y * 1.1);
        context.lineTo(tip.x + normal.x * 0.15, tip.y + normal.y * 0.15);
        context.stroke();
        context.strokeStyle = accent;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(blade.base.x + normal.x * 11, blade.base.y + normal.y * 11);
        context.lineTo(blade.base.x - normal.x * 11, blade.base.y - normal.y * 11);
        context.stroke();
        context.strokeStyle = '#402a24';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(blade.base.x - direction.x * 4, blade.base.y - direction.y * 4);
        context.lineTo(blade.base.x - direction.x * blade.gripLength, blade.base.y - direction.y * blade.gripLength);
        context.stroke();
        context.strokeStyle = leather;
        context.lineWidth = 3;
        for (let wrap = 1; wrap < 4; wrap += 1) {
            const amount = wrap / 4;
            const x = blade.base.x - direction.x * blade.gripLength * amount;
            const y = blade.base.y - direction.y * blade.gripLength * amount;
            context.beginPath();
            context.moveTo(x - normal.x * 3, y - normal.y * 3);
            context.lineTo(x + normal.x * 3, y + normal.y * 3);
            context.stroke();
        }
    }
    drawClub(pose, palette) {
        const context = this.context;
        const base = pose.blade.base;
        const tip = pose.blade.tip;
        const direction = { x: Math.cos(pose.blade.angle), y: Math.sin(pose.blade.angle) };
        const normal = { x: -direction.y, y: direction.x };
        context.strokeStyle = '#3b2723';
        context.lineWidth = 10;
        context.beginPath();
        context.moveTo(base.x, base.y);
        context.lineTo(tip.x - direction.x * 12, tip.y - direction.y * 12);
        context.stroke();
        drawPath(context, [
            add(tip, scale(normal, 11)),
            add(tip, scale(direction, -19)),
            add(tip, scale(normal, -11)),
            add(tip, scale(direction, 8))
        ]);
        const wood = context.createLinearGradient(tip.x, tip.y - 12, tip.x, tip.y + 12);
        wood.addColorStop(0, '#a96f40');
        wood.addColorStop(0.5, palette.leather);
        wood.addColorStop(1, '#2b2020');
        context.fillStyle = wood;
        context.fill();
        context.strokeStyle = '#17252a';
        context.lineWidth = 3;
        context.stroke();
        context.strokeStyle = '#c38a4f';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(tip.x + normal.x * 7, tip.y + normal.y * 7);
        context.lineTo(tip.x - normal.x * 7, tip.y - normal.y * 7);
        context.stroke();
    }
    drawSpear(pose, palette) {
        const context = this.context;
        const direction = { x: Math.cos(pose.blade.angle), y: Math.sin(pose.blade.angle) };
        const back = point(pose.blade.base.x - direction.x * pose.blade.gripLength, pose.blade.base.y - direction.y * pose.blade.gripLength);
        context.strokeStyle = '#332923';
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(back.x, back.y);
        context.lineTo(pose.blade.tip.x, pose.blade.tip.y);
        context.stroke();
        context.strokeStyle = '#8d6039';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(back.x, back.y);
        context.lineTo(pose.blade.tip.x, pose.blade.tip.y);
        context.stroke();
        const tip = pose.blade.tip;
        const normal = { x: -direction.y, y: direction.x };
        drawPath(context, [
            add(tip, scale(direction, 19)),
            add(tip, scale(normal, 7)),
            add(tip, scale(direction, -5)),
            add(tip, scale(normal, -7))
        ]);
        context.fillStyle = palette.steel;
        context.fill();
        context.strokeStyle = '#27373b';
        context.lineWidth = 2;
        context.stroke();
        context.strokeStyle = '#d5b15c';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(pose.blade.base.x + normal.x * 5, pose.blade.base.y + normal.y * 5);
        context.lineTo(pose.blade.base.x - normal.x * 5, pose.blade.base.y - normal.y * 5);
        context.stroke();
    }
    drawShield(pose, palette) {
        const context = this.context;
        const center = point(pose.supportHand.x - 19, pose.supportHand.y + 4);
        context.save();
        context.translate(center.x, center.y);
        context.rotate(0.12);
        drawPath(context, [
            { x: -20, y: -24 }, { x: 19, y: -20 }, { x: 24, y: 7 }, { x: 0, y: 31 }, { x: -23, y: 7 }
        ]);
        const shield = context.createLinearGradient(-20, -25, 20, 22);
        shield.addColorStop(0, '#9ba5a0');
        shield.addColorStop(0.45, palette.body);
        shield.addColorStop(1, palette.dark);
        context.fillStyle = shield;
        context.fill();
        context.strokeStyle = '#182930';
        context.lineWidth = 4;
        context.stroke();
        context.strokeStyle = palette.accent;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(0, -22);
        context.lineTo(0, 25);
        context.moveTo(-19, 0);
        context.lineTo(20, 0);
        context.stroke();
        context.fillStyle = '#d4be7b';
        context.beginPath();
        context.arc(0, 0, 5, 0, TAU);
        context.fill();
        context.restore();
    }
    drawStowedWeapon(actor, palette) {
        if (actor.archetype !== 'meyer' || actor.weapon === 'longsword' || actor.weapon === 'dussack')
            return;
        const context = this.context;
        const angle = -1.86;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const start = point(-19, -44);
        const end = add(start, scale(direction, actor.weapon === 'spear' ? 80 : 49));
        context.save();
        context.globalAlpha = 0.78;
        context.strokeStyle = palette.dark;
        context.lineWidth = actor.weapon === 'spear' ? 6 : 9;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.strokeStyle = actor.weapon === 'spear' ? '#c4c9bc' : '#81543b';
        context.lineWidth = actor.weapon === 'spear' ? 3 : 6;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
        context.restore();
    }
    drawClaw(origin, angle, size = 12) {
        const context = this.context;
        context.save();
        context.translate(origin.x, origin.y);
        context.rotate(angle);
        context.strokeStyle = '#b49d7a';
        context.lineWidth = 3;
        context.lineCap = 'round';
        for (let claw = -1; claw <= 1; claw += 1) {
            context.beginPath();
            context.moveTo(claw * 4, 0);
            context.quadraticCurveTo(claw * 8, -size * 0.7, claw * 11, -size);
            context.stroke();
        }
        context.restore();
    }
    drawItemShadow(item) {
        const context = this.context;
        const scale = this.depthScale(item.z);
        const contact = clamp(1 - item.y / 44, 0.2, 1);
        context.save();
        context.globalAlpha = 0.32 * contact;
        context.fillStyle = '#09131a';
        context.beginPath();
        context.ellipse(item.x, item.z + 4, (item.kind === 'spear' ? 22 : 14) * scale * contact, 5 * scale * contact, 0, 0, TAU);
        context.fill();
        context.restore();
    }
    drawShadow(actor) {
        if (actor.state === 'dead' && actor.stateElapsed > 0.86)
            return;
        const context = this.context;
        const scale = this.depthScale(actor.z);
        context.save();
        context.globalAlpha = clamp(0.42 - this.jumpAmount(actor) / 300, 0.12, 0.42);
        context.fillStyle = '#081219';
        context.beginPath();
        context.ellipse(actor.x, actor.z + 7, actor.archetype === 'grotesque' ? 66 * scale : actor.radius * 1.65 * scale, actor.archetype === 'grotesque' ? 22 * scale : actor.radius * 0.48 * scale, 0, 0, TAU);
        context.fill();
        context.restore();
    }
    drawItemOffers(snapshot, cameraX) {
        if (snapshot.items.length === 0)
            return;
        const reachable = snapshot.actors.filter((actor) => actor.state !== 'dead' && ITEM_REACH_STATES.has(actor.state));
        const context = this.context;
        for (const item of snapshot.items) {
            if (!this.isOnscreen(item.x, cameraX, 80) || !reachable.some((actor) => itemWithinReach(actor, item)))
                continue;
            const scale = this.depthScale(item.z);
            const pulse = 0.5 + 0.5 * Math.sin(snapshot.time * 4.2 + item.id * 1.7);
            context.save();
            context.translate(item.x, item.z - item.y * scale);
            context.scale(scale, scale);
            context.globalAlpha = 0.2 + pulse * 0.35;
            context.strokeStyle = '#f1d27f';
            context.lineWidth = 2.2;
            context.beginPath();
            context.ellipse(0, 3, 18, 6.5, 0, 0, TAU);
            context.stroke();
            context.globalAlpha = 0.5 + pulse * 0.5;
            context.fillStyle = '#f8e8b3';
            context.beginPath();
            context.moveTo(-7, -40);
            context.lineTo(7, -40);
            context.lineTo(0, -29);
            context.closePath();
            context.fill();
            context.restore();
        }
    }
    drawItem(item, time) {
        const context = this.context;
        const scale = this.depthScale(item.z);
        const lift = item.y * scale;
        const alpha = item.age > ITEM_LIFETIME_SECONDS - 3 ? 0.35 + 0.65 * Math.abs(Math.sin(item.age * 7)) : 1;
        context.save();
        context.globalAlpha = alpha;
        context.translate(item.x, item.z - lift);
        context.scale(scale, scale);
        if (item.kind === 'potion') {
            context.translate(0, Math.sin(time * 3.1 + item.id) * 1.4 - 12);
            const glow = context.createRadialGradient(0, 2, 1, 0, 2, 24);
            glow.addColorStop(0, 'rgba(239,122,91,0.46)');
            glow.addColorStop(1, 'rgba(239,122,91,0)');
            context.fillStyle = glow;
            context.beginPath();
            context.arc(0, 2, 24, 0, TAU);
            context.fill();
            context.fillStyle = '#d8e5d7';
            context.beginPath();
            context.ellipse(0, 4, 9, 10, 0, 0, TAU);
            context.fill();
            context.fillStyle = '#b84442';
            context.beginPath();
            context.ellipse(0, 5, 7, 8, 0, 0, TAU);
            context.fill();
            context.fillStyle = '#d8e5d7';
            context.fillRect(-4, -9, 8, 7);
            context.fillStyle = '#7b5837';
            context.fillRect(-5, -14, 10, 5);
            context.fillStyle = '#fff8dc';
            context.beginPath();
            context.arc(-3, 1, 2.2, 0, TAU);
            context.fill();
        }
        else {
            context.rotate(item.thrown ? item.age * 11 : -0.2 + (item.id % 3) * 0.06);
            const palette = this.paletteForWeapon(item.kind);
            const blade = {
                base: { x: -18, y: 0 },
                tip: { x: item.kind === 'spear' ? 48 : item.kind === 'club' ? 42 : 52, y: 0 },
                length: 60,
                angle: 0,
                gripLength: item.kind === 'spear' ? 24 : 10
            };
            if (item.kind === 'club')
                this.drawClub({ blade, scale: 1, bodyHeight: 0, jump: 0, crouch: 0, bodyRotation: 0, hip: point(0, 0), chest: point(0, 0), neck: point(0, 0), head: point(0, 0), headRadius: 0, frontShoulder: point(0, 0), rearShoulder: point(0, 0), frontHip: point(0, 0), rearHip: point(0, 0), frontKnee: point(0, 0), rearKnee: point(0, 0), frontFoot: point(0, 0), rearFoot: point(0, 0), frontElbow: point(0, 0), rearElbow: point(0, 0), frontHand: point(0, 0), rearHand: point(0, 0), supportHand: point(0, 0), frontArm: { root: point(0, 0), elbow: point(0, 0), end: point(0, 0), upperLength: 1, lowerLength: 1 }, rearArm: { root: point(0, 0), elbow: point(0, 0), end: point(0, 0), upperLength: 1, lowerLength: 1 }, attack: attackMotionFor({ ...emptyActor(item.x, item.z), weapon: item.kind, desiredWeapon: item.kind }), bladeTrail: [], weapon: item.kind, twoHanded: false, fallen: 0, stride: 0 }, palette);
            else if (item.kind === 'spear')
                this.drawSpear({ blade, scale: 1, bodyHeight: 0, jump: 0, crouch: 0, bodyRotation: 0, hip: point(0, 0), chest: point(0, 0), neck: point(0, 0), head: point(0, 0), headRadius: 0, frontShoulder: point(0, 0), rearShoulder: point(0, 0), frontHip: point(0, 0), rearHip: point(0, 0), frontKnee: point(0, 0), rearKnee: point(0, 0), frontFoot: point(0, 0), rearFoot: point(0, 0), frontElbow: point(0, 0), rearElbow: point(0, 0), frontHand: point(0, 0), rearHand: point(0, 0), supportHand: point(0, 0), frontArm: { root: point(0, 0), elbow: point(0, 0), end: point(0, 0), upperLength: 1, lowerLength: 1 }, rearArm: { root: point(0, 0), elbow: point(0, 0), end: point(0, 0), upperLength: 1, lowerLength: 1 }, attack: attackMotionFor({ ...emptyActor(item.x, item.z), weapon: item.kind, desiredWeapon: item.kind }), bladeTrail: [], weapon: item.kind, twoHanded: false, fallen: 0, stride: 0 }, palette);
            else
                this.drawBlade(blade, item.kind === 'longsword' ? 'longsword' : 'dussack', palette.steel, palette.leather, palette.accent);
        }
        context.restore();
    }
    drawActorBar(actor, pose, scale) {
        if (actor.maxHealth <= 0 || actor.health >= actor.maxHealth && actor.state === 'idle')
            return;
        const context = this.context;
        const width = actor.archetype === 'grotesque' ? 112 : 52;
        const y = actor.z - pose.jump * scale - BAR_LIFT[actor.archetype] * this.depthScale(actor.z) * pose.scale;
        const health = clamp(actor.health / actor.maxHealth, 0, 1);
        context.save();
        context.fillStyle = 'rgba(10,20,25,0.84)';
        context.fillRect(actor.x - width / 2 - 2, y - 2, width + 4, 8);
        context.fillStyle = '#b9463c';
        context.fillRect(actor.x - width / 2, y, width * health, 4);
        if (actor.maxArmor > 0 && actor.armor > 0) {
            context.fillStyle = '#b9c9c1';
            context.fillRect(actor.x - width / 2, y + 6, width * clamp(actor.armor / actor.maxArmor, 0, 1), 2);
        }
        context.restore();
    }
    drawOffscreenIndicators(snapshot, cameraX) {
        if (snapshot.exitOpen && levelExitX(snapshot.roadWidth) - cameraX > this.width - 32) {
            this.drawChevron(this.width - 18, 424, 1, '#f3d78b', 0.68 + Math.sin(snapshot.time * 5) * 0.24);
        }
        for (const enemy of snapshot.actors) {
            if (enemy.team !== 'enemies' || enemy.state === 'dead')
                continue;
            const screenX = enemy.x - cameraX;
            if (screenX >= 40 && screenX <= this.width - 40)
                continue;
            const right = screenX > this.width * 0.5;
            const x = right ? this.width - 24 : 24;
            const y = clamp(enemy.z - 60, 274, 634);
            this.drawChevron(x, y, right ? 1 : -1, '#df6652', 0.7 + Math.sin(snapshot.time * 4.6 + enemy.id) * 0.16);
        }
    }
    drawChevron(x, y, direction, color, alpha) {
        const context = this.context;
        context.save();
        context.globalAlpha = clamp(alpha, 0, 1);
        context.fillStyle = color;
        context.strokeStyle = '#14232a';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(x + direction * 13, y - 17);
        context.lineTo(x + direction * 13, y + 17);
        context.lineTo(x - direction * 14, y);
        context.closePath();
        context.fill();
        context.stroke();
        context.restore();
    }
    drawImpactMarks() {
        const context = this.context;
        for (const mark of this.impactMarks) {
            const progress = 1 - mark.life / mark.maxLife;
            const alpha = clamp(mark.life / mark.maxLife, 0, 1);
            const scale = 0.7 + progress * 0.75;
            context.save();
            context.translate(mark.x, mark.y);
            context.rotate(mark.angle);
            context.scale(scale, scale);
            context.globalAlpha = alpha;
            context.lineCap = 'square';
            if (mark.kind === 'parry') {
                context.strokeStyle = '#f8e39d';
                context.lineWidth = 5;
                context.beginPath();
                context.arc(0, 0, 30, 0, TAU);
                for (let ray = 0; ray < 8; ray += 1) {
                    const angle = ray / 8 * TAU;
                    context.moveTo(Math.cos(angle) * 34, Math.sin(angle) * 34);
                    context.lineTo(Math.cos(angle) * 50, Math.sin(angle) * 50);
                }
                context.stroke();
            }
            else if (mark.kind === 'interception') {
                context.strokeStyle = '#ecf2e7';
                context.lineWidth = 5;
                context.beginPath();
                context.moveTo(0, -40);
                context.lineTo(40, 0);
                context.lineTo(0, 40);
                context.lineTo(-40, 0);
                context.closePath();
                context.moveTo(-46, -15);
                context.lineTo(46, 15);
                context.moveTo(-46, 15);
                context.lineTo(46, -15);
                context.stroke();
            }
            else if (mark.kind === 'blocked') {
                context.strokeStyle = '#e8dfc1';
                context.lineWidth = 6;
                context.beginPath();
                context.arc(0, 4, 30, Math.PI * 0.22, Math.PI * 0.78);
                context.moveTo(0, -27);
                context.lineTo(0, 29);
                context.stroke();
            }
            else if (mark.kind === 'armor') {
                context.strokeStyle = '#d9eeec';
                context.lineWidth = 5;
                context.strokeRect(-27, -23, 54, 46);
                context.strokeStyle = '#789aa0';
                context.beginPath();
                context.moveTo(-38, -13);
                context.lineTo(38, 13);
                context.moveTo(-38, 13);
                context.lineTo(38, -13);
                context.stroke();
            }
            else if (mark.kind === 'guardbreak') {
                context.strokeStyle = '#efce7c';
                context.lineWidth = 6;
                context.beginPath();
                context.moveTo(-8, -43);
                context.lineTo(-32, -20);
                context.lineTo(-22, 6);
                context.moveTo(8, -43);
                context.lineTo(32, -20);
                context.lineTo(22, 6);
                context.stroke();
                context.strokeStyle = '#aa4240';
                context.lineWidth = 4;
                context.beginPath();
                context.moveTo(-5, -42);
                context.lineTo(7, -18);
                context.lineTo(-4, 7);
                context.lineTo(8, 36);
                context.stroke();
            }
            else {
                const radius = mark.kind === 'heavy' ? 31 : 24;
                context.fillStyle = '#fff1bd';
                context.beginPath();
                context.moveTo(0, -8);
                context.lineTo(8, 0);
                context.lineTo(0, 8);
                context.lineTo(-8, 0);
                context.closePath();
                context.fill();
                context.strokeStyle = mark.kind === 'heavy' ? '#eabf62' : '#f1dfba';
                context.lineWidth = mark.kind === 'heavy' ? 4 : 3;
                context.beginPath();
                context.moveTo(-radius, radius * 0.4);
                context.lineTo(radius, -radius * 0.4);
                context.moveTo(-radius * 0.35, -radius * 0.8);
                context.lineTo(radius * 0.45, radius * 0.72);
                context.stroke();
            }
            context.restore();
        }
    }
    drawParticles() {
        const context = this.context;
        for (const particle of this.particles) {
            context.save();
            context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
            context.fillStyle = particle.color;
            if (particle.shape === 'shard') {
                context.translate(particle.x, particle.y);
                context.rotate(Math.atan2(particle.vy, particle.vx));
                context.fillRect(-particle.size * 1.8, -particle.size * 0.55, particle.size * 3.6, particle.size * 1.1);
            }
            else if (particle.shape === 'ember') {
                context.shadowColor = particle.color;
                context.shadowBlur = particle.size * 3;
                context.beginPath();
                context.arc(particle.x, particle.y, particle.size, 0, TAU);
                context.fill();
            }
            else {
                context.beginPath();
                context.arc(particle.x, particle.y, particle.size, 0, TAU);
                context.fill();
            }
            context.restore();
        }
    }
    drawFloatingTexts() {
        const context = this.context;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const item of this.floatingTexts) {
            if (item.delay > 0)
                continue;
            context.save();
            context.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
            context.font = item.large ? '700 23px Georgia, serif' : '700 17px system-ui, sans-serif';
            context.lineWidth = 5;
            context.strokeStyle = 'rgba(14,25,30,0.92)';
            context.fillStyle = item.large ? '#f0d68b' : '#fff2ca';
            context.strokeText(item.text, item.x, item.y);
            context.fillText(item.text, item.x, item.y);
            context.restore();
        }
    }
    drawDebug(snapshot) {
        const context = this.context;
        context.save();
        context.strokeStyle = 'rgba(91,240,191,0.75)';
        for (const actor of snapshot.actors) {
            context.beginPath();
            context.arc(actor.x, actor.z, actor.radius, 0, TAU);
            context.stroke();
            if (!actor.attackId)
                continue;
            const definition = ATTACKS[actor.attackId];
            if (!definition)
                continue;
            context.strokeStyle = definition.arc === 'radial' ? 'rgba(240,117,91,0.84)' : 'rgba(239,190,82,0.84)';
            if (definition.arc === 'radial') {
                context.beginPath();
                context.arc(actor.x, actor.z, Math.max(definition.reach, definition.depth), 0, TAU);
                context.stroke();
            }
            else {
                const start = actor.x + definition.minForward * actor.facing;
                const end = actor.x + definition.reach * actor.facing;
                context.strokeRect(Math.min(start, end), actor.z - definition.depth, Math.abs(end - start), definition.depth * 2);
            }
        }
        context.fillStyle = 'rgba(10,19,25,0.72)';
        context.fillRect(12 - this.cameraOffsetX, 88, 182, 44);
        context.fillStyle = '#d9f8e8';
        context.font = '13px monospace';
        context.fillText(`tick ${snapshot.tick}`, 20 - this.cameraOffsetX, 106);
        context.fillText(`actors ${snapshot.actors.length}`, 20 - this.cameraOffsetX, 124);
        context.restore();
    }
    updateEffects(dt) {
        for (const particle of this.particles) {
            particle.life -= dt;
            particle.x += particle.vx * dt;
            particle.y += particle.vy * dt;
            particle.vy += particle.gravity * dt;
            particle.vx *= Math.exp(-2.1 * dt);
        }
        for (let index = this.particles.length - 1; index >= 0; index -= 1) {
            if ((this.particles[index]?.life ?? 0) <= 0)
                this.particles.splice(index, 1);
        }
        for (const item of this.floatingTexts) {
            if (item.delay > 0)
                item.delay = Math.max(0, item.delay - dt);
            else {
                item.life -= dt;
                item.y -= (item.large ? 28 : 46) * dt;
            }
        }
        for (let index = this.floatingTexts.length - 1; index >= 0; index -= 1) {
            if ((this.floatingTexts[index]?.life ?? 0) <= 0)
                this.floatingTexts.splice(index, 1);
        }
        for (const mark of this.impactMarks)
            mark.life -= dt;
        for (let index = this.impactMarks.length - 1; index >= 0; index -= 1) {
            if ((this.impactMarks[index]?.life ?? 0) <= 0)
                this.impactMarks.splice(index, 1);
        }
    }
    impactKind(event) {
        if (event.type === 'guardbreak')
            return 'guardbreak';
        if (event.type === 'parry')
            return 'parry';
        if (event.type === 'interception')
            return 'interception';
        if (event.type === 'blocked')
            return 'blocked';
        if (event.type === 'hit' || event.type === 'heavy-hit') {
            if (event.impact === 'armor')
                return 'armor';
            return event.type === 'heavy-hit' ? 'heavy' : 'flesh';
        }
        return null;
    }
    hitZoneOffset(hitZone) {
        if (hitZone === 'head')
            return -112;
        if (hitZone === 'legs')
            return -24;
        return -68;
    }
    crouchedContactOffset(hitZone, crouched) {
        if (!crouched)
            return 0;
        if (hitZone === 'legs')
            return 5;
        if (hitZone === 'torso')
            return 25;
        return 34;
    }
    depthScale(z) {
        return 0.86 + clamp((finite(z, 248) - 248) / 364, 0, 1) * 0.18;
    }
    jumpAmount(actor) {
        const pose = poseForActor(actor, actor.stateElapsed);
        return pose.jump * this.depthScale(actor.z);
    }
    palette(actor) {
        if (actor.archetype === 'meyer') {
            return actor.playerIndex === 1
                ? { body: '#2f5e73', bodyLight: '#4e8490', dark: '#172a35', accent: '#d8b66f', cream: '#e6d6b3', skin: '#d2a27f', skinShadow: '#9b6d58', steel: '#cfe2df', leather: '#4a302d' }
                : { body: '#913d45', bodyLight: '#b55c58', dark: '#261d26', accent: '#d9b76d', cream: '#ebddbe', skin: '#d5a481', skinShadow: '#9b6c55', steel: '#d5e6e1', leather: '#4d2d2b' };
        }
        if (actor.archetype === 'spear')
            return { body: '#65714d', bodyLight: '#899267', dark: '#233036', accent: '#c0a15c', cream: '#d5c69f', skin: '#bf8d69', skinShadow: '#805843', steel: '#c5d5d0', leather: '#47372b' };
        if (actor.archetype === 'captain')
            return { body: '#65757a', bodyLight: '#a4b3ae', dark: '#1d2d35', accent: '#bd9755', cream: '#d3d6c6', skin: '#c58f6d', skinShadow: '#835644', steel: '#d3e4dd', leather: '#41312d' };
        return { body: '#78533d', bodyLight: '#a4734d', dark: '#2a2427', accent: '#b99055', cream: '#d4c49c', skin: '#bf8968', skinShadow: '#7f5544', steel: '#bfd0c9', leather: '#4b3027' };
    }
    paletteForWeapon(weapon) {
        return weapon === 'spear'
            ? { body: '#65714d', bodyLight: '#899267', dark: '#233036', accent: '#c0a15c', cream: '#d5c69f', skin: '#bf8d69', skinShadow: '#805843', steel: '#c5d5d0', leather: '#47372b' }
            : weapon === 'club'
                ? { body: '#78533d', bodyLight: '#a4734d', dark: '#2a2427', accent: '#b99055', cream: '#d4c49c', skin: '#bf8968', skinShadow: '#7f5544', steel: '#bfd0c9', leather: '#4b3027' }
                : { body: '#913d45', bodyLight: '#b55c58', dark: '#261d26', accent: '#d9b76d', cream: '#ebddbe', skin: '#d5a481', skinShadow: '#9b6c55', steel: '#d5e6e1', leather: '#4d2d2b' };
    }
}
function finite(value, fallback) {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
}
function point(x, y) {
    return { x, y };
}
function add(left, right) {
    return { x: left.x + right.x, y: left.y + right.y };
}
function scale(value, amount) {
    return { x: value.x * amount, y: value.y * amount };
}
function emptyActor(x, z) {
    return {
        id: 0,
        team: 'players',
        archetype: 'meyer',
        name: '',
        playerIndex: 0,
        x,
        z,
        vx: 0,
        vz: 0,
        facing: 1,
        radius: 22,
        health: 1,
        maxHealth: 1,
        guard: 1,
        maxGuard: 1,
        armor: 0,
        maxArmor: 0,
        state: 'idle',
        stateElapsed: 0,
        stateDuration: 1,
        stateMoveX: 0,
        stateMoveZ: 0,
        weapon: 'longsword',
        desiredWeapon: 'longsword',
        stowedWeapon: 'dussack',
        durability: 0,
        attackId: null,
        attackElapsed: 0,
        reactionZone: null,
        invulnerable: 0,
        openingTimer: 0,
        provokeTimer: 0,
        counterWindow: 0,
        flashTimer: 0,
        comboCount: 0,
        deathTimer: 0
    };
}
function drawPath(context, points) {
    const first = points[0];
    if (!first)
        return;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const next of points.slice(1))
        context.lineTo(next.x, next.y);
    context.closePath();
}
//# sourceMappingURL=canvas-renderer.js.map