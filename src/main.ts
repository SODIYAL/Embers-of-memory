import Phaser from 'phaser';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#2C1810',
  parent: 'game-container',
  scene: []
};

new Phaser.Game(config);
