import { attackDuration, getAttack } from '../sim/attacks.js';
import { clamp } from '../sim/math.js';
export class CanvasRenderer {
    debug;
    width = 1280;
    height = 720;
    context;
    particles = [];
    floatingTexts = [];
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
    }
    handle(event) {
        const x = event.x ?? this.width / 2;
        const y = event.z ?? this.height / 2;
        if (event.type === 'hit' || event.type === 'heavy-hit' || event.type === 'parry' || event.type === 'blocked') {
            const count = event.type === 'parry' ? 18 : event.type === 'heavy-hit' ? 14 : 8;
            const color = event.type === 'parry' ? '#f3d778' : event.type === 'blocked' ? '#d8d2b8' : '#b83a2f';
            for (let index = 0; index < count; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 70 + Math.random() * (event.type === 'heavy-hit' ? 210 : 140);
                this.particles.push({
                    x,
                    y: y - 42,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 50,
                    life: 0.22 + Math.random() * 0.28,
                    maxLife: 0.48,
                    size: 2 + Math.random() * 4,
                    color,
                    gravity: 360
                });
            }
            this.shake = Math.max(this.shake, event.type === 'heavy-hit' ? 10 : event.type === 'parry' ? 7 : 4);
        }
        if (event.type === 'guardbreak' || event.type === 'boss-phase')
            this.shake = Math.max(this.shake, 15);
        if (event.type === 'death') {
            for (let index = 0; index < 18; index += 1) {
                this.particles.push({
                    x,
                    y: y - 35,
                    vx: (Math.random() - 0.5) * 180,
                    vy: -60 - Math.random() * 140,
                    life: 0.45 + Math.random() * 0.42,
                    maxLife: 0.88,
                    size: 3 + Math.random() * 8,
                    color: '#211d1b',
                    gravity: 270
                });
            }
        }
        if (event.type === 'signature' && event.text) {
            this.floatingTexts.push({ x, y: y - 95, text: event.text, life: 1.0, maxLife: 1.0, large: true });
        }
        else if ((event.type === 'parry' || event.type === 'guardbreak') && event.text) {
            this.floatingTexts.push({ x, y: y - 82, text: event.text, life: 0.75, maxLife: 0.75, large: false });
        }
        else if ((event.type === 'hit' || event.type === 'heavy-hit') && event.amount) {
            this.floatingTexts.push({ x, y: y - 62, text: String(event.amount), life: 0.52, maxLife: 0.52, large: false });
        }
    }
    render(snapshot, dt) {
        this.updateEffects(dt);
        const context = this.context;
        const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
        const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.55 : 0;
        this.shake = Math.max(0, this.shake - 48 * dt);
        context.save();
        context.translate(shakeX, shakeY);
        this.drawBackground(snapshot);
        const sorted = [...snapshot.actors].sort((left, right) => left.z - right.z || left.id - right.id);
        for (const actor of sorted)
            this.drawShadow(actor);
        for (const actor of sorted)
            this.drawActor(actor);
        this.drawParticles();
        this.drawFloatingTexts();
        if (this.debug)
            this.drawDebug(snapshot);
        context.restore();
    }
    drawBackground(snapshot) {
        const context = this.context;
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
        const lean = this.actorLean(actor);
        context.rotate(lean);
        if (actor.archetype === 'grotesque')
            this.drawGrotesque(actor);
        else if (actor.archetype === 'wretch')
            this.drawWretch(actor);
        else
            this.drawHumanoid(actor);
        if (actor.flashTimer > 0) {
            context.globalCompositeOperation = 'screen';
            context.globalAlpha = clamp(actor.flashTimer * 8, 0, 0.8);
            context.fillStyle = '#fff8e6';
            context.beginPath();
            context.ellipse(0, -40, actor.radius * 0.8, 49, 0, 0, Math.PI * 2);
            context.fill();
        }
        context.restore();
        if (actor.team === 'enemies' && (actor.archetype === 'captain' || actor.archetype === 'grotesque')) {
            this.drawEnemyBar(actor);
        }
    }
    drawHumanoid(actor) {
        const context = this.context;
        const palette = this.palette(actor);
        const attackPhase = this.attackMotion(actor);
        const stride = actor.state === 'move' ? Math.sin(actor.stateElapsed * 12) * 7 : 0;
        const crouch = actor.state === 'block' ? 5 : 0;
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
    drawFloatingTexts() {
        const context = this.context;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        for (const item of this.floatingTexts) {
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
            if (actor.attackId) {
                const definition = getAttack(actor.attackId);
                context.strokeStyle = 'rgba(244,100,80,0.7)';
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
            item.life -= dt;
            item.y -= (item.large ? 28 : 44) * dt;
        }
        for (let index = this.floatingTexts.length - 1; index >= 0; index -= 1) {
            if ((this.floatingTexts[index]?.life ?? 0) <= 0)
                this.floatingTexts.splice(index, 1);
        }
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