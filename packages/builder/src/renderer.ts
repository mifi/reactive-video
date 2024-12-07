import { CaptureMethod } from 'reactive-video/dist/types.js';
import { fileURLToPath } from 'node:url';

import workerpool from 'workerpool';

import type { RenderPartBaseParams, RenderPartParams, WorkerEvent, WorkerProgress } from './poolWorker.js';
import { type Logger } from './index.js';

export default async ({ concurrency, captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, logger, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, browserExePath, keepBrowserRunning }: RenderPartBaseParams & {
  concurrency: number,
  captureMethod: CaptureMethod,
  headless: boolean,
  logger: Logger,
}) => {
  const workerType = 'process';
  const pool = workerpool.pool(fileURLToPath(new URL('poolWorker.js', import.meta.url)), { maxWorkers: concurrency, minWorkers: concurrency, maxQueueSize: 0, workerType });

  function renderPart({ partNum, partStart, partEnd, onProgress }: {
    partNum: number,
    partStart: number,
    partEnd: number,
    onProgress: (p: WorkerProgress) => void,
  }) {
    const task = pool.exec(
      'renderPart',
      [{ captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, partNum, partStart, partEnd, browserExePath, keepBrowserRunning } satisfies RenderPartParams],
      {
        on: ({ event, data }: WorkerEvent) => {
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
