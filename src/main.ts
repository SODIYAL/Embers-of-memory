import './ui/ui-theme.css';
import './ui/manuscript.css';
import { Game } from './game/GameManager';
import { Events, GameEvents } from './game/EventBus';
import { App } from './app/App';

const root = document.getElementById('app');
if (root) new App(root).start();

// Dev/tooling hook — lets debug consoles inspect and drive game state directly.
declare global { interface Window { __embers?: unknown } }
window.__embers = { Game, Events, GameEvents };
