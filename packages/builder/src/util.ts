import crypto from 'node:crypto';
import { promisify } from 'node:util';
import uri2path from 'file-uri-to-path';

const randomBytes = promisify(crypto.randomBytes);

export async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

export const uriifyPath = (path: string) => (path.startsWith('file://') ? uri2path(path) : path);
