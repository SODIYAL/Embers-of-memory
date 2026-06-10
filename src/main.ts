import Phaser from 'phaser';
import './ui/ui-theme.css';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { CampusScene } from './scenes/CampusScene';
import { Game } from './game/GameManager';
import { Events, GameEvents } from './game/EventBus';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: 1280,
  height: 720,
  backgroundColor: '#1a0f0a',
  parent: 'game-container',
  // The whole game renders on a 2×2 texel grid (1× pixel art drawn at
  // scale 2). pixelArt keeps NEAREST filtering everywhere; snapping the
  // displayed canvas to multiples of 640×360 keeps every texel a whole
  // number of CSS pixels at any window size (no shimmer).
  render: {
    pixelArt: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
    snap: { width: 640, height: 360 },
  },
  scene: [BootScene, MenuScene, CampusScene],
};

new Phaser.Game(config);

// Dev/tooling hook — lets debug consoles and the screenshot harness
// (scripts/screenshot.mjs) inspect and drive game state directly.
declare global { interface Window { __embers?: unknown } }
window.__embers = { Game, Events, GameEvents };
