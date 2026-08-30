import type { UpgradeId } from './types.js';

export interface UpgradeDefinition {
  id: UpgradeId;
  title: string;
  school: 'Longsword' | 'Dussack' | 'Shared';
  description: string;
  detail: string;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDefinition>> = Object.freeze({
  'longsword-sweep': {
    id: 'longsword-sweep',
    title: 'Returning Sweep',
    school: 'Longsword',
    description: 'The third light cut reaches farther behind Meyer and throws crowds wider.',
    detail: 'Threefold Cut gains depth, two target slots, and stronger knockback.'
  },
  'longsword-control': {
    id: 'longsword-control',
    title: 'Control the Centre',
    school: 'Longsword',
    description: 'A successful parry strengthens the next committed longsword hit.',
    detail: 'The Provoke → Take → Hit payoff deals additional damage and armor pressure.'
  },
  'dussack-circle': {
    id: 'dussack-circle',
    title: 'Complete the Wheel',
    school: 'Dussack',
    description: 'Circular finishers wrap fully around Meyer and catch more pursuers.',
    detail: 'Wheel Cut and Circular Pursuit become radial crowd-control attacks.'
  },
  'dussack-passing-step': {
    id: 'dussack-passing-step',
    title: 'Passing Step',
    school: 'Dussack',
    description: 'The dodge attack travels through the press and remains safe for longer.',
    detail: 'Dussack dodge-light gains movement, invulnerability, and one target slot.'
  },
  'quick-change': {
    id: 'quick-change',
    title: 'Quick Change',
    school: 'Shared',
    description: 'Switching after a confirmed hit flows directly into the new weapon.',
    detail: 'Hit-confirmed switches are faster and trigger a switch-entry attack.'
  },
  'second-intention': {
    id: 'second-intention',
    title: 'Second Intention',
    school: 'Shared',
    description: 'A provoking attack that meets a guard may recover directly into defense.',
    detail: 'Hold Guard after a blocked provoking cut to cancel part of recovery.'
  }
});

export const UPGRADE_OFFERS: readonly (readonly UpgradeId[])[] = [
  ['longsword-sweep', 'dussack-passing-step', 'quick-change'],
  ['longsword-control', 'dussack-circle', 'second-intention']
] as const;

export function getUpgrade(id: UpgradeId): UpgradeDefinition {
  return UPGRADES[id];
}
