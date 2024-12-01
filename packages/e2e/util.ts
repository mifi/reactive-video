import { join, dirname } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-extraneous-dependencies
import { execa } from 'execa';
// eslint-disable-next-line import/no-extraneous-dependencies
import { Browser, computeExecutablePath } from '@puppeteer/browsers';

import Editor from '@reactive-video/builder';

// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));

export const testAssetsDir = join(__dirname, '../../reactive-video-assets');
export const imageSnapshotsDir = join(testAssetsDir, 'test-image-snapshots');
export const videoSnapshotsDir = join(testAssetsDir, 'test-video-snapshots');
export const outputDir = join(testAssetsDir, 'test-output');

export const workDir = join(__dirname, 'test-workdir');
const tempDir = join(workDir, 'reactive-video-tmp');

export async function initTests() {
  await mkdir(workDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
}

export async function cleanupTests() {
  await rm(workDir, { recursive: true, force: true });
}

export async function edit(editor: ReturnType<typeof Editor>, opts: Parameters<ReturnType<typeof Editor>['edit']>[0]) {
  return editor.edit({
    tempDir,
    numRetries: 0,
    enableFrameCountCheck: true,
    ...opts,
  });
}

const chromeBuildId = '131.0.6778.85';

const browserExePath = computeExecutablePath({ cacheDir: './browser', browser: Browser.CHROME, buildId: chromeBuildId });

// override logger: null to get log output
export const getEditor = (opts?: Omit<Parameters<typeof Editor>[0], 'ffmpegPath' | 'ffprobePath' | 'browserExePath'>) => Editor({
  ffmpegPath: 'ffmpeg',
  ffprobePath: 'ffprobe',
  browserExePath,
  logger: null,
  // devMode: true,
  ...opts,
});

export async function checkVideosMatch(path1: string, referenceVideoPath: string, threshold = 0.98) {
  const { stdout } = await execa('ffmpeg', ['-loglevel', 'error', '-i', path1, '-i', referenceVideoPath, '-lavfi', 'ssim=stats_file=-', '-f', 'null', '-']);
  const ok = stdout.split('\n').every((line) => {
    const match = line.match(/^n:(\d+) Y:[\d.]+ U:[\d.]+ V:[\d.]+ All:([\d.]+)/);
    if (!match) return false;
    const frameNum = parseFloat(match[1]!);
    const similarity = parseFloat(match[2]!);
    if (similarity < threshold) {
      console.warn('All similarities:', stdout);
      console.warn('Similarity was off', { frameNum, similarity });

      return false;
    }
    return true;
  });

  if (!ok) {
    console.log('Generating visual diff');
    const args = ['-i', referenceVideoPath, '-i', path1, '-filter_complex', 'blend=all_mode=difference', '-c:v', 'libx264', '-crf', '18', '-c:a', 'copy', '-y', join(`${path1}-diff.mov`)];
    console.log(args.join(' '));
    await execa('ffmpeg', args);
  }

  return ok;
}
