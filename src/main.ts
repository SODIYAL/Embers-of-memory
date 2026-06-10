import Phaser from 'phaser';
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
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, MenuScene, CampusScene],
};

new Phaser.Game(config);

// Dev/tooling hook — lets debug consoles and the screenshot harness
// (scripts/screenshot.mjs) inspect and drive game state directly.
declare global { interface Window { __embers?: unknown } }
window.__embers = { Game, Events, GameEvents };
