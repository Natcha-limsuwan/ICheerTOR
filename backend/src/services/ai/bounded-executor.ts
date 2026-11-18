/** Process-local bound; distributed record ownership is handled by extraction leases. */
export class CapacityError extends Error { constructor() { super("Model queue capacity exceeded"); } }
export class BoundedExecutor {
  private active = 0;
  private readonly pending: Array<() => void> = [];
  constructor(private readonly limit: number, private readonly maxPending: number) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(maxPending) || maxPending < 0) throw new Error("Invalid executor limits");
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.pending.length >= this.maxPending) throw new CapacityError();
      await new Promise<void>(resolve => this.pending.push(resolve));
    } else this.active++;
    try { return await work(); }
    finally {
      const next = this.pending.shift();
      if (next) next(); // Transfer this occupied slot, without exposing a free-slot race.
      else this.active--;
    }
  }
}
