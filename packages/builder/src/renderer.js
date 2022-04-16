const { join } = require('path');
const workerpool = require('workerpool');

module.exports = async ({ concurrency, captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, logger, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout }) => {
  const workerType = 'process';
  const pool = workerpool.pool(join(__dirname, '/poolWorker.js'), { maxWorkers: concurrency, minWorkers: concurrency, maxQueueSize: 0, workerType });

  function renderPart({ partNum, partStart, partEnd, onProgress }) {
    const task = pool.exec(
      'renderPart',
      [{ concurrency, captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, partNum, partStart, partEnd }], {
        on: ({ event, data }) => {
          if (event === 'progress') {
            onProgress(data);
          } else if (event === 'log') {
            logger[data.level](...data.args);
          }
        },
      },
    );

    const abort = () => task.cancel();

    return { promise: task, abort };
  }

  const terminateRenderers = async () => pool.terminate();

  return {
    renderPart,
    terminateRenderers,
  };
};
