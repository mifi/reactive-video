const { join } = require('path');
const { pathToFileURL } = require('url');
const { readFile } = require('fs/promises');

// eslint-disable-next-line import/no-extraneous-dependencies
const { configureToMatchImageSnapshot } = require('jest-image-snapshot');
// eslint-disable-next-line import/no-extraneous-dependencies
const sharp = require('sharp');

const { initTests, cleanupTests, imageSnapshotsDir, videoSnapshotsDir, testAssetsDir, workDir, edit, outputDir, getEditor, checkVideosMatch } = require('./util');

// todo need to --runInBand ?

beforeAll(async () => {
  const toMatchImageSnapshot = configureToMatchImageSnapshot({ customSnapshotsDir: imageSnapshotsDir, comparisonMethod: 'ssim', failureThresholdType: 'percent' });
  expect.extend({ toMatchImageSnapshot });

  await initTests();
});

jest.setTimeout(60000);

test('render, throws error on missing video', async () => {
  const editor = getEditor();

  const reactVideo = join(__dirname, 'video', 'ReactiveVideo.js');

  const inputVideoPath = '/nonexistent-video';
  const userData = { videoUri: pathToFileURL(inputVideoPath), title: 'Title', description: 'Description' };

  const outPathPng = join(workDir, 'frame.png');

  const promise = edit(editor, {
    reactVideo,
    ffmpegStreamFormat: 'png',
    puppeteerCaptureFormat: 'png',
    captureMethod: 'screenshot',
    width: 1920,
    height: 1080,
    durationFrames: 1,
    userData,
    output: outPathPng,
  });

  await expect(promise).rejects.toThrow('Render frame error: HTTP error');
});

test('render single frame', async () => {
  const editor = getEditor();

  const reactVideo = join(__dirname, 'video', 'ReactiveVideo.js');

  const inputVideoPath = join(testAssetsDir, 'Koh Kood.mp4');
  const userData = { videoUri: pathToFileURL(inputVideoPath), title: 'Koh Kood', description: 'Paradise in Thailand' };

  const run = async (opts) => edit(editor, {
    reactVideo,
    ffmpegStreamFormat: 'png',
    puppeteerCaptureFormat: 'png',
    captureMethod: 'screenshot',
    width: 1920,
    height: 1080,
    durationFrames: 1,
    startFrame: 30,
    userData,
    ...opts,
  });

  const outPathPng = join(workDir, 'frame.png');
  await run({ output: outPathPng });

  expect(await readFile(outPathPng)).toMatchImageSnapshot({ failureThreshold: 0.0001 }); // font rendering is slightly different on macos/linux

  // try also jpeg because it's faster, so commonly used
  const outPathJpeg = join(workDir, 'frame.jpeg');
  await run({
    output: outPathJpeg,
    ffmpegStreamFormat: 'jpeg',
    puppeteerCaptureFormat: 'jpeg',
    jpegQuality: 75,
  });
  // convert the jpeg to png for snapshot comparison
  const outPathPng2 = join(workDir, 'jpeg-converted.png');
  await sharp(outPathJpeg).toFile(outPathPng2);

  expect(await readFile(outPathPng2)).toMatchImageSnapshot({ failureThreshold: 0.0001 });
});

const getFileNameForTest = () => `${expect.getState().currentTestName.replace(/[^A-Za-z0-9]/g, '')}.mov`;
const getOutputPath = () => join(outputDir, getFileNameForTest());
const getVideoSnapshotPath = () => join(videoSnapshotsDir, getFileNameForTest());

const customOutputFfmpegArgs = ['-c:v', 'libx264', '-crf', '30'];

test('render video with overlay', async () => {
  const editor = getEditor({ logger: null });

  const reactVideo = join(__dirname, 'video', 'ReactiveVideo.js');

  const inputVideoPath = join(testAssetsDir, 'Koh Kood.mp4');
  const userData = { videoUri: pathToFileURL(inputVideoPath), title: 'Koh Kood', description: 'Paradise in Thailand' };

  const { width: inputWidth, height: inputHeight, fps, durationTime } = await editor.readVideoMetadata({ path: inputVideoPath });

  expect(inputWidth).toBe(2720);
  expect(inputHeight).toBe(1530);

  const output = getOutputPath();
  await edit(editor, {
    concurrency: 4,
    reactVideo,
    width: 1280,
    height: 720,
    fps,
    durationTime,
    userData,
    customOutputFfmpegArgs,
    output,
  });

  expect(await checkVideosMatch(output, getVideoSnapshotPath(), 0.97)).toBeTruthy();
});

test('render segments', async () => {
  const editor = getEditor({ logger: console });

  const width = 1280;
  const height = 720;
  const durationFrames = 91;
  // const durationFrames = 591;

  const output = getOutputPath();

  await edit(editor, {
    concurrency: 4,
    reactVideo: join(__dirname, 'segments', 'ReactiveVideo.js'),

    width,
    height,
    fps: 25,
    durationFrames,
    customOutputFfmpegArgs,
    output,
  });

  expect(await checkVideosMatch(output, getVideoSnapshotPath())).toBeTruthy();
});

afterEach(async () => {
  await cleanupTests();
});
