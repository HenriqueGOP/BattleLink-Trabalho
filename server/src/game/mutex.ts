export class AsyncMutex {
  private locked = false;
  private waiting: Array<() => void> = [];

  public acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const grant = () => {
        this.locked = true;
        resolve(() => this.release());
      };
      if (!this.locked) grant();
      else this.waiting.push(grant);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.locked = false;
  }
}