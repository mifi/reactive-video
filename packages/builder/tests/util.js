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
    jpegQuality: 30,
    ...opts,
  });
}

// override logger: null to get log output
const getEditor = (opts) => Editor({ ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', logger: null, ...opts });

async function getVideoHash(path) {
  const { stdout } = await execa('ffmpeg', ['-loglevel', 'error', '-i', path, '-map', '0:v', '-f', 'md5', '-']);
  return stdout.replace(/^MD5=/, '');
}
async function checkVideosMatch(path1, path2) {
  const hash1 = await getVideoHash(path1);
  const hash2 = await getVideoHash(path2);
  return hash1 === hash2;
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
