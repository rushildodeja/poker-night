import { describe, expect, it } from 'vitest';
import { TableCommandQueue } from '../src/table-queue.js';

describe('TableCommandQueue', () => {
  it('executes commands strictly in enqueue order', async () => {
    const queue = new TableCommandQueue();
    const order: number[] = [];
    const first = queue.enqueue(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); order.push(1); return 1; });
    const second = queue.enqueue(async () => { order.push(2); return 2; });
    const third = queue.enqueue(() => { order.push(3); return 3; });
    await expect(Promise.all([first, second, third])).resolves.toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('continues processing after a rejected command', async () => {
    const queue = new TableCommandQueue();
    const failed = queue.enqueue(async () => { throw new Error('expected'); });
    const next = queue.enqueue(() => 'ok');
    await expect(failed).rejects.toThrow('expected');
    await expect(next).resolves.toBe('ok');
  });
});
