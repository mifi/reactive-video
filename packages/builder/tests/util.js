const { join } = require('path');
const { mkdir, rm } = require('fs/promises');
const execa = require('execa');

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

// override logger: null to get log output
const getEditor = (opts) => Editor({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', logger: null, ...opts });

async function checkVideosMatch(path1, path2, threshold = 0.98) {
  const { stdout } = await execa('ffmpeg', ['-loglevel', 'error', '-i', path1, '-i', path2, '-lavfi', 'ssim=stats_file=-', '-f', 'null', '-']);
  return stdout.split('\n').every((line) => {
    const match = line.match(/^n:\d+ Y:[\d.]+ U:[\d.]+ V:[\d.]+ All:([\d.]+)/);
    if (!match) return false;
    const similarity = parseFloat(match[1]);
    if (similarity < threshold) {
      console.warn('Similarity was off', stdout);
      return false;
    }
    return true;
  });
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
