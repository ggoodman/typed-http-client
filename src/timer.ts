export class Timer {
  public static readonly MS_PER_SEC = 1e3;
  public static readonly NS_PER_MSEC = 1e6;

  private readonly started: [number, number];

  constructor() {
    this.started = process.hrtime();
  }

  elapsedMs(): number {
    const elapsed = process.hrtime(this.started);

    return elapsed[0] * Timer.MS_PER_SEC + elapsed[1] / Timer.NS_PER_MSEC;
  }
}
