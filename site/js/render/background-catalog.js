/**
 * The dressing for each place. A level names one of these and keeps it for every
 * wave inside it, so the scenery changes only when the journey crosses into a new
 * level — which is also the only moment the party walks out of a doorway.
 */
export const BACKGROUND_MANIFEST = Object.freeze({
    'cobbled-streets': Object.freeze({
        id: 'cobbled-streets',
        url: 'assets/art/backgrounds/cobbled-streets.webp',
        label: 'The Cobbled Streets'
    }),
    'town-gate': Object.freeze({
        id: 'town-gate',
        url: 'assets/art/backgrounds/town-gate.webp',
        label: 'The Town Gate'
    }),
    'sala-darmi': Object.freeze({
        id: 'sala-darmi',
        url: 'assets/art/backgrounds/sala-darmi.webp',
        label: 'The Sala d’Armi'
    }),
    castello: Object.freeze({
        id: 'castello',
        url: 'assets/art/backgrounds/castello.webp',
        label: 'The Castello'
    })
});
/** The places in campaign order, for anything that wants a stable index. */
export const SCENERY_ORDER = Object.freeze([
    'cobbled-streets',
    'town-gate',
    'sala-darmi',
    'castello'
]);
/** Where a place sits in that order, or -1 while no place is drawn yet. */
export function sceneryIndexOf(scenery) {
    return scenery ? SCENERY_ORDER.indexOf(scenery) : -1;
}
export class BackgroundCatalog {
    assets = new Map();
    constructor() {
        for (const spec of Object.values(BACKGROUND_MANIFEST)) {
            this.assets.set(spec.id, { spec, image: null, status: 'not-started' });
        }
    }
    preload() {
        const supportsImages = typeof Image !== 'undefined';
        for (const asset of this.assets.values()) {
            if (asset.status !== 'not-started')
                continue;
            if (!supportsImages) {
                asset.status = 'unsupported';
                continue;
            }
            const image = new Image();
            asset.image = image;
            asset.status = 'loading';
            image.decoding = 'async';
            image.addEventListener('load', () => {
                asset.status = image.naturalWidth > 0 && image.naturalHeight > 0 ? 'loaded' : 'failed';
            }, { once: true });
            image.addEventListener('error', () => {
                asset.status = 'failed';
            }, { once: true });
            image.src = asset.spec.url;
            if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0)
                asset.status = 'loaded';
        }
    }
    /** The drawn place, or null while its art has not arrived. */
    resolve(scenery) {
        if (!scenery)
            return null;
        const asset = this.assets.get(scenery);
        return asset?.status === 'loaded' ? asset.image : null;
    }
    readiness() {
        const assets = [...this.assets.values()];
        return {
            declared: assets.length,
            loaded: assets.filter((asset) => asset.status === 'loaded').length,
            pending: assets.filter((asset) => asset.status === 'not-started' || asset.status === 'loading').length,
            failed: assets.filter((asset) => asset.status === 'failed' || asset.status === 'unsupported').length
        };
    }
}
//# sourceMappingURL=background-catalog.js.map