// Top-level UI orchestrator. Swaps between the title screen and the game
// view, both of which mount into the same root element (#app).

import { Game } from '../game/GameManager';
import { TitleScreen } from './TitleScreen';
import { GameView } from './GameView';

export class App {
  private title?: TitleScreen;
  private game?: GameView;
  private readonly root: HTMLElement;

  constructor(root: HTMLElement) { this.root = root; }

  start() { this.showTitle(); }

  private showTitle() {
    this.game?.unmount();
    this.game = undefined;
    this.title = new TitleScreen(this.root, {
      onPlay: () => this.showGame(),
      onNewGame: () => { Game.reset(); this.showGame(); },
    });
    this.title.mount();
  }

  private showGame() {
    this.title?.unmount();
    this.title = undefined;
    this.game = new GameView(this.root, { onExit: () => this.showTitle() });
    this.game.mount();
  }
}
