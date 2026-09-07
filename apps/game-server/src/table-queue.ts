export type QueueTask<T> = () => T | Promise<T>;

/** Serializes every mutation for one table. No table action may execute concurrently. */
export class TableCommandQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: QueueTask<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  async idle(): Promise<void> {
    await this.tail;
  }
}
