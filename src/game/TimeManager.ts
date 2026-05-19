import { Events, GameEvents } from './EventBus';

export type GameSpeed = 'paused' | 'normal' | 'fast';

const MS_PER_DAY: Record<Exclude<GameSpeed, 'paused'>, number> = {
  normal: 1200,
  fast: 300,
};

export class TimeManager {
  private day: number;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  speed: GameSpeed = 'paused';

  constructor(startingDay: number = 1) {
    this.day = startingDay;
  }

  start() {
    this.setSpeed('normal');
  }

  private tick() {
    this.day++;
    Events.emit(GameEvents.DAY_PASSED, { day: this.day });
    if (this.day % 30 === 0) {
      Events.emit(GameEvents.MONTH_PASSED, { month: Math.floor(this.day / 30) });
    }
    if (this.day % 360 === 0) {
      Events.emit(GameEvents.YEAR_PASSED, { year: Math.floor(this.day / 360) });
    }
  }

  setSpeed(speed: GameSpeed) {
    this.speed = speed;
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (speed !== 'paused') {
      this.tickInterval = setInterval(() => this.tick(), MS_PER_DAY[speed]);
    }
  }

  getDay() { return this.day; }

  destroy() {
    this.setSpeed('paused');
  }
}
