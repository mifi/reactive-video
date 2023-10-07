const { join } = require('path');
const { mkdir, rm } = require('fs/promises');
const execa = require('execa');
// eslint-disable-next-line import/no-extraneous-dependencies
const { computeExecutablePath } = require('@puppeteer/browsers');

const Editor = require('..');

const testAssetsDir = join(__dirname, '../../../reactive-video-assets');
const imageSnapshotsDir = join(testAssetsDir, 'test-image-snapshots');
const videoSnapshotsDir = join(testAssetsDir, 'test-video-snapshots');
const outputDir = join(testAssetsDir, 'test-output');

const workDir = join(__dirname, 'test-workdir');
const tempDir = join(workDir, 'reactive-video-tmp');

async function initTests() {
  await mkdir(workDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });
}

async function cleanupTests() {
  await rm(workDir, { recursive: true, force: true });
}

async function edit(editor, opts) {
  return editor.edit({
    tempDir,
    numRetries: 0,
    enableFrameCountCheck: true,
    ...opts,
  });
}

const chromeBuildId = '117.0.5938.149';

const browserExePath = computeExecutablePath({ cacheDir: './browser', browser: 'chrome', buildId: chromeBuildId });

// override logger: null to get log output
const getEditor = (opts) => Editor({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', browserExePath, logger: null, ...opts });

async function checkVideosMatch(path1, referenceVideoPath, threshold = 0.98) {
  const { stdout } = await execa('ffmpeg', ['-loglevel', 'error', '-i', path1, '-i', referenceVideoPath, '-lavfi', 'ssim=stats_file=-', '-f', 'null', '-']);
  const ok = stdout.split('\n').every((line) => {
    const match = line.match(/^n:(\d+) Y:[\d.]+ U:[\d.]+ V:[\d.]+ All:([\d.]+)/);
    if (!match) return false;
    const frameNum = parseFloat(match[1]);
    const similarity = parseFloat(match[2]);
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

module.exports = {
  initTests,
  cleanupTests,
  edit,
  getEditor,
  checkVideosMatch,

  imageSnapshotsDir,
  videoSnapshotsDir,
  workDir,
  outputDir,
  testAssetsDir,
};
