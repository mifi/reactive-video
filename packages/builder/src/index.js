const { join, resolve: resolvePath } = require('path');
const { mkdirp } = require('fs-extra');
const assert = require('assert');
const os = require('os');
const getPort = require('get-port');

const { generateSecret } = require('./util');
const { concatParts } = require('./ffmpeg');
const createRenderer = require('./renderer');

const { readVideoFormatMetadata, readVideoStreamsMetadata, readDurationFrames } = require('./videoServer');
const { serve } = require('./server');
const { createBundler, startBundler, stopBundleWatcher } = require('./bundler');

function splitIntoParts({ startFrame, durationFrames, concurrency }) {
  const partLength = Math.floor(durationFrames / concurrency);
  const parts = Array(concurrency).fill().map((v, i) => [i * partLength, (i + 1) * partLength]);
  const remainder = durationFrames % concurrency;
  if (remainder > 0) parts[parts.length - 1][1] += remainder;
  return parts.map(([partStart, partEnd]) => [startFrame + partStart, startFrame + partEnd]);
}

async function processOptions({ durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirRel }) {
  assert(durationTime || durationFramesIn, 'durationTime or durationFrames required');
  assert(reactVideo, 'reactVideo required');
  assert(!Number.isNaN(fps), 'Invalid fps');
  assert(!Number.isNaN(width) && !Number.isNaN(height), 'Invalid width/height');

  let durationFrames = durationFramesIn;
  if (durationTime) durationFrames = Math.round(durationTime * fps);

  const tempDir = resolvePath(tempDirRel);

  await mkdirp(tempDir);
  const distPath = join(tempDir, 'dist');
  const userEntryPath = resolvePath(reactVideo);

  return {
    durationFrames, tempDir, distPath, userEntryPath,
  };
}

function Editor({
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
  devMode = false,
  logger: loggerIn = console,
} = {}) {
  const bundleMode = devMode ? 'development' : 'production';

  const logger = loggerIn !== null ? loggerIn : { error: () => {}, warn: () => {}, info: () => {}, log: () => {}, debug: () => {}, trace: () => {} };

  async function tryStopBundleWatcher(bundler, watcher) {
    logger.log('Stopping bundle watcher');
    try {
      await stopBundleWatcher(bundler, watcher);
      logger.log('Bundle watcher stopped');
    } catch (err) {
      logger.error('Failed to stop bundle watcher', err);
    }
  }

  async function edit({
    headless = true,
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
    tempDir: tempDirRel = 'reactive-video-tmp',

    // Output video path
    output: desiredOutPath,

    rawOutput = true,

    frameRenderTimeout = 30000,
    failOnWebErrors = true,
    numRetries = 3,

    // Counts all frames in the final video and throws an error if there's a mismatch
    enableFrameCountCheck = false,

    showProgress = true,
    enableFfmpegLog = false,
    enablePerFrameLog = false,
    enableRequestLog = false,
  }) {
    assert(captureMethod !== 'extension' || !headless, 'Headless is not compatible with this captureMethod');

    const {
      durationFrames, tempDir, distPath, userEntryPath,
    } = await processOptions({
      durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirRel,
    });

    assert(durationFrames > 0);

    const isPhoto = durationFrames === 1;
    const concurrency = concurrencyIn > durationFrames ? durationFrames : concurrencyIn;

    let defaultOutPath;
    if (isPhoto) {
      if (puppeteerCaptureFormat === 'jpeg') defaultOutPath = 'reactive-video.jpg';
      else defaultOutPath = 'reactive-video.png';
    } else if (rawOutput) {
      if (puppeteerCaptureFormat === 'jpeg') defaultOutPath = 'reactive-video.mov'; // MJPEG
      else defaultOutPath = 'reactive-video.mkv'; // MPNG
    } else {
      defaultOutPath = 'reactive-video.mp4'; // h264
    }

    const parts = splitIntoParts({ startFrame, durationFrames, concurrency });

    const finalOutPath = desiredOutPath || defaultOutPath;

    const reactIndexPath = join(__dirname, 'puppeteerEntry.js');
    const reactHtmlDistName = 'index.html';
    const reactHtmlPath = join(__dirname, reactHtmlDistName);

    const bundler = createBundler({ entryPath: reactIndexPath, userEntryPath, outDir: distPath, mode: bundleMode });

    let stopServer;
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
        return createRenderer({ concurrency, captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, logger, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout });
      })();

      const [{ renderPart, terminateRenderers }] = await Promise.all([createRendererPromise, serverPromise, startBundlerPromise]);

      logger.log('Rendering frames');
      const partProgresses = {};
      let startTime;

      const renderers = parts.map((part, partNum) => {
        const partStart = part[0];
        const partEnd = part[1];

        function onProgress({ frameNum }) {
          if (!showProgress) return;
          partProgresses[partNum] = { frameNum: frameNum - partStart, durationFrames: partEnd - partStart };

          if (!startTime) {
            startTime = new Date();
            return;
          }

          const secondsSinceStart = ((new Date().getTime() - startTime.getTime()) / 1000);

          const totalFramesDone = Object.values(partProgresses).reduce((acc, { frameNum: frameNum2 }) => acc + frameNum2, 0);
          // logger.log(partProgresses, totalFramesDone, avgFps);
          if (secondsSinceStart > 0 && totalFramesDone % Math.ceil(fps) === 0) {
            const avgFps = totalFramesDone / secondsSinceStart;
            logger.log(
              'Progress', `${((totalFramesDone / durationFrames) * 100).toFixed(2)}%`,
              'FPS:', avgFps.toFixed(2),
              'Parts:', Object.entries(partProgresses).map(([n, { frameNum: frameNum2, durationFrames: durationFrames2 }]) => `${n}: ${((frameNum2 / durationFrames2) * 100).toFixed(2)}%`).join(', '),
            );
          }
        }

        return renderPart({ partNum, partStart, partEnd, onProgress });
      });

      const promises = renderers.map((renderer) => renderer.promise);
      let outPaths;
      try {
        outPaths = await Promise.all(promises);
      } catch (err) {
        if (renderers.length > 1) {
          logger.error('Caught error in one part, aborting the rest');
          renderers.forEach(({ abort }) => abort());
          await Promise.allSettled(promises); // wait for all renderers to close first
        }
        throw err;
      } finally {
        logger.log('Terminating renderer workers');
        await terminateRenderers();
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
    tempDir: tempDirRel = 'reactive-video-tmp',
  }) {
    const {
      durationFrames, distPath, userEntryPath,
    } = await processOptions({
      durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirRel,
    });

    const reactIndexPath = join(__dirname, 'previewEntry.js');
    const reactHtmlDistName = 'preview.html';
    const reactHtmlPath = join(__dirname, reactHtmlDistName);

    const secret = await generateSecret();

    const initData = { width, height, fps, serverPort: port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret };
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

  async function readVideoMetadata({ path, streamIndex = 0, countFrames = false }) {
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

module.exports = Editor;
