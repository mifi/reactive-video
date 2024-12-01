import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const randomBytes = promisify(crypto.randomBytes);

export async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

export const uriifyPath = (path: string) => (path.startsWith('file://') ? fileURLToPath(path) : path);
