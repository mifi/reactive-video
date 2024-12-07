// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, test, expect } from 'vitest';
import { splitIntoParts } from './util';

describe('util', () => {
  test('splitIntoParts', () => {
    expect(splitIntoParts({ startFrame: 0, durationFrames: 2, concurrency: 1 })).toEqual([[0, 2]]);
    expect(splitIntoParts({ startFrame: 0, durationFrames: 1, concurrency: 1 })).toEqual([[0, 1]]);
    // todo
  });
});
