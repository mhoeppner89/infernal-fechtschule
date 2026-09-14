import { attackDuration, getAttack } from '../sim/attacks.js';
import { clamp } from '../sim/math.js';
import { animationTransitionSpec, sameAnimationFrame, SpriteAnimationCatalog } from './animation-catalog.js';
import { BackgroundCatalog } from './background-catalog.js';
export class CanvasRenderer {
    debug;
    width = 1280;
    height = 720;
    context;
    animations = new SpriteAnimationCatalog();
    backgrounds = new BackgroundCatalog();
    particles = [];
    floatingTexts = [];
    impactMarks = [];
    actorAnimationVisuals = new Map();
    backgroundWave = -1;
    previousBackgroundWave = -1;
    backgroundTransition = 1;
    shake = 0;
    constructor(canvas, debug = false) {
        this.debug = debug;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context)
            throw new Error('Canvas 2D is unavailable.');
        this.context = context;
        canvas.width = this.width;
        canvas.height = this.height;
        context.imageSmoothingEnabled = true;
        this.animations.preload();
        this.backgrounds.preload();
    }
    getAnimationReadiness() {
        return this.animations.getReadiness();
    }
    getBackgroundReadiness() {
        return this.backgrounds.readiness();
    }
    handle(event) {
        const x = event.x ?? this.width / 2;
        const y = event.z ?? this.height / 2;
        const contactY = y
            + this.hitZoneOffset(event.hitZone)
            + this.crouchedContactOffset(event.hitZone, event.targetCrouched === true);
        const impactKind = this.impactKind(event);
        if (impactKind) {
            const count = impactKind === 'guardbreak' ? 16
                : impactKind === 'parry' || impactKind === 'interception' ? 14
                    : impactKind === 'heavy' ? 10 : 7;
            const color = impactKind === 'parry' ? '#f3d778'
                : impactKind === 'interception' ? '#f0ead3'
                    : impactKind === 'blocked' ? '#d8d2b8'
                        : impactKind === 'armor' ? '#b8d1d4'
                            : impactKind === 'guardbreak' ? '#e7c37a' : '#b83a2f';
            const seedAngle = ((event.actorId ?? 1) * 1.37 + (event.targetId ?? 0) * 0.71) % (Math.PI * 2);
            for (let index = 0; index < count; index += 1) {
                const angle = seedAngle + index / count * Math.PI * 2;
                const variance = ((index * 47) % 13) / 12;
                const speed = 55 + variance * (impactKind === 'heavy' || impactKind === 'guardbreak' ? 155 : 105);
                const particleLife = impactKind === 'guardbreak'
                    ? 0.1 + variance * 0.16
                    : 0.07 + variance * 0.07;
                this.particles.push({
                    x,
                    y: contactY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 50,
                    life: particleLife,
                    maxLife: impactKind === 'guardbreak' ? 0.26 : 0.14,
                    size: 1.5 + variance * 3.2,
                    color,
                    gravity: 360
                });
            }
            const maxLife = impactKind === 'guardbreak' ? 0.26
                : impactKind === 'heavy' ? 0.13
                    : impactKind === 'parry' || impactKind === 'interception' ? 0.22 : 0.12;
            this.impactMarks.push({ x, y: contactY, life: maxLife, maxLife, kind: impactKind, angle: seedAngle * 0.17 });
            const shake = impactKind === 'guardbreak' ? 15
                : impactKind === 'heavy' ? 10
                    : impactKind === 'interception' ? 8
                        : impactKind === 'parry' ? 7
                            : impactKind === 'armor' ? 6 : 4;
            this.shake = Math.max(this.shake, shake);
        }
        if (event.type === 'boss-phase')
            this.shake = Math.max(this.shake, 15);
        if (event.type === 'death') {
            const deathSeed = ((event.actorId ?? 1) * 0.913 + (event.targetId ?? 0) * 0.371) % 1;
            for (let index = 0; index < 18; index += 1) {
                const angle = (deathSeed + index * 0.61803398875) * Math.PI * 2;
                const variance = ((index * 37 + (event.actorId ?? 0) * 11) % 19) / 18;
                this.particles.push({
                    x,
                    y: y - 35,
                    vx: Math.cos(angle) * (45 + variance * 95),
                    vy: -60 - Math.abs(Math.sin(angle)) * 140,
                    life: 0.45 + variance * 0.42,
                    maxLife: 0.88,
                    size: 3 + variance * 8,
                    color: '#211d1b',
                    gravity: 270
                });
            }
        }
        if (event.type === 'signature' && event.text) {
            this.floatingTexts.push({ x, y: y - 95, text: event.text, delay: 0, life: 0.32, maxLife: 0.32, large: true });
        }
        else if ((event.type === 'parry' || event.type === 'interception' || event.type === 'guardbreak') && event.text) {
            this.floatingTexts.push({ x, y: y - 82, text: event.text, delay: 0, life: 0.5, maxLife: 0.5, large: false });
        }
        else if ((event.type === 'hit' || event.type === 'heavy-hit') && event.amount) {
            // Show damage one rendered frame after the contact silhouette, then clear
            // it quickly so recovery reads as a distinct beat.
            this.floatingTexts.push({ x, y: contactY - 20, text: String(event.amount), delay: 1 / 30, life: 0.12, maxLife: 0.12, large: false });
        }
    }
    render(snapshot, dt) {
        this.updateEffects(dt);
        this.updateBackground(snapshot.waveIndex, dt);
        this.updateActorAnimationVisuals(snapshot.actors, dt);
        const context = this.context;
        const shakeX = this.shake > 0 ? Math.sin(snapshot.tick * 2.399) * this.shake * 0.5 : 0;
        const shakeY = this.shake > 0 ? Math.cos(snapshot.tick * 1.731) * this.shake * 0.275 : 0;
        this.shake = Math.max(0, this.shake - 48 * dt);
        context.save();
        context.translate(shakeX, shakeY);
        this.drawBackground(snapshot);
        this.drawPlayfieldFocus(snapshot);
        const sorted = [...snapshot.actors].sort((left, right) => left.z - right.z || left.id - right.id);
        for (const actor of sorted)
            this.drawShadow(actor);
        // During an attack, the local fighter is the subject of the frame. Drawing
        // that sprite last prevents same-depth targets from erasing the action.
        const attackingPlayers = sorted.filter((actor) => actor.team === 'players' && actor.state === 'attack');
        const drawOrder = attackingPlayers.length === 0
            ? sorted
            : [...sorted.filter((actor) => !attackingPlayers.includes(actor)), ...attackingPlayers];
        for (const actor of drawOrder)
            this.drawActor(actor);
        // The mark is deliberately compact, so it can sit above both silhouettes
        // and pinpoint the blade/body intersection without hiding either fighter.
        this.drawImpactMarks();
        this.drawParticles();
        this.drawFloatingTexts();
        if (this.debug)
            this.drawDebug(snapshot);
        context.restore();
    }
    drawBackground(snapshot) {
        const context = this.context;
        const image = this.backgrounds.resolve(this.backgroundWave);
        if (image) {
            const previous = this.backgrounds.resolve(this.previousBackgroundWave);
            if (previous && this.backgroundTransition < 1) {
                this.drawBackgroundImage(previous, snapshot.time, this.previousBackgroundWave, 1);
            }
            const eased = 1 - Math.pow(1 - this.backgroundTransition, 3);
            this.drawBackgroundImage(image, snapshot.time, this.backgroundWave, previous ? eased : 1);
            this.drawBackgroundAtmosphere(snapshot);
            context.strokeStyle = 'rgba(246,226,181,0.16)';
            context.lineWidth = 2;
            context.strokeRect(74, 232, 1132, 392);
            if (snapshot.bossPhase >= 1)
                this.drawInfernalCorruption(snapshot.bossPhase);
            return;
        }
        const gradient = context.createLinearGradient(0, 0, 0, this.height);
        gradient.addColorStop(0, snapshot.bossPhase >= 2 ? '#241c22' : '#6f5a45');
        gradient.addColorStop(0.42, snapshot.bossPhase >= 2 ? '#40302f' : '#ad9270');
        gradient.addColorStop(1, '#3b3029');
        context.fillStyle = gradient;
        context.fillRect(0, 0, this.width, this.height);
        // Fechtschule wall and timber frame.
        context.fillStyle = snapshot.bossPhase >= 2 ? '#332829' : '#bda581';
        context.fillRect(0, 72, this.width, 208);
        context.fillStyle = '#4d392d';
        context.fillRect(0, 68, this.width, 16);
        context.fillRect(0, 266, this.width, 18);
        for (let x = 40; x < this.width; x += 158) {
            context.fillRect(x, 70, 14, 214);
            context.save();
            context.translate(x + 7, 174);
            context.rotate(x % 316 === 40 ? -0.65 : 0.65);
            context.fillRect(-6, -118, 12, 236);
            context.restore();
        }
        // Practice targets and hall banners.
        for (const x of [178, 640, 1096]) {
            context.fillStyle = '#3a2b24';
            context.fillRect(x - 4, 135, 8, 126);
            context.beginPath();
            context.arc(x, 132, 26, 0, Math.PI * 2);
            context.fillStyle = '#8e7253';
            context.fill();
            context.strokeStyle = '#3b2a20';
            context.lineWidth = 5;
            context.stroke();
            context.beginPath();
            context.moveTo(x - 16, 116);
            context.lineTo(x + 16, 148);
            context.moveTo(x + 16, 116);
            context.lineTo(x - 16, 148);
            context.lineWidth = 3;
            context.stroke();
        }
        // Arena ground.
        const floor = context.createLinearGradient(0, 262, 0, this.height);
        floor.addColorStop(0, snapshot.bossPhase >= 2 ? '#4d3b39' : '#9a805f');
        floor.addColorStop(1, snapshot.bossPhase >= 2 ? '#201a1c' : '#4a3a30');
        context.fillStyle = floor;
        context.beginPath();
        context.moveTo(0, 248);
        context.lineTo(this.width, 248);
        context.lineTo(this.width, this.height);
        context.lineTo(0, this.height);
        context.closePath();
        context.fill();
        context.strokeStyle = snapshot.bossPhase >= 2 ? 'rgba(205,173,160,0.16)' : 'rgba(48,35,27,0.25)';
        context.lineWidth = 2;
        for (let z = 292; z < 700; z += 54) {
            context.beginPath();
            context.moveTo(0, z);
            context.lineTo(this.width, z);
            context.stroke();
        }
        for (let x = -320; x < 1600; x += 130) {
            context.beginPath();
            context.moveTo(640 + (x - 640) * 0.18, 248);
            context.lineTo(x, 720);
            context.stroke();
        }
        // Arena bounds.
        context.strokeStyle = 'rgba(235,217,174,0.32)';
        context.lineWidth = 3;
        context.strokeRect(74, 232, 1132, 392);
        if (snapshot.bossPhase >= 1)
            this.drawInfernalCorruption(snapshot.bossPhase);
    }
    drawPlayfieldFocus(snapshot) {
        const context = this.context;
        const player = snapshot.actors.find((actor) => actor.team === 'players' && actor.state !== 'dead');
        context.save();
        // Quiet the detailed scenery only where combat happens. The clear centre
        // around the player keeps the scene grounded without turning the floor into
        // a flat vignette.
        const band = context.createLinearGradient(0, 205, 0, this.height);
        band.addColorStop(0, 'rgba(13,10,11,0)');
        band.addColorStop(0.22, 'rgba(13,10,11,0.16)');
        band.addColorStop(1, 'rgba(13,10,11,0.2)');
        context.fillStyle = band;
        context.fillRect(0, 205, this.width, this.height - 205);
        if (player) {
            const focus = context.createRadialGradient(player.x, player.z - 48, 40, player.x, player.z - 48, 235);
            focus.addColorStop(0, 'rgba(0,0,0,0)');
            focus.addColorStop(0.52, 'rgba(0,0,0,0.025)');
            focus.addColorStop(1, 'rgba(7,5,6,0.13)');
            context.fillStyle = focus;
            context.fillRect(0, 205, this.width, this.height - 205);
        }
        context.restore();
    }
    drawBackgroundImage(image, time, waveIndex, alpha) {
        const context = this.context;
        const overscan = 12;
        const pan = Math.sin(time * 0.18 + waveIndex * 1.7) * 4;
        context.save();
        context.globalAlpha = alpha;
        context.drawImage(image, -overscan + pan, -overscan / 2, this.width + overscan * 2, this.height + overscan);
        context.restore();
    }
    drawBackgroundAtmosphere(snapshot) {
        const context = this.context;
        const time = snapshot.time;
        context.save();
        if (this.backgroundWave === 0 || this.backgroundWave === 2) {
            context.fillStyle = this.backgroundWave === 2 ? 'rgba(255,231,176,0.34)' : 'rgba(236,218,171,0.25)';
            for (let index = 0; index < 18; index += 1) {
                const x = (index * 173 + time * (7 + index % 3) * 4) % (this.width + 60) - 30;
                const y = 115 + (index * 97) % 430 + Math.sin(time * 0.7 + index) * 8;
                const size = 1 + index % 3;
                context.globalAlpha = 0.22 + (index % 4) * 0.06;
                context.fillRect(x, y, size, size);
            }
        }
        else if (this.backgroundWave === 1) {
            context.globalAlpha = 0.12;
            const mist = context.createLinearGradient(0, 0, this.width, 0);
            mist.addColorStop(0, 'rgba(220,224,214,0)');
            mist.addColorStop(0.45, 'rgba(220,224,214,0.78)');
            mist.addColorStop(1, 'rgba(220,224,214,0)');
            context.fillStyle = mist;
            const drift = Math.sin(time * 0.13) * 90;
            context.fillRect(-180 + drift, 210, this.width + 360, 105);
        }
        else if (this.backgroundWave === 3) {
            const lightning = Math.max(0, Math.sin(time * 0.72 - 1.1));
            if (lightning > 0.985) {
                context.globalAlpha = (lightning - 0.985) * 18;
                context.fillStyle = '#d9d9f1';
                context.fillRect(0, 0, this.width, this.height);
            }
            context.fillStyle = '#d66b38';
            for (let index = 0; index < 14; index += 1) {
                const x = (index * 211 + time * (11 + index % 4) * 7) % (this.width + 80) - 40;
                const y = 560 - ((time * 26 + index * 41) % 260);
                context.globalAlpha = 0.18 + (index % 3) * 0.1;
                context.beginPath();
                context.arc(x, y, 1.5 + index % 3, 0, Math.PI * 2);
                context.fill();
            }
        }
        context.restore();
    }
    updateBackground(waveIndex, dt) {
        const normalized = Math.max(0, Math.min(3, waveIndex));
        if (normalized !== this.backgroundWave) {
            this.previousBackgroundWave = this.backgroundWave;
            this.backgroundWave = normalized;
            this.backgroundTransition = this.previousBackgroundWave < 0 || dt === 0 ? 1 : 0;
        }
        else if (this.backgroundTransition < 1) {
            this.backgroundTransition = Math.min(1, this.backgroundTransition + dt / 0.55);
        }
    }
    drawInfernalCorruption(phase) {
        const context = this.context;
        context.save();
        context.globalAlpha = phase >= 2 ? 0.44 : 0.2;
        context.strokeStyle = '#171316';
        context.lineWidth = phase >= 2 ? 10 : 5;
        for (let index = 0; index < 8; index += 1) {
            const y = 250 + index * 58;
            context.beginPath();
            context.moveTo(index % 2 === 0 ? 0 : this.width, y);
            context.bezierCurveTo(260 + index * 24, y - 90, 850 - index * 31, y + 110, index % 2 === 0 ? this.width : 0, y + 20);
            context.stroke();
        }
        context.globalAlpha = phase >= 2 ? 0.18 : 0.08;
        context.fillStyle = '#080708';
        for (let index = 0; index < 45; index += 1) {
            const x = (index * 239) % this.width;
            const y = 270 + ((index * 137) % 420);
            context.beginPath();
            context.arc(x, y, 2 + (index % 6), 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
    }
    drawShadow(actor) {
        if (actor.state === 'dead' && actor.stateElapsed > 0.8)
            return;
        const context = this.context;
        const depthScale = this.depthScale(actor.z);
        const jump = this.jumpOffset(actor);
        context.save();
        context.globalAlpha = clamp(0.28 - jump / 420, 0.08, 0.28);
        context.fillStyle = '#171311';
        context.beginPath();
        context.ellipse(actor.x, actor.z + 16, actor.radius * 1.08 * depthScale, actor.radius * 0.34 * depthScale, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
    drawActor(actor) {
        const context = this.context;
        const scale = this.depthScale(actor.z) * (actor.archetype === 'grotesque' ? 1.18 : 1);
        const jump = this.jumpOffset(actor);
        const deathFade = actor.state === 'dead' ? clamp(1 - actor.stateElapsed / Math.max(0.01, actor.stateDuration), 0, 1) : 1;
        context.save();
        context.globalAlpha = deathFade;
        context.translate(actor.x, actor.z - jump);
        context.scale(actor.facing * scale, scale);
        const visual = this.actorAnimationVisuals.get(actor.id);
        const sprite = visual?.current ?? null;
        if (sprite) {
            if (visual?.previous && visual.transitionDuration > 0 && visual.previous.frame.cue !== 'contact') {
                const progress = clamp(visual.transitionElapsed / visual.transitionDuration, 0, 1);
                const trailAlpha = visual.previousOpacity * Math.pow(1 - progress, 2);
                if (trailAlpha > 0.005)
                    this.drawSpriteActor(actor, visual.previous, trailAlpha);
            }
            this.drawSpriteActor(actor, sprite);
        }
        else {
            context.rotate(this.actorLean(actor));
            if (actor.archetype === 'grotesque')
                this.drawGrotesque(actor);
            else if (actor.archetype === 'wretch')
                this.drawWretch(actor);
            else
                this.drawHumanoid(actor);
        }
        if (!sprite && actor.flashTimer > 0) {
            context.globalCompositeOperation = 'screen';
            context.globalAlpha = clamp(actor.flashTimer * 5, 0, 0.42);
            context.fillStyle = '#fff0c8';
            context.beginPath();
            context.ellipse(0, -42, actor.radius * 0.55, 35, 0, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
        if (actor.team === 'enemies' && (actor.archetype === 'captain' || actor.archetype === 'grotesque')) {
            this.drawEnemyBar(actor);
        }
    }
    drawSpriteActor(actor, resolved, opacity = 1) {
        const context = this.context;
        const { clip, image, scaleCorrection } = resolved;
        const height = clip.display.height * scaleCorrection;
        const width = image.naturalWidth / Math.max(1, image.naturalHeight) * height;
        const x = -width * clip.display.anchorX + clip.display.offsetX;
        const y = -height * clip.display.anchorY + clip.display.offsetY;
        const filters = [];
        if (actor.playerIndex === 1)
            filters.push('hue-rotate(176deg)', 'saturate(0.82)', 'brightness(1.05)');
        if (actor.flashTimer > 0) {
            filters.push('brightness(1.8)', 'saturate(0.28)', 'drop-shadow(0 0 4px rgba(255,244,205,0.98))');
        }
        if (actor.team === 'players') {
            // A restrained warm edge makes Meyer the visual anchor in busy melees.
            const flash = actor.flashTimer > 0 ? 6 : 3;
            filters.push(`drop-shadow(0 0 ${flash}px rgba(248,216,151,0.92))`);
        }
        const baseAlpha = context.globalAlpha;
        context.globalAlpha = baseAlpha * clamp(opacity, 0, 1);
        context.filter = filters.length > 0 ? filters.join(' ') : 'none';
        context.drawImage(image, x, y, width, height);
        context.filter = 'none';
        context.globalAlpha = baseAlpha;
    }
    updateActorAnimationVisuals(actors, dt) {
        const visibleIds = new Set();
        const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        for (const actor of actors) {
            visibleIds.add(actor.id);
            const resolved = this.animations.resolveActorFrame(actor);
            if (!resolved) {
                this.actorAnimationVisuals.delete(actor.id);
                continue;
            }
            const existing = this.actorAnimationVisuals.get(actor.id);
            if (!existing || existing.archetype !== actor.archetype || existing.team !== actor.team) {
                this.actorAnimationVisuals.set(actor.id, {
                    current: resolved,
                    previous: null,
                    transitionElapsed: 0,
                    transitionDuration: 0,
                    previousOpacity: 0,
                    archetype: actor.archetype,
                    team: actor.team
                });
                continue;
            }
            if (existing.previous) {
                existing.transitionElapsed += elapsed;
                if (existing.transitionElapsed >= existing.transitionDuration) {
                    existing.previous = null;
                    existing.transitionDuration = 0;
                    existing.previousOpacity = 0;
                }
            }
            const transition = animationTransitionSpec(existing.current, resolved);
            if (sameAnimationFrame(existing.current, resolved) && transition.duration <= 0) {
                // Scale calibration can settle while assets finish loading, so retain
                // the newest resolved metadata even when the authored key is unchanged.
                existing.current = resolved;
                continue;
            }
            existing.previous = transition.duration > 0 ? existing.current : null;
            existing.current = resolved;
            existing.transitionElapsed = 0;
            existing.transitionDuration = transition.duration;
            existing.previousOpacity = transition.previousOpacity;
        }
        for (const actorId of this.actorAnimationVisuals.keys()) {
            if (!visibleIds.has(actorId))
                this.actorAnimationVisuals.delete(actorId);
        }
    }
    drawHumanoid(actor) {
        const context = this.context;
        const palette = this.palette(actor);
        const attackPhase = this.attackMotion(actor);
        const stride = actor.state === 'move' ? Math.sin(actor.stateElapsed * 12) * 7 : 0;
        const crouch = actor.state === 'crouch' ? 30 : actor.state === 'block' ? 5 : 0;
        // Legs.
        context.strokeStyle = palette.dark;
        context.lineWidth = 9;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(-8, -18 + crouch);
        context.lineTo(-12 + stride, 17);
        context.moveTo(8, -18 + crouch);
        context.lineTo(13 - stride, 17);
        context.stroke();
        // Coat / torso.
        context.fillStyle = palette.body;
        context.beginPath();
        context.moveTo(-21, -74 + crouch);
        context.quadraticCurveTo(0, -89 + crouch, 22, -72 + crouch);
        context.lineTo(18, -18 + crouch);
        context.quadraticCurveTo(0, -7 + crouch, -18, -18 + crouch);
        context.closePath();
        context.fill();
        context.strokeStyle = palette.dark;
        context.lineWidth = 4;
        context.stroke();
        // Belt.
        context.strokeStyle = palette.accent;
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(-18, -37 + crouch);
        context.lineTo(18, -37 + crouch);
        context.stroke();
        // Head and cap/helmet.
        context.fillStyle = palette.skin;
        context.beginPath();
        context.arc(0, -96 + crouch, actor.archetype === 'captain' ? 15 : 13, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = palette.dark;
        context.lineWidth = 3;
        context.stroke();
        if (actor.archetype === 'captain') {
            context.fillStyle = '#73777a';
            context.beginPath();
            context.arc(0, -99 + crouch, 18, Math.PI, Math.PI * 2);
            context.lineTo(18, -95 + crouch);
            context.lineTo(-18, -95 + crouch);
            context.closePath();
            context.fill();
            this.drawShield(actor, attackPhase, crouch);
        }
        else if (actor.archetype === 'meyer') {
            context.fillStyle = palette.accent;
            context.beginPath();
            context.ellipse(-2, -108 + crouch, 23, 8, -0.08, 0, Math.PI * 2);
            context.fill();
            context.fillRect(-5, -111 + crouch, 26, 5);
        }
        else {
            context.fillStyle = palette.accent;
            context.beginPath();
            context.moveTo(-15, -104 + crouch);
            context.lineTo(14, -104 + crouch);
            context.lineTo(5, -118 + crouch);
            context.closePath();
            context.fill();
        }
        // Rear arm.
        context.strokeStyle = palette.body;
        context.lineWidth = 9;
        context.beginPath();
        context.moveTo(-13, -65 + crouch);
        context.lineTo(-30, -43 + crouch + attackPhase * 5);
        context.stroke();
        this.drawWeapon(actor, attackPhase, crouch, palette);
    }
    drawWeapon(actor, attackPhase, crouch, palette) {
        const context = this.context;
        let angle = -0.32;
        if (actor.state === 'block')
            angle = -1.08;
        if (actor.state === 'attack') {
            const thrust = actor.attackId?.includes('thrust') || actor.attackId === 'captain_bash';
            angle = thrust ? -0.05 + attackPhase * 0.08 : -1.85 + attackPhase * 2.65;
            if (actor.attackId?.includes('_hl'))
                angle = 1.05 - attackPhase * 2.05;
            if (actor.attackId?.includes('l2h') || actor.attackId?.includes('sweep'))
                angle = -2.3 + attackPhase * 4.2;
        }
        const handX = 15;
        const handY = -58 + crouch;
        context.save();
        context.translate(handX, handY);
        context.rotate(angle);
        // Weapon arm.
        context.strokeStyle = palette.body;
        context.lineWidth = 9;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(-26, 4);
        context.lineTo(4, 0);
        context.stroke();
        if (actor.archetype === 'thug') {
            context.strokeStyle = '#4b3426';
            context.lineWidth = 9;
            context.beginPath();
            context.moveTo(2, 0);
            context.lineTo(62, 0);
            context.stroke();
            context.fillStyle = '#2b221d';
            context.fillRect(46, -7, 24, 14);
        }
        else if (actor.archetype === 'spear') {
            context.strokeStyle = '#5d4129';
            context.lineWidth = 5;
            context.beginPath();
            context.moveTo(-20, 0);
            context.lineTo(120, 0);
            context.stroke();
            context.fillStyle = '#c8c2ad';
            context.beginPath();
            context.moveTo(120, 0);
            context.lineTo(98, -8);
            context.lineTo(98, 8);
            context.closePath();
            context.fill();
        }
        else if (actor.archetype === 'captain') {
            this.drawStraightSword(78, '#d5d0bc');
        }
        else if (actor.weapon === 'longsword') {
            this.drawStraightSword(94, '#e0ddcf');
        }
        else {
            this.drawDussack();
        }
        context.restore();
    }
    drawStraightSword(length, blade) {
        const context = this.context;
        context.strokeStyle = '#5a432f';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(-8, 0);
        context.lineTo(12, 0);
        context.stroke();
        context.strokeStyle = '#c1a86c';
        context.lineWidth = 5;
        context.beginPath();
        context.moveTo(8, -13);
        context.lineTo(8, 13);
        context.stroke();
        context.strokeStyle = blade;
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(10, 0);
        context.lineTo(length, 0);
        context.stroke();
        context.fillStyle = blade;
        context.beginPath();
        context.moveTo(length + 10, 0);
        context.lineTo(length - 2, -5);
        context.lineTo(length - 2, 5);
        context.closePath();
        context.fill();
    }
    drawDussack() {
        const context = this.context;
        context.strokeStyle = '#5a3928';
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(-5, 0);
        context.lineTo(14, 0);
        context.stroke();
        context.strokeStyle = '#d8d1bb';
        context.lineWidth = 8;
        context.beginPath();
        context.moveTo(12, 0);
        context.quadraticCurveTo(55, -4, 76, -21);
        context.stroke();
        context.fillStyle = '#d8d1bb';
        context.beginPath();
        context.moveTo(79, -23);
        context.lineTo(66, -18);
        context.lineTo(73, -9);
        context.closePath();
        context.fill();
        context.strokeStyle = '#b99051';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(5, 0, 13, -1.1, 1.1);
        context.stroke();
    }
    drawShield(actor, attackPhase, crouch) {
        const context = this.context;
        const forward = actor.state === 'block' ? 8 : actor.state === 'attack' ? attackPhase * 8 : 0;
        context.save();
        context.translate(18 + forward, -53 + crouch);
        context.fillStyle = '#765335';
        context.beginPath();
        context.ellipse(0, 0, 18, 25, 0.12, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#b7aa88';
        context.lineWidth = 4;
        context.stroke();
        context.fillStyle = '#838482';
        context.beginPath();
        context.arc(0, 0, 5, 0, Math.PI * 2);
        context.fill();
        context.restore();
    }
    drawWretch(actor) {
        const context = this.context;
        const pulse = 1 + Math.sin(actor.stateElapsed * 9) * 0.06;
        context.scale(pulse, 1 / pulse);
        context.fillStyle = '#171317';
        context.beginPath();
        context.moveTo(-20, -10);
        context.quadraticCurveTo(-28, -60, -8, -83);
        context.quadraticCurveTo(2, -101, 16, -80);
        context.quadraticCurveTo(30, -45, 18, -7);
        context.closePath();
        context.fill();
        context.fillStyle = '#d6c6a2';
        context.beginPath();
        context.arc(-4, -72, 3, 0, Math.PI * 2);
        context.arc(8, -72, 3, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#171317';
        context.lineWidth = 8;
        context.beginPath();
        context.moveTo(-14, -49);
        context.lineTo(-35, -24);
        context.moveTo(14, -49);
        context.lineTo(39, -18);
        context.stroke();
    }
    drawGrotesque(actor) {
        const context = this.context;
        const motion = this.attackMotion(actor);
        const pulse = 1 + Math.sin(actor.stateElapsed * 5) * 0.04;
        context.scale(pulse, 1 / pulse);
        context.fillStyle = '#211820';
        context.beginPath();
        context.ellipse(0, -62, 53, 64, 0, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#88704f';
        context.lineWidth = 7;
        context.stroke();
        context.fillStyle = '#c6ae78';
        context.beginPath();
        context.moveTo(-28, -96);
        context.lineTo(-9, -126);
        context.lineTo(-3, -94);
        context.moveTo(25, -96);
        context.lineTo(8, -128);
        context.lineTo(2, -94);
        context.fill();
        context.fillStyle = '#cbbd95';
        context.beginPath();
        context.arc(-16, -73, 7, 0, Math.PI * 2);
        context.arc(17, -73, 7, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#20151a';
        context.beginPath();
        context.arc(-16, -73, 3, 0, Math.PI * 2);
        context.arc(17, -73, 3, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = '#161116';
        context.lineWidth = 18;
        context.lineCap = 'round';
        const armSweep = actor.state === 'attack' ? (motion - 0.5) * 1.8 : 0;
        context.save();
        context.rotate(armSweep);
        context.beginPath();
        context.moveTo(-42, -70);
        context.lineTo(-87, -35);
        context.lineTo(-112, -10);
        context.stroke();
        context.restore();
        context.save();
        context.rotate(-armSweep);
        context.beginPath();
        context.moveTo(42, -70);
        context.lineTo(88, -34);
        context.lineTo(112, -7);
        context.stroke();
        context.restore();
        context.strokeStyle = '#88704f';
        context.lineWidth = 7;
        context.beginPath();
        context.moveTo(-38, -22);
        context.lineTo(-46, 20);
        context.moveTo(38, -22);
        context.lineTo(47, 20);
        context.stroke();
        // A broken chain slung across the bound body.
        context.strokeStyle = '#9b9282';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(-42, -54);
        context.quadraticCurveTo(0, -22, 44, -50);
        context.stroke();
        for (const link of [[-34, -44], [-16, -30], [4, -27], [24, -34], [38, -46]]) {
            context.beginPath();
            context.ellipse(link[0], link[1], 5, 7, 0.55, 0, Math.PI * 2);
            context.stroke();
        }
    }
    drawEnemyBar(actor) {
        const context = this.context;
        const width = actor.archetype === 'grotesque' ? 150 : 76;
        const y = actor.z - (actor.archetype === 'grotesque' ? 180 : 139) * this.depthScale(actor.z);
        context.save();
        context.fillStyle = 'rgba(20,15,14,0.78)';
        context.fillRect(actor.x - width / 2 - 2, y - 2, width + 4, 10);
        context.fillStyle = '#a43b31';
        context.fillRect(actor.x - width / 2, y, width * clamp(actor.health / actor.maxHealth, 0, 1), 6);
        if (actor.maxArmor > 0 && actor.armor > 0) {
            context.fillStyle = '#a9a994';
            context.fillRect(actor.x - width / 2, y + 9, width * clamp(actor.armor / actor.maxArmor, 0, 1), 3);
        }
        context.restore();
    }
    drawParticles() {
        const context = this.context;
        for (const particle of this.particles) {
            context.save();
            context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
            context.fillStyle = particle.color;
            context.beginPath();
            context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            context.fill();
            context.restore();
        }
    }
    drawImpactMarks() {
        const context = this.context;
        for (const mark of this.impactMarks) {
            const progress = 1 - mark.life / mark.maxLife;
            const alpha = clamp(mark.life / mark.maxLife, 0, 1);
            const scale = 0.72 + progress * 0.72;
            context.save();
            context.translate(mark.x, mark.y);
            context.rotate(mark.angle);
            context.scale(scale, scale);
            context.globalAlpha = alpha;
            context.lineCap = 'square';
            context.lineJoin = 'miter';
            if (mark.kind === 'flesh' || mark.kind === 'heavy') {
                const radius = mark.kind === 'heavy' ? 30 : 23;
                const core = mark.kind === 'heavy' ? 9 : 7;
                context.fillStyle = '#fff3c4';
                context.beginPath();
                context.moveTo(0, -core);
                context.lineTo(core, 0);
                context.lineTo(0, core);
                context.lineTo(-core, 0);
                context.closePath();
                context.fill();
                context.strokeStyle = mark.kind === 'heavy' ? '#f3d58b' : '#f2e3c2';
                context.lineWidth = mark.kind === 'heavy' ? 5 : 4;
                context.beginPath();
                context.moveTo(-radius, radius * 0.45);
                context.lineTo(radius, -radius * 0.45);
                context.moveTo(-radius * 0.42, -radius * 0.72);
                context.lineTo(radius * 0.38, radius * 0.68);
                context.stroke();
                if (mark.kind === 'heavy') {
                    context.strokeStyle = '#9e2f28';
                    context.lineWidth = 3;
                    context.beginPath();
                    for (let index = 0; index < 12; index += 1) {
                        const angle = index / 12 * Math.PI * 2;
                        const inner = index % 2 === 0 ? 12 : 18;
                        const outer = index % 2 === 0 ? 38 : 30;
                        context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
                        context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
                    }
                    context.stroke();
                }
            }
            else if (mark.kind === 'armor') {
                context.strokeStyle = '#e8f0e6';
                context.lineWidth = 6;
                context.strokeRect(-28, -24, 56, 48);
                context.strokeStyle = '#73949c';
                context.lineWidth = 4;
                for (const offset of [-16, 0, 16]) {
                    context.beginPath();
                    context.moveTo(-39, offset - 7);
                    context.lineTo(39, offset + 7);
                    context.stroke();
                }
            }
            else if (mark.kind === 'blocked') {
                context.strokeStyle = '#f1e5c7';
                context.lineWidth = 7;
                context.beginPath();
                context.moveTo(-30, -31);
                context.quadraticCurveTo(0, -43, 30, -31);
                context.lineTo(26, 12);
                context.quadraticCurveTo(0, 39, -26, 12);
                context.closePath();
                context.stroke();
                context.beginPath();
                context.moveTo(0, -28);
                context.lineTo(0, 24);
                context.stroke();
            }
            else if (mark.kind === 'parry') {
                context.strokeStyle = '#f8e39d';
                context.lineWidth = 6;
                context.beginPath();
                context.arc(0, 0, 34, 0, Math.PI * 2);
                context.moveTo(-39, -39);
                context.lineTo(39, 39);
                context.moveTo(39, -39);
                context.lineTo(-39, 39);
                context.stroke();
            }
            else if (mark.kind === 'interception') {
                context.strokeStyle = '#f4eee0';
                context.lineWidth = 6;
                context.beginPath();
                context.moveTo(0, -43);
                context.lineTo(43, 0);
                context.lineTo(0, 43);
                context.lineTo(-43, 0);
                context.closePath();
                context.moveTo(-52, -15);
                context.lineTo(52, 15);
                context.moveTo(-52, 15);
                context.lineTo(52, -15);
                context.stroke();
            }
            else {
                const split = 8 + progress * 25;
                context.strokeStyle = '#f3d58b';
                context.lineWidth = 7;
                context.beginPath();
                context.moveTo(-split, -35);
                context.lineTo(-split - 25, -18);
                context.lineTo(-split - 18, 22);
                context.lineTo(-split, 38);
                context.moveTo(split, -35);
                context.lineTo(split + 25, -18);
                context.lineTo(split + 18, 22);
                context.lineTo(split, 38);
                context.stroke();
                context.strokeStyle = '#9e2f28';
                context.lineWidth = 4;
                context.beginPath();
                context.moveTo(-5, -51);
                context.lineTo(6, -19);
                context.lineTo(-4, 2);
                context.lineTo(8, 36);
                context.stroke();
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
            const alpha = clamp(item.life / item.maxLife, 0, 1);
            context.save();
            context.globalAlpha = alpha;
            context.font = item.large ? '700 24px Georgia, serif' : '700 18px system-ui, sans-serif';
            context.lineWidth = 5;
            context.strokeStyle = 'rgba(27,20,18,0.9)';
            context.fillStyle = item.large ? '#f0d68b' : '#fff3cf';
            context.strokeText(item.text, item.x, item.y);
            context.fillText(item.text, item.x, item.y);
            context.restore();
        }
    }
    drawDebug(snapshot) {
        const context = this.context;
        context.save();
        context.strokeStyle = 'rgba(80,235,185,0.75)';
        context.fillStyle = 'rgba(10,15,14,0.72)';
        for (const actor of snapshot.actors) {
            context.beginPath();
            context.arc(actor.x, actor.z, actor.radius, 0, Math.PI * 2);
            context.stroke();
            const zoneWidths = {
                head: actor.radius * 0.72,
                torso: actor.radius * 0.98,
                legs: actor.radius * 0.88
            };
            for (const zone of ['head', 'torso', 'legs']) {
                const exposed = !(actor.state === 'crouch' && zone === 'head');
                const zoneY = actor.z + this.hitZoneOffset(zone);
                context.globalAlpha = exposed ? 0.82 : 0.2;
                context.strokeStyle = this.hitZoneColor(zone);
                context.strokeRect(actor.x - zoneWidths[zone], zoneY - 8, zoneWidths[zone] * 2, 16);
            }
            context.globalAlpha = 1;
            if (actor.attackId) {
                const definition = getAttack(actor.attackId);
                context.strokeStyle = this.hitZoneColor(definition.hitZone);
                if (definition.arc === 'radial') {
                    context.beginPath();
                    context.arc(actor.x, actor.z, Math.max(definition.reach, definition.depth), 0, Math.PI * 2);
                    context.stroke();
                }
                else {
                    const start = actor.x + definition.minForward * actor.facing;
                    const end = actor.x + definition.reach * actor.facing;
                    context.strokeRect(Math.min(start, end), actor.z - definition.depth, Math.abs(end - start), definition.depth * 2);
                }
                context.fillStyle = 'rgba(10,15,14,0.78)';
                context.fillRect(actor.x - 35, actor.z - 142, 70, 20);
                context.fillStyle = this.hitZoneColor(definition.hitZone);
                context.font = 'bold 12px monospace';
                context.textAlign = 'center';
                context.fillText(definition.hitZone.toUpperCase(), actor.x, actor.z - 128);
                context.textAlign = 'start';
                context.strokeStyle = 'rgba(80,235,185,0.75)';
            }
        }
        context.fillRect(12, 88, 176, 54);
        context.fillStyle = '#d9f8e8';
        context.font = '14px monospace';
        context.fillText(`tick ${snapshot.tick}`, 20, 108);
        context.fillText(`actors ${snapshot.actors.length}`, 20, 128);
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
            if (item.delay > 0) {
                item.delay = Math.max(0, item.delay - dt);
                continue;
            }
            item.life -= dt;
            item.y -= (item.large ? 28 : 44) * dt;
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
            return -94;
        if (hitZone === 'legs')
            return -20;
        return -54;
    }
    crouchedContactOffset(hitZone, crouched) {
        if (!crouched)
            return 0;
        // Feet keep the shared ground anchor while knees, torso, and head fold
        // downward. Zone marks follow that authored posture instead of floating at
        // standing height.
        if (hitZone === 'legs')
            return 4;
        if (hitZone === 'torso')
            return 24;
        return 30;
    }
    hitZoneColor(hitZone) {
        if (hitZone === 'head')
            return 'rgba(239,92,76,0.9)';
        if (hitZone === 'legs')
            return 'rgba(83,194,222,0.9)';
        return 'rgba(239,190,82,0.9)';
    }
    attackMotion(actor) {
        if (!actor.attackId)
            return 0;
        const definition = getAttack(actor.attackId);
        const duration = attackDuration(definition);
        const normalized = clamp(actor.attackElapsed / duration, 0, 1);
        const windupEnd = definition.startup / duration;
        const activeEnd = (definition.startup + definition.active) / duration;
        if (normalized < windupEnd)
            return normalized / Math.max(0.001, windupEnd) * 0.22;
        if (normalized < activeEnd)
            return 0.22 + (normalized - windupEnd) / Math.max(0.001, activeEnd - windupEnd) * 0.72;
        return 0.94 + (normalized - activeEnd) / Math.max(0.001, 1 - activeEnd) * 0.06;
    }
    actorLean(actor) {
        if (actor.state === 'hitstun' || actor.state === 'dead')
            return -actor.facing * 0.22;
        if (actor.state === 'dodge')
            return actor.facing * 0.18;
        if (actor.state === 'attack')
            return actor.facing * (this.attackMotion(actor) - 0.35) * 0.12;
        return 0;
    }
    jumpOffset(actor) {
        if (actor.state === 'jump') {
            const progress = clamp(actor.stateElapsed / Math.max(0.01, actor.stateDuration), 0, 1);
            return Math.sin(progress * Math.PI) * 72;
        }
        if (actor.attackId?.includes('_air_')) {
            const definition = getAttack(actor.attackId);
            const progress = clamp(actor.attackElapsed / attackDuration(definition), 0, 1);
            return Math.sin(progress * Math.PI) * 58;
        }
        return 0;
    }
    depthScale(z) {
        return 0.86 + clamp((z - 248) / 364, 0, 1) * 0.18;
    }
    palette(actor) {
        if (actor.archetype === 'meyer') {
            return actor.playerIndex === 1
                ? { body: '#35546c', dark: '#1e2830', accent: '#d1b46d', skin: '#d8b792' }
                : { body: '#783b35', dark: '#30201e', accent: '#d1b46d', skin: '#d8b792' };
        }
        if (actor.archetype === 'spear')
            return { body: '#6e7042', dark: '#302d22', accent: '#a58b4f', skin: '#c59d75' };
        if (actor.archetype === 'captain')
            return { body: '#6d7070', dark: '#2a2c2d', accent: '#9f7a43', skin: '#c2a17f' };
        return { body: '#725039', dark: '#2f251f', accent: '#9b6d42', skin: '#bf9670' };
    }
}
//# sourceMappingURL=canvas-renderer.js.map