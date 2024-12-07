import { join, resolve as resolvePath, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert';
import os from 'node:os';
import getPort from 'get-port';
import { Compiler, Watching } from 'webpack';
import { fileURLToPath } from 'node:url';

import { PuppeteerCaptureFormat, CaptureMethod, FFmpegStreamFormat, VideoComponentType } from 'reactive-video/dist/types.js';

import { generateSecret, splitIntoParts } from './util.js';
import { concatParts } from './ffmpeg.js';
import createRenderer from './renderer.js';

import { readVideoFormatMetadata, readVideoStreamsMetadata, readDurationFrames } from './videoServer.js';
import serve from './server.js';
import { createBundler, startBundler, stopBundleWatcher } from './bundler.js';
import { ReactVideoInitData } from './react/previewEntry.js';

// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(fileURLToPath(import.meta.url));

const reactHtmlBasePath = join(__dirname, '..');
const reactIndexJsBasePath = join(__dirname, 'react');


async function processOptions({ durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirMaybeRel }: {
  durationTime: number | undefined,
  durationFramesIn: number | undefined,
  reactVideo: string,
  fps: number,
  width: number,
  height: number,
  tempDirMaybeRel: string,
}) {
  assert(durationTime || durationFramesIn, 'durationTime or durationFrames required');
  assert(reactVideo, 'reactVideo required');
  assert(!Number.isNaN(fps), 'Invalid fps');
  assert(!Number.isNaN(width) && !Number.isNaN(height), 'Invalid width/height');

  let durationFrames = durationFramesIn;
  if (durationTime) durationFrames = Math.round(durationTime * fps);
  // todo?
  // assert(Number.isInteger(durationFrames), 'durationFrames must be an integer');

  const tempDir = resolvePath(tempDirMaybeRel);

  await mkdir(tempDir, { recursive: true });
  const distPath = join(tempDir, 'dist');
  const userEntryPath = resolvePath(reactVideo);

  assert(durationFrames != null);

  return {
    durationFrames, tempDir, distPath, userEntryPath,
  };
}

export interface Logger {
  error: (message?: unknown, ...optionalParams: unknown[]) => void;
  warn: (message?: unknown, ...optionalParams: unknown[]) => void;
  info: (message?: unknown, ...optionalParams: unknown[]) => void;
  log: (message?: unknown, ...optionalParams: unknown[]) => void;
  debug: (message?: unknown, ...optionalParams: unknown[]) => void;
  trace: (message?: unknown, ...optionalParams: unknown[]) => void;
}

interface CommonParams {
  width?: number | undefined,
  height?: number | undefined,
  fps?: number | undefined,
  userData?: object | undefined,
  videoComponentType?: VideoComponentType | undefined,
  ffmpegStreamFormat?: FFmpegStreamFormat | undefined,
  jpegQuality?: number | undefined,
  durationFrames?: number | undefined,
  durationTime?: number | undefined,
  reactVideo: string,
  tempDir?: string | undefined,
}

export interface PreviewParams extends CommonParams {
  port?: number | undefined,
}

export interface EditParams extends CommonParams {
  concurrency?: number | undefined,
  puppeteerCaptureFormat?: PuppeteerCaptureFormat | undefined,
  captureMethod?: CaptureMethod | undefined,
  sleepTimeBeforeCapture?: number | undefined,
  extraPuppeteerArgs?: string[] | undefined,
  customOutputFfmpegArgs?: string[] | undefined,

  startFrame?: number | undefined,

  // Output video path
  output?: string | undefined,

  rawOutput?: boolean | undefined,

  frameRenderTimeout?: number | undefined,
  failOnWebErrors?: boolean | undefined,
  numRetries?: number | undefined,

  enableFrameCountCheck?: boolean | undefined,

  showProgress?: boolean | undefined,

  headless?: boolean | undefined,
  keepBrowserRunning?: number | undefined,
  enableFfmpegLog?: boolean | undefined,
  enablePerFrameLog?: boolean | undefined,
  enableRequestLog?: boolean | undefined,
}

export default function Editor({
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
  browserExePath,
  devMode = false,
  logger: loggerIn = console,
}: {
  ffmpegPath?: string | undefined,
  ffprobePath?: string | undefined,
  browserExePath: string,
  devMode?: boolean | undefined,
  logger?: Logger | null | undefined,
}) {
  assert(browserExePath, 'browserExePath (path to browser) is required');

  const bundleMode = devMode ? 'development' : 'production';

  const logger = loggerIn !== null ? loggerIn : { error: () => undefined, warn: () => undefined, info: () => undefined, log: () => undefined, debug: () => undefined, trace: () => undefined };

  async function tryStopBundleWatcher(bundler: Compiler, watcher: Watching) {
    logger.log('Stopping bundle watcher');
    try {
      await stopBundleWatcher(bundler, watcher);
      logger.log('Bundle watcher stopped');
    } catch (err) {
      logger.error('Failed to stop bundle watcher', err);
    }
  }

  async function edit({
    width = 800,
    height = 600,
    fps = 30,
    userData,
    videoComponentType,
    concurrency: concurrencyIn = os.cpus().length,

    puppeteerCaptureFormat = 'jpeg',
    ffmpegStreamFormat = 'jpeg',
    jpegQuality = 90,
    captureMethod = 'screenshot',
    sleepTimeBeforeCapture = 0, // See https://github.com/mifi/reactive-video/issues/4
    extraPuppeteerArgs = [],
    customOutputFfmpegArgs,

    startFrame = 0,
    durationFrames: durationFramesIn,
    durationTime,

    reactVideo,
    tempDir: tempDirMaybeRel = 'reactive-video-tmp',

    // Output video path
    output: desiredOutPath,

    // takes a lot of space, but is faster
    rawOutput = true,

    frameRenderTimeout = 30000,
    failOnWebErrors = true,
    numRetries = 3,

    // Counts all frames in the final video and throws an error if there's a mismatch
    enableFrameCountCheck = false,

    showProgress = true,

    // debugging flags
    headless = true,
    keepBrowserRunning, // set this to a number of milliseconds you want to keep the browser instead of exiting after a fatal error (use with headless: false)
    enableFfmpegLog = false,
    enablePerFrameLog = false,
    enableRequestLog = false,
  }: EditParams) {
    assert(captureMethod !== 'extension' || !headless, 'Headless is not compatible with this captureMethod');

    const {
      durationFrames, tempDir, distPath, userEntryPath,
    } = await processOptions({
      durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirMaybeRel,
    });

    assert(durationFrames > 0);

    const isPhoto = durationFrames === 1;
    const concurrency = concurrencyIn > durationFrames ? durationFrames : concurrencyIn;

    let defaultOutPath;
    if (isPhoto) {
      defaultOutPath = puppeteerCaptureFormat === 'jpeg' ? 'reactive-video.jpg' : 'reactive-video.png';
    } else if (rawOutput) {
      // eslint-disable-next-line unicorn/prefer-ternary
      if (puppeteerCaptureFormat === 'jpeg') defaultOutPath = 'reactive-video.mov'; // MJPEG
      else defaultOutPath = 'reactive-video.mkv'; // MPNG
    } else {
      defaultOutPath = 'reactive-video.mp4'; // h264
    }

    const parts = splitIntoParts({ startFrame, durationFrames, concurrency });

    const finalOutPath = desiredOutPath || defaultOutPath;

    const reactIndexPath = join(reactIndexJsBasePath, 'puppeteerEntry.js');
    const reactHtmlDistName = 'index.html';
    const reactHtmlPath = join(reactHtmlBasePath, reactHtmlDistName);

    const bundler = createBundler({ entryPath: reactIndexPath, userEntryPath, outDir: distPath, mode: bundleMode });

    let stopServer: (() => Promise<void>) | undefined;
    let watcher;

    const port = await getPort();
    const secret = await generateSecret();

    try {
      const startBundlerPromise = (async () => {
        logger.log('Compiling Reactive Video Javascript');
        watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });
      })();

      const serverPromise = (async () => {
        logger.log('Starting server');
        const server = await serve({ logger, ffmpegPath, ffprobePath, secret, port, enableRequestLog });
        stopServer = server.stop;
        return server;
      })();

      const createRendererPromise = (async () => {
        logger.log('Launching puppeteer, concurrency:', concurrency);

        const extensionPath = join(__dirname, 'extension');
        return createRenderer({ concurrency, captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, logger, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, browserExePath, keepBrowserRunning });
      })();

      const [{ renderPart, terminateRenderers }] = await Promise.all([createRendererPromise, serverPromise, startBundlerPromise]);

      logger.log(`Rendering frames with ${parts.length} workers`);
      const partProgresses: Record<string, { frameNum: number, durationFrames: number }> = {};
      let startTime: Date;

      const renderers = parts.map((part, partNum) => {
        const partStart = part[0];
        const partEnd = part[1];

        function onProgress({ frameNum }: { frameNum: number }) {
          if (!showProgress) return;
          partProgresses[partNum] = { frameNum: frameNum - partStart, durationFrames: partEnd - partStart };

          if (!startTime) {
            startTime = new Date();
            return;
          }

          const secondsSinceStart = ((Date.now() - startTime.getTime()) / 1000);

          const totalFramesDone = Object.values(partProgresses).reduce((acc, { frameNum: frameNum2 }) => acc + frameNum2, 0);
          // logger.log(partProgresses, totalFramesDone, avgFps);
          if (secondsSinceStart > 0 && totalFramesDone % Math.ceil(fps) === 0) {
            const avgFps = totalFramesDone / secondsSinceStart;
            logger.log(
              'Progress',
              `${((totalFramesDone / durationFrames) * 100).toFixed(2)}%`,
              'FPS:',
              avgFps.toFixed(2),
              'Parts:',
              Object.entries(partProgresses).map(([n, { frameNum: frameNum2, durationFrames: durationFrames2 }]) => `${n}: ${((frameNum2 / durationFrames2) * 100).toFixed(2)}%`).join(', '),
            );
          }
        }

        return renderPart({ partNum, partStart, partEnd, onProgress });
      });

      const promises = renderers.map((renderer) => renderer.promise);
      let outPaths;
      try {
        outPaths = await Promise.all(promises);
        logger.info('Renderer workers finished');
      } catch (err) {
        if (renderers.length > 1) {
          logger.error('Caught error in one part, aborting the rest');
          renderers.forEach(({ abort }) => abort());
          await Promise.allSettled(promises); // wait for all renderers to close first
        }
        throw err;
      } finally {
        if (keepBrowserRunning) {
          logger.info('Keeping browser running for', keepBrowserRunning, 'ms');
          await new Promise((resolve) => setTimeout(resolve, keepBrowserRunning));
        }
        logger.log(`Terminating ${renderers.length} renderer worker(s)`);
        await terminateRenderers();
        logger.log('Terminated renderer workers');
      }

      logger.log('Merging parts');
      const concatFilePath = join(tempDir, 'concat.txt');
      await concatParts({ ffmpegPath, paths: outPaths, concatFilePath, finalOutPath, remuxOnly: rawOutput });

      if (enableFrameCountCheck) {
        const actualDurationFrames = await readDurationFrames({ ffprobePath, path: finalOutPath });
        assert.strictEqual(actualDurationFrames, durationFrames);
      }
    } finally {
      if (stopServer) await stopServer();
      if (watcher) await tryStopBundleWatcher(bundler, watcher);
    }

    logger.log('Edit finished:', finalOutPath);
  }

  /**
   *
   * @param {import('./types').PreviewParams} param0
   */
  async function preview({
    width = 800,
    height = 600,
    fps = 30,
    port = 3000,
    userData,

    videoComponentType = 'ffmpeg',
    ffmpegStreamFormat = 'jpeg',
    jpegQuality = 70,

    durationFrames: durationFramesIn,
    durationTime,

    reactVideo,
    tempDir: tempDirMaybeRel = 'reactive-video-tmp',
  }: PreviewParams) {
    const {
      durationFrames, distPath, userEntryPath,
    } = await processOptions({
      durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirMaybeRel,
    });

    const reactIndexPath = join(reactIndexJsBasePath, 'previewEntry.js');
    const reactHtmlDistName = 'preview.html';
    const reactHtmlPath = join(reactHtmlBasePath, reactHtmlDistName);

    const secret = await generateSecret();

    const initData: ReactVideoInitData = { width, height, fps, serverPort: port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret };
    const bundler = createBundler({ entryPath: reactIndexPath, userEntryPath, outDir: distPath, mode: bundleMode, entryOutName: 'preview.js', initData });

    logger.log('Compiling Reactive Video Javascript');
    const watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });

    logger.warn('Warning: Serving filesystem root');
    const server = await serve({ logger, ffmpegPath, ffprobePath, serveStaticPath: distPath, serveRoot: true, port, secret });
    const { stop: stopServer } = server;

    logger.log(`http://localhost:${port}/preview.html?secret=${encodeURIComponent(secret)}`);

    let sig = false;
    process.on('SIGINT', () => {
      if (sig) process.exit(1);
      logger.log('Caught SIGINT, shutting down');
      sig = true;
      stopServer();
      tryStopBundleWatcher(bundler, watcher);
    });
  }

  async function readVideoMetadata({ path, streamIndex = 0, countFrames = false }: {
    path: string;
    streamIndex?: number
    countFrames?: boolean
  }) {
    const { width, height, fps } = await readVideoStreamsMetadata({ ffprobePath, path, streamIndex });
    const { duration: durationTime } = await readVideoFormatMetadata({ ffprobePath, path });
    const durationFrames = countFrames ? await readDurationFrames({ ffprobePath, path, streamIndex }) : undefined;

    return { width, height, fps, durationTime, durationFrames };
  }

  return {
    edit,
    readVideoMetadata,
    preview,
  };
}
