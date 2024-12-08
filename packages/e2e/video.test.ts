import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, beforeAll, afterEach, test, expect } from 'vitest';

// eslint-disable-next-line import/no-extraneous-dependencies
import { configureToMatchImageSnapshot } from 'jest-image-snapshot';
// eslint-disable-next-line import/no-extraneous-dependencies
import sharp from 'sharp';

import { initTests, cleanupTests, imageSnapshotsDir, videoSnapshotsDir, testAssetsDir, workDir, edit, outputDir, getEditor, checkVideosMatch } from './util.js';
import { UserData as VideoUserData } from './src/video/ReactiveVideo.js';
import { UserData as SimpleVideoUserData } from './src/video-simple/ReactiveVideo.js';

// eslint-disable-next-line no-underscore-dangle
const reactiveVideoRoot = join(dirname(fileURLToPath(import.meta.url)), 'dist');

const getFileNameForTest = (ext: string) => `${(expect.getState().currentTestName ?? '').replaceAll(/[^\dA-Za-z]/g, '')}.${ext}`;
const getOutputPath = (ext: string) => join(outputDir, getFileNameForTest(ext));
const getVideoSnapshotPath = (ext: string) => join(videoSnapshotsDir, getFileNameForTest(ext));

const enableDebugLogging = process.env['RUNNER_DEBUG'] === '1';

describe('render videos', () => {
  beforeAll(async () => {
    const toMatchImageSnapshot = configureToMatchImageSnapshot({ customSnapshotsDir: imageSnapshotsDir, comparisonMethod: 'ssim', failureThresholdType: 'percent' });
    expect.extend({ toMatchImageSnapshot });

    await initTests();
  });

  const timeout = 60000;

  test('render, throws error on missing video', async () => {
    const editor = getEditor({ logger: console });

    const reactVideo = join(reactiveVideoRoot, 'video', 'ReactiveVideo');

    const inputVideoPath = '/nonexistent-video';
    const userData: VideoUserData = { videoUri: pathToFileURL(inputVideoPath).toString(), title: 'Title', description: 'Description' };

    const outPathPng = getOutputPath('png');

    const promise = edit(editor, {
      reactVideo,
      ffmpegStreamFormat: 'png',
      puppeteerCaptureFormat: 'png',
      width: 1920,
      height: 1080,
      durationFrames: 1,
      userData,
      output: outPathPng,

      enableRequestLog: true,
      enablePerFrameLog: true,
      enableFfmpegLog: enableDebugLogging,

      // headless: false,
      // keepBrowserRunning: 60000,
    });

    await expect(promise).rejects.toThrow(/Video server responded HTTP http:\/\/localhost:\d+\/api\/read-video-metadata 404 Not Found/);
  }, timeout);

  test('render single frame from video', async () => {
    const editor = getEditor({ logger: console });

    const reactVideo = join(reactiveVideoRoot, 'video', 'ReactiveVideo');

    const inputVideoPath = join(testAssetsDir, 'Koh Kood.mp4');
    const userData: VideoUserData = { videoUri: pathToFileURL(inputVideoPath).toString(), title: 'Koh Kood', description: 'Paradise in Thailand' };

    const outPathPng = getOutputPath('png');
    await edit(editor, {
      reactVideo,
      ffmpegStreamFormat: 'png',
      puppeteerCaptureFormat: 'png',
      width: 1920,
      height: 1080,
      durationFrames: 1,
      startFrame: 30,
      userData,
      output: outPathPng,

      enableRequestLog: true,
      enablePerFrameLog: true,
      enableFfmpegLog: enableDebugLogging,
    });

    expect(await readFile(outPathPng)).toMatchImageSnapshot({ failureThreshold: 0.2 }); // font rendering is slightly different on macos/linux
  }, timeout);

  test('vertical video', async () => {
    const editor = getEditor({ logger: console });

    const reactVideo = join(reactiveVideoRoot, 'video-simple', 'ReactiveVideo');

    const inputVideoPath = join(testAssetsDir, 'square-container-aspect-1-2.mp4');
    const userData: SimpleVideoUserData = { videoUri: pathToFileURL(inputVideoPath).toString() };

    const outPathPng = getOutputPath('png');
    await edit(editor, {
      reactVideo,
      ffmpegStreamFormat: 'png',
      puppeteerCaptureFormat: 'png',
      width: 200,
      height: 400,
      durationFrames: 1,
      startFrame: 0,
      userData,
      output: outPathPng,

      enableRequestLog: true,
      enablePerFrameLog: true,
      enableFfmpegLog: enableDebugLogging,
    });

    expect(await readFile(outPathPng)).toMatchImageSnapshot({ failureThreshold: 0.0001 });
  }, timeout);

  // Test a simple page without any resources, to see that it works even with an empty asyncRegistry
  test('render single frame, simple', async () => {
    const editor = getEditor({ logger: console });

    const reactVideo = join(reactiveVideoRoot, 'simple', 'ReactiveVideo');

    const outPathPng = getOutputPath('png');

    await edit(editor, {
      reactVideo,
      ffmpegStreamFormat: 'png',
      puppeteerCaptureFormat: 'png',
      durationFrames: 1,
      width: 1920,
      height: 1080,
      output: outPathPng,

      enableRequestLog: true,
      enablePerFrameLog: true,
      enableFfmpegLog: enableDebugLogging,
    });

    // try also jpeg because it's faster, so commonly used
    const outPathJpeg = getOutputPath('jpeg');

    await edit(editor, {
      reactVideo,
      ffmpegStreamFormat: 'jpeg',
      puppeteerCaptureFormat: 'jpeg',
      durationFrames: 1,
      width: 1920,
      height: 1080,
      output: outPathJpeg,
    });

    // convert the jpeg to png for snapshot comparison
    const outPathPng2 = join(workDir, 'jpeg-converted.png');
    await sharp(outPathJpeg).toFile(outPathPng2);

    expect(await readFile(outPathPng)).toMatchImageSnapshot({ failureThreshold: 0.0001 }); // font rendering is slightly different on macos/linux
    expect(await readFile(outPathPng2)).toMatchImageSnapshot({ failureThreshold: 0.0001 });
  }, timeout);

  const customOutputFfmpegArgs = ['-c:v', 'libx264', '-crf', '30'];

  test('render video with overlay', async () => {
    const editor = getEditor({ logger: console });
    // const editor = getEditor({ logger: console });

    const reactVideo = join(reactiveVideoRoot, 'video', 'ReactiveVideo');

    const inputVideoPath = join(testAssetsDir, 'Koh Kood.mp4');
    const userData: VideoUserData = { videoUri: pathToFileURL(inputVideoPath).toString(), title: 'Koh Kood', description: 'Paradise in Thailand' };

    const { width: inputWidth, height: inputHeight, fps, durationTime } = await editor.readVideoMetadata({ path: inputVideoPath });

    expect(inputWidth).toBe(2720);
    expect(inputHeight).toBe(1530);

    const output = getOutputPath('mov');
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

      enableRequestLog: enableDebugLogging,
      enablePerFrameLog: enableDebugLogging,
      enableFfmpegLog: enableDebugLogging,
    });

    expect(await checkVideosMatch(output, getVideoSnapshotPath('mov'), 0.96)).toBeTruthy();
  }, timeout);

  test('render segments', async () => {
    const editor = getEditor({ logger: console });

    const width = 1280;
    const height = 720;
    const durationFrames = 91;
    // const durationFrames = 591;

    const output = getOutputPath('mov');

    await edit(editor, {
      concurrency: 4,
      reactVideo: join(reactiveVideoRoot, 'segments', 'ReactiveVideo'),

      width,
      height,
      fps: 25,
      durationFrames,
      customOutputFfmpegArgs,
      output,

      enableRequestLog: enableDebugLogging,
      enablePerFrameLog: enableDebugLogging,
      enableFfmpegLog: enableDebugLogging,
    });

    expect(await checkVideosMatch(output, getVideoSnapshotPath('mov'), 0.96)).toBeTruthy();
  }, timeout);

  afterEach(async () => {
    await cleanupTests();
  });
});
