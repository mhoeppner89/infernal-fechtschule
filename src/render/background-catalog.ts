export interface BackgroundSpec {
  readonly waveIndex: number;
  readonly id: 'cobbled-streets' | 'town-gate' | 'sala-darmi' | 'castello';
  readonly url: string;
  readonly label: string;
}

export const BACKGROUND_MANIFEST: readonly BackgroundSpec[] = Object.freeze([
  {
    waveIndex: 0,
    id: 'cobbled-streets',
    url: 'assets/art/backgrounds/cobbled-streets.webp',
    label: 'The Cobbled Streets'
  },
  {
    waveIndex: 1,
    id: 'town-gate',
    url: 'assets/art/backgrounds/town-gate.webp',
    label: 'The Town Gate'
  },
  {
    waveIndex: 2,
    id: 'sala-darmi',
    url: 'assets/art/backgrounds/sala-darmi.webp',
    label: 'The Sala d’Armi'
  },
  {
    waveIndex: 3,
    id: 'castello',
    url: 'assets/art/backgrounds/castello.webp',
    label: 'The Castello'
  }
]);

interface BackgroundAsset {
  readonly spec: BackgroundSpec;
  image: HTMLImageElement | null;
  status: 'not-started' | 'loading' | 'loaded' | 'failed' | 'unsupported';
}

export interface BackgroundReadinessReport {
  readonly declared: number;
  readonly loaded: number;
  readonly pending: number;
  readonly failed: number;
}

export class BackgroundCatalog {
  private readonly assets = new Map<number, BackgroundAsset>();

  constructor() {
    for (const spec of BACKGROUND_MANIFEST) {
      this.assets.set(spec.waveIndex, { spec, image: null, status: 'not-started' });
    }
  }

  preload(): void {
    const supportsImages = typeof Image !== 'undefined';
    for (const asset of this.assets.values()) {
      if (asset.status !== 'not-started') continue;
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
      if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) asset.status = 'loaded';
    }
  }

  resolve(waveIndex: number): HTMLImageElement | null {
    const normalized = Math.max(0, Math.min(BACKGROUND_MANIFEST.length - 1, waveIndex));
    const asset = this.assets.get(normalized);
    return asset?.status === 'loaded' ? asset.image : null;
  }

  readiness(): BackgroundReadinessReport {
    const assets = [...this.assets.values()];
    return {
      declared: assets.length,
      loaded: assets.filter((asset) => asset.status === 'loaded').length,
      pending: assets.filter((asset) => asset.status === 'not-started' || asset.status === 'loading').length,
      failed: assets.filter((asset) => asset.status === 'failed' || asset.status === 'unsupported').length
    };
  }
}
