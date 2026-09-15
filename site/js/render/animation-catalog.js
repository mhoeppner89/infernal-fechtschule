import { ATTACKS } from '../sim/attacks.js';
import { ANIMATION_MANIFEST, ANIMATION_TICKS_PER_SECOND, animationClipId } from './animation-manifest.js';
const NO_ANIMATION_TRANSITION = Object.freeze({
    duration: 0,
    previousOpacity: 0
});
const REACTION_STATES = new Set(['hitstun', 'guardbreak', 'dead']);
const LOCOMOTION_STATES = new Set(['idle', 'move', 'block']);
export function sameAnimationFrame(left, right) {
    return left.clip.id === right.clip.id && left.frameIndex === right.frameIndex;
}
/**
 * Returns the blend policy between two resolved poses. Contact poses and the
 * first frames of reactions cut in immediately, while locomotion and recovery
 * frames get at most one or two 60 Hz frames of restrained visual continuity.
 */
export function animationTransitionSpec(previous, next) {
    if (sameAnimationFrame(previous, next)) {
        // Image calibration can finish after an actor has already appeared. Treat
        // a meaningful metadata-only scale change as a tiny visual settle instead
        // of letting the silhouette pop between two browser image-load callbacks.
        // Small changes are intentionally ignored so loading the remaining clips
        // cannot leave a permanent shimmer on a stationary frame.
        const previousScale = Number.isFinite(previous.scaleCorrection) ? previous.scaleCorrection : 1;
        const nextScale = Number.isFinite(next.scaleCorrection) ? next.scaleCorrection : 1;
        return Math.abs(nextScale - previousScale) > 0.008
            ? { duration: 0.06, previousOpacity: 0.12 }
            : NO_ANIMATION_TRANSITION;
    }
    // A contact silhouette is gameplay information. Never leak it into startup
    // or weaken its first active frame with temporal blending.
    if (next.frame.cue === 'contact')
        return NO_ANIMATION_TRANSITION;
    // Do not leave the active contact silhouette hanging over recovery, hurt, or
    // the first anticipation pose of a linked combo. The timing-sized handoff
    // still prevents a visual pop, but the zero opacity keeps contact exclusive
    // to its authored active window.
    if (previous.frame.cue === 'contact') {
        return { duration: 0.014, previousOpacity: 0 };
    }
    const previousState = previous.clip.state;
    const nextState = next.clip.state;
    if (REACTION_STATES.has(previousState) || REACTION_STATES.has(nextState)) {
        // Reactions are readable beats, not long blends. The first hit frame is
        // still cut in above; this short tail only softens the return/knockdown.
        return { duration: 0.018, previousOpacity: 0.12 };
    }
    if (previousState === 'attack' && nextState === 'attack') {
        // Combo links need continuity, but a long trail would make fast dussack
        // chains feel like latency. A same-move phase change is shorter still.
        return previous.clip.id === next.clip.id
            ? { duration: 0.014, previousOpacity: 0.1 }
            : { duration: 0.024, previousOpacity: 0.16 };
    }
    if (previousState === 'attack' || nextState === 'attack') {
        return { duration: 0.024, previousOpacity: 0.14 };
    }
    if (previous.clip.id === next.clip.id && next.clip.playback === 'loop') {
        return nextState === 'move'
            ? { duration: 0.022, previousOpacity: 0.14 }
            : { duration: 0.026, previousOpacity: 0.13 };
    }
    if (LOCOMOTION_STATES.has(previousState) && LOCOMOTION_STATES.has(nextState)) {
        return { duration: 0.024, previousOpacity: 0.14 };
    }
    return { duration: 0.024, previousOpacity: 0.14 };
}
const MIN_SCALE_CORRECTION = 0.78;
const MAX_SCALE_CORRECTION = 1.55;
const MAX_EXPLICIT_SCALE_CORRECTION = 1.8;
/**
 * A small number of authored silhouettes collapse around a long weapon's
 * motion path. Keep the normal correction cap conservative, but explicitly
 * restore the measured body scale for those known clips instead of enlarging
 * every animation indiscriminately.
 */
const SCALE_CORRECTION_OVERRIDES = Object.freeze({
    'spear:default:spear_thrust': 1.748,
    'meyer:dussack:ds_dodge_l': 1.674
});
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1)
        return sorted[middle] ?? 0;
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
/** Uses a fuller pose as the clip reference so crouches do not inflate a whole move. */
function upperQuartile(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const position = (sorted.length - 1) * 0.75;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const lowerValue = sorted[lower] ?? 0;
    const upperValue = sorted[upper] ?? lowerValue;
    return lowerValue + (upperValue - lowerValue) * (position - lower);
}
/** Alpha-weighted body ink, excluding bright neutral blades and motion arcs. */
export function characterInkMass(pixels) {
    let mass = 0;
    for (let index = 0; index + 3 < pixels.length; index += 4) {
        const alpha = (pixels[index + 3] ?? 0) / 255;
        if (alpha <= 0.05)
            continue;
        const red = pixels[index] ?? 0;
        const green = pixels[index + 1] ?? 0;
        const blue = pixels[index + 2] ?? 0;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const saturation = maximum > 0 ? (maximum - minimum) / maximum : 0;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        if (luminance > 205 && saturation < 0.16)
            continue;
        mass += alpha;
    }
    return mass;
}
function positiveHold(frame) {
    return Math.max(1, Math.floor(frame.holdTicks));
}
function clipTick(clip, stateElapsed, stateDuration) {
    const totalTicks = clip.frames.reduce((sum, frame) => sum + positiveHold(frame), 0);
    const elapsed = Number.isFinite(stateElapsed) ? Math.max(0, stateElapsed) : 0;
    const duration = Number.isFinite(stateDuration) ? Math.max(0, stateDuration) : 0;
    if (clip.playback === 'loop') {
        return Math.floor(elapsed * ANIMATION_TICKS_PER_SECOND) % totalTicks;
    }
    if (duration > 0) {
        if (elapsed >= duration)
            return totalTicks - 1;
        return Math.min(totalTicks - 1, Math.floor((elapsed / duration) * totalTicks));
    }
    return Math.min(totalTicks - 1, Math.floor(elapsed * ANIMATION_TICKS_PER_SECOND));
}
/** Pure frame selection helper; useful for deterministic tests and renderers. */
export function animationFrameIndex(clip, stateElapsed, stateDuration) {
    let remaining = clipTick(clip, stateElapsed, stateDuration);
    for (let index = 0; index < clip.frames.length; index += 1) {
        const frame = clip.frames[index];
        if (!frame)
            continue;
        const hold = positiveHold(frame);
        if (remaining < hold)
            return index;
        remaining -= hold;
    }
    return clip.frames.length - 1;
}
function frameFromCueGroup(clip, indices, phaseProgress) {
    if (indices.length === 0)
        return 0;
    const totalTicks = indices.reduce((sum, index) => sum + positiveHold(clip.frames[index] ?? clip.frames[0]), 0);
    let remaining = Math.min(totalTicks - 1, Math.floor(Math.max(0, Math.min(0.999999, phaseProgress)) * totalTicks));
    for (const index of indices) {
        const frame = clip.frames[index];
        if (!frame)
            continue;
        const hold = positiveHold(frame);
        if (remaining < hold)
            return index;
        remaining -= hold;
    }
    return indices[indices.length - 1] ?? 0;
}
/** Aligns authored anticipation/contact/recovery keys to the real hit windows. */
export function attackAnimationFrameIndex(clip, attackId, elapsed) {
    const definition = ATTACKS[attackId];
    if (!definition)
        return animationFrameIndex(clip, elapsed, 0);
    const anticipation = clip.frames
        .map((frame, index) => frame.cue === 'anticipation' ? index : -1)
        .filter((index) => index >= 0);
    const contact = clip.frames
        .map((frame, index) => frame.cue === 'contact' ? index : -1)
        .filter((index) => index >= 0);
    const finalContactIndex = contact[contact.length - 1] ?? -1;
    const recovery = clip.frames
        .map((frame, index) => (frame.cue === 'overshoot'
        || frame.cue === 'recovery'
        // Fixed-rig attacks carry a final authored neutral bookend. It belongs
        // to recovery playback, while the identical opening neutral is skipped
        // so accepted input still produces an immediate anticipation pose.
        || (frame.cue === 'neutral' && index > finalContactIndex)) ? index : -1)
        .filter((index) => index >= 0);
    if (elapsed < definition.startup) {
        return frameFromCueGroup(clip, anticipation, definition.startup > 0 ? elapsed / definition.startup : 1);
    }
    const activeEnd = definition.startup + definition.active;
    if (elapsed < activeEnd) {
        return frameFromCueGroup(clip, contact, definition.active > 0 ? (elapsed - definition.startup) / definition.active : 1);
    }
    return frameFromCueGroup(clip, recovery, definition.recovery > 0 ? (elapsed - activeEnd) / definition.recovery : 1);
}
function actorLookup(actor) {
    const weapon = actor.archetype === 'meyer'
        ? actor.state === 'switch' ? actor.desiredWeapon : actor.weapon
        : null;
    return {
        archetype: actor.archetype,
        weapon,
        state: actor.state,
        attackId: actor.state === 'attack' ? actor.attackId : null,
        variant: actor.state === 'hitstun' ? actor.reactionZone : null
    };
}
export class SpriteAnimationCatalog {
    clips = new Map();
    assets = new Map();
    clipScaleCorrections = new Map();
    constructor(manifest = ANIMATION_MANIFEST) {
        for (const clip of manifest) {
            if (this.clips.has(clip.id))
                throw new Error(`Duplicate animation clip id: ${clip.id}`);
            this.clips.set(clip.id, clip);
            if (clip.availability === 'ready') {
                if (clip.display.fixedScale)
                    this.clipScaleCorrections.set(clip.id, 1);
                for (const frame of clip.frames) {
                    if (!this.assets.has(frame.url)) {
                        this.assets.set(frame.url, {
                            url: frame.url,
                            status: 'not-started',
                            image: null,
                            error: null,
                            inkMass: null
                        });
                    }
                }
            }
        }
    }
    /** Starts browser image requests immediately. Safe and idempotent outside the browser. */
    preload() {
        const supportsImages = typeof Image !== 'undefined';
        for (const asset of this.assets.values()) {
            if (asset.status !== 'not-started')
                continue;
            if (!supportsImages) {
                asset.status = 'unsupported';
                asset.error = 'HTMLImageElement is unavailable in this environment.';
                continue;
            }
            const image = new Image();
            asset.image = image;
            asset.status = 'loading';
            image.decoding = 'async';
            image.addEventListener('load', () => {
                this.finishAssetLoad(asset, image);
            }, { once: true });
            image.addEventListener('error', () => {
                asset.status = 'failed';
                asset.error = `Could not load ${asset.url}`;
                this.recalibrateScaleCorrections();
            }, { once: true });
            image.src = asset.url;
            if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
                this.finishAssetLoad(asset, image);
            }
        }
    }
    lookup(query) {
        const id = animationClipId(query.archetype, query.weapon, query.state, query.attackId, query.variant ?? null);
        return this.clips.get(id) ?? null;
    }
    lookupActor(actor) {
        const query = actorLookup(actor);
        const preferred = this.lookup(query);
        if (preferred || !query.variant)
            return preferred;
        // Zone variants are authored for Meyer and every NPC archetype now; the
        // generic-hitstun fallback remains as a safety net if an asset or zone is ever missing.
        return this.lookup({ ...query, variant: null });
    }
    /**
     * Resolves one authored pose directly by index, independent of playback
     * timing. QA inspection tools use this so every authored pose is visible
     * even when attack-window mapping would legitimately skip it (the leading
     * neutral bookend is never shown during live attack playback).
     */
    resolveFrameByIndex(clip, frameIndex) {
        const frame = clip.frames[frameIndex];
        if (!frame)
            return null;
        const asset = this.assets.get(frame.url);
        if (!asset || asset.status !== 'loaded' || !asset.image)
            return null;
        return {
            clip,
            frame,
            frameIndex,
            image: asset.image,
            scaleCorrection: this.clipScaleCorrections.get(clip.id) ?? 1
        };
    }
    /** Returns null for planned, pending, failed, or undeclared clips so procedural fallback remains safe. */
    resolveActorFrame(actor) {
        const clip = this.lookupActor(actor);
        if (!clip || clip.availability !== 'ready')
            return null;
        const loopOffset = actor.team === 'enemies' && clip.playback === 'loop'
            ? ((actor.id * 5) % 11) / ANIMATION_TICKS_PER_SECOND
            : 0;
        const frameIndex = actor.state === 'attack' && actor.attackId
            ? attackAnimationFrameIndex(clip, actor.attackId, actor.attackElapsed)
            : animationFrameIndex(clip, actor.stateElapsed + loopOffset, actor.stateDuration);
        const frame = clip.frames[frameIndex];
        if (!frame)
            return null;
        const asset = this.assets.get(frame.url);
        if (!asset || asset.status !== 'loaded' || !asset.image)
            return null;
        return {
            clip,
            frame,
            frameIndex,
            image: asset.image,
            scaleCorrection: this.clipScaleCorrections.get(clip.id) ?? 1
        };
    }
    getReadiness() {
        const clips = [...this.clips.values()];
        const assets = [...this.assets.values()];
        const failures = assets
            .filter((asset) => asset.status === 'failed' || asset.status === 'unsupported')
            .map((asset) => ({ url: asset.url, error: asset.error ?? 'Unknown image load failure.' }));
        const corrections = [...this.clipScaleCorrections.values()];
        const unnormalizedClipIds = clips
            .filter((clip) => clip.availability === 'ready' && !this.clipScaleCorrections.has(clip.id))
            .map((clip) => clip.id);
        return {
            declaredClips: clips.length,
            readyClips: clips.filter((clip) => clip.availability === 'ready').length,
            plannedClips: clips.filter((clip) => clip.availability === 'planned').length,
            declaredAssets: assets.length,
            loadedAssets: assets.filter((asset) => asset.status === 'loaded').length,
            pendingAssets: assets.filter((asset) => asset.status === 'not-started' || asset.status === 'loading').length,
            failedAssets: assets.filter((asset) => asset.status === 'failed').length,
            unsupportedAssets: assets.filter((asset) => asset.status === 'unsupported').length,
            normalizedClips: corrections.length,
            unnormalizedClipIds,
            minScaleCorrection: corrections.length > 0 ? Math.min(...corrections) : 1,
            maxScaleCorrection: corrections.length > 0 ? Math.max(...corrections) : 1,
            failures
        };
    }
    finishAssetLoad(asset, image) {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            asset.status = 'failed';
            asset.error = 'Image loaded without drawable dimensions.';
            asset.inkMass = null;
            this.recalibrateScaleCorrections();
            return;
        }
        asset.status = 'loaded';
        asset.error = null;
        if (asset.inkMass === null)
            asset.inkMass = this.measureInkMass(image);
        this.recalibrateScaleCorrections();
    }
    measureInkMass(image) {
        if (typeof document === 'undefined')
            return null;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context)
                return null;
            context.drawImage(image, 0, 0);
            return characterInkMass(context.getImageData(0, 0, canvas.width, canvas.height).data);
        }
        catch {
            return null;
        }
    }
    recalibrateScaleCorrections() {
        const ready = [...this.clips.values()].filter((clip) => clip.availability === 'ready');
        const referenceMasses = new Map();
        for (const clip of ready) {
            if (clip.state !== 'idle')
                continue;
            const masses = clip.frames
                .map((frame) => this.assets.get(frame.url)?.inkMass ?? null)
                .filter((mass) => mass !== null && mass > 0);
            if (masses.length !== clip.frames.length)
                continue;
            const group = referenceMasses.get(clip.archetype) ?? [];
            group.push(...masses);
            referenceMasses.set(clip.archetype, group);
        }
        const targets = new Map();
        for (const [archetype, masses] of referenceMasses) {
            targets.set(archetype, median(masses));
        }
        for (const clip of ready) {
            if (clip.display.fixedScale) {
                this.clipScaleCorrections.set(clip.id, 1);
                continue;
            }
            const target = targets.get(clip.archetype);
            if (!target)
                continue;
            const masses = clip.frames
                .map((frame) => this.assets.get(frame.url)?.inkMass ?? null)
                .filter((mass) => mass !== null && mass > 0);
            if (masses.length !== clip.frames.length)
                continue;
            const rawCorrection = Math.sqrt(target / Math.max(1, upperQuartile(masses)));
            const override = SCALE_CORRECTION_OVERRIDES[clip.id];
            const correction = override === undefined
                ? Math.min(MAX_SCALE_CORRECTION, Math.max(MIN_SCALE_CORRECTION, rawCorrection))
                : Math.min(MAX_EXPLICIT_SCALE_CORRECTION, Math.max(MIN_SCALE_CORRECTION, override));
            this.clipScaleCorrections.set(clip.id, correction);
        }
    }
}
//# sourceMappingURL=animation-catalog.js.map