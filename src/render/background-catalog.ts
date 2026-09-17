import type { SceneryId } from '../sim/types.js';

export type BackgroundLayerOrder = 'back' | 'front';

export interface BackgroundLayerSpec {
  readonly id: string;
  readonly url: string;
  /** How much of camera motion this distance plane inherits. */
  readonly parallax: number;
  readonly drawWidth: number;
  readonly drawHeight: number;
  readonly y: number;
  /** Initial x alignment before the camera starts moving the layer. */
  readonly originX: number;
  readonly order: BackgroundLayerOrder;
}

export interface RoadSpec {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly repeatX: boolean;
}

export interface BackgroundSpec {
  readonly id: SceneryId;
  /** Kept as the scene's representative/far art for existing tooling. */
  readonly url: string;
  readonly label: string;
  readonly layers: readonly BackgroundLayerSpec[];
  readonly road: RoadSpec | null;
}

const legacyBackground = (id: SceneryId, url: string, label: string): BackgroundSpec => Object.freeze({
  id,
  url,
  label,
  layers: Object.freeze([Object.freeze({
    id: 'full',
    url,
    parallax: 0.35,
    drawWidth: 1920,
    drawHeight: 1080,
    y: -24,
    originX: 0,
    order: 'back' as const
  })]),
  road: null
});

/**
 * A place is assembled from distance planes. The street pass is intentionally
 * the only scene with the new split art for now; the other places retain their
 * working backdrop until their own art pass is approved.
 */
export const BACKGROUND_MANIFEST: Readonly<Record<SceneryId, BackgroundSpec>> = Object.freeze({
  'cobbled-streets': Object.freeze({
    id: 'cobbled-streets',
    url: 'assets/art/backgrounds/cobbled-streets-far.webp',
    label: 'The Cobbled Streets',
    layers: Object.freeze([
      Object.freeze({
        id: 'far',
        url: 'assets/art/backgrounds/cobbled-streets-far.webp',
        parallax: 0.15,
        drawWidth: 1536,
        drawHeight: 360,
        y: 0,
        originX: -128,
        order: 'back' as const
      }),
      Object.freeze({
        id: 'middle',
        url: 'assets/art/backgrounds/cobbled-streets-middle.webp',
        parallax: 0.42,
        drawWidth: 2304,
        drawHeight: 360,
        y: 0,
        originX: -512,
        order: 'back' as const
      }),
      Object.freeze({
        id: 'front',
        url: 'assets/art/backgrounds/cobbled-streets-front.webp',
        parallax: 0.7,
        drawWidth: 2560,
        drawHeight: 360,
        y: 0,
        originX: -640,
        order: 'front' as const
      })
    ]),
    road: Object.freeze({
      url: 'assets/art/backgrounds/cobbled-streets-road.webp',
      width: 2172,
      height: 724,
      repeatX: false
    })
  }),
  'town-gate': legacyBackground(
    'town-gate',
    'assets/art/backgrounds/town-gate.webp',
    'The Town Gate'
  ),
  'sala-darmi': legacyBackground(
    'sala-darmi',
    'assets/art/backgrounds/sala-darmi.webp',
    'The Sala d’Armi'
  ),
  castello: legacyBackground(
    'castello',
    'assets/art/backgrounds/castello.webp',
    'The Castello'
  )
});

/** The places in campaign order, for anything that wants a stable index. */
export const SCENERY_ORDER: readonly SceneryId[] = Object.freeze([
  'cobbled-streets',
  'town-gate',
  'sala-darmi',
  'castello'
]);

/** Where a place sits in that order, or -1 while no place is drawn yet. */
export function sceneryIndexOf(scenery: SceneryId | null | undefined): number {
  return scenery ? SCENERY_ORDER.indexOf(scenery) : -1;
}

interface ImageAsset {
  image: HTMLImageElement | null;
  status: 'not-started' | 'loading' | 'loaded' | 'failed' | 'unsupported';
}

interface BackgroundAsset {
  readonly spec: BackgroundSpec;
  readonly layers: Map<string, ImageAsset>;
  readonly road: ImageAsset | null;
}

export interface ResolvedBackgroundLayer {
  readonly spec: BackgroundLayerSpec;
  readonly image: HTMLImageElement;
}

export interface ResolvedRoad {
  readonly spec: RoadSpec;
  readonly image: HTMLImageElement;
}

export interface BackgroundReadinessReport {
  readonly declared: number;
  readonly loaded: number;
  readonly pending: number;
  readonly failed: number;
}

export class BackgroundCatalog {
  private readonly assets = new Map<SceneryId, BackgroundAsset>();

  constructor() {
    for (const spec of Object.values(BACKGROUND_MANIFEST)) {
      const layers = new Map<string, ImageAsset>();
      for (const layer of spec.layers) layers.set(layer.id, this.emptyImageAsset());
      this.assets.set(spec.id, {
        spec,
        layers,
        road: spec.road ? this.emptyImageAsset() : null
      });
    }
  }

  preload(): void {
    const supportsImages = typeof Image !== 'undefined';
    for (const asset of this.assets.values()) {
      for (const layer of asset.spec.layers) {
        const imageAsset = asset.layers.get(layer.id);
        if (imageAsset) this.preloadImage(imageAsset, layer.url, supportsImages);
      }
      if (asset.spec.road && asset.road) {
        this.preloadImage(asset.road, asset.spec.road.url, supportsImages);
      }
    }
  }

  /** The first/far drawn place, or null while its art has not arrived. */
  resolve(scenery: SceneryId | null | undefined): HTMLImageElement | null {
    return this.resolveLayers(scenery, 'back')[0]?.image ?? null;
  }

  resolveLayers(
    scenery: SceneryId | null | undefined,
    order: BackgroundLayerOrder
  ): ResolvedBackgroundLayer[] {
    if (!scenery) return [];
    const asset = this.assets.get(scenery);
    if (!asset) return [];
    const resolved: ResolvedBackgroundLayer[] = [];
    for (const spec of asset.spec.layers) {
      if (spec.order !== order) continue;
      const imageAsset = asset.layers.get(spec.id);
      const image = imageAsset?.status === 'loaded' ? imageAsset.image : null;
      if (image) resolved.push({ spec, image });
    }
    return resolved;
  }

  hasLayerSet(scenery: SceneryId | null | undefined, order: BackgroundLayerOrder): boolean {
    if (!scenery) return false;
    return this.assets.get(scenery)?.spec.layers.some((layer) => layer.order === order) ?? false;
  }

  resolveRoad(scenery: SceneryId | null | undefined): ResolvedRoad | null {
    if (!scenery) return null;
    const asset = this.assets.get(scenery);
    const road = asset?.road;
    if (!asset?.spec.road || road?.status !== 'loaded' || !road.image) return null;
    return { spec: asset.spec.road, image: road.image };
  }

  readiness(): BackgroundReadinessReport {
    let loaded = 0;
    let pending = 0;
    let failed = 0;
    for (const asset of this.assets.values()) {
      const images = [
        ...asset.layers.values(),
        ...(asset.road ? [asset.road] : [])
      ];
      if (images.every((image) => image.status === 'loaded')) {
        loaded += 1;
      } else if (images.some((image) => image.status === 'failed' || image.status === 'unsupported')) {
        failed += 1;
      } else {
        pending += 1;
      }
    }
    return { declared: this.assets.size, loaded, pending, failed };
  }

  private emptyImageAsset(): ImageAsset {
    return { image: null, status: 'not-started' };
  }

  private preloadImage(asset: ImageAsset, url: string, supportsImages: boolean): void {
    if (asset.status !== 'not-started') return;
    if (!supportsImages) {
      asset.status = 'unsupported';
      return;
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
    image.src = url;
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) asset.status = 'loaded';
  }
}
