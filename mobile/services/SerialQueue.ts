export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    // A failed insert must not poison the queue and block all future captures.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
