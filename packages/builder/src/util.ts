import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const randomBytes = promisify(crypto.randomBytes);

export async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

export const uriifyPath = (path: string) => (path.startsWith('file://') ? fileURLToPath(path) : path);

export function splitIntoParts({ startFrame, durationFrames, concurrency }: {
  startFrame: number,
  durationFrames: number,
  concurrency: number,
}) {
  const partLength = Math.floor(durationFrames / concurrency);
  const parts = Array.from({ length: concurrency }).fill(undefined).map((_v, i) => {
    const ret: [number, number] = [i * partLength, (i + 1) * partLength];
    return ret;
  });
  const remainder = durationFrames % concurrency;
  if (remainder > 0) parts.at(-1)![1] += remainder;
  return parts.map(([partStart, partEnd]) => {
    const ret: [number, number] = [startFrame + partStart, startFrame + partEnd];
    return ret;
  });
}
