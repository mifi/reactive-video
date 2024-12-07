import puppeteer, { Browser, BrowserContext, CDPSession, Page } from 'puppeteer-core';
import { join } from 'node:path';
import pTimeout from 'p-timeout';
import workerpool from 'workerpool';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

import { CaptureMethod, FFmpegStreamFormat, PuppeteerCaptureFormat, VideoComponentType } from 'reactive-video/dist/types.js';

import type { SetupReact, RenderFrameFn, AwaitDomRenderSettled, HaveFontsLoaded } from './react/puppeteerEntry.js';

import { createExtensionFrameCapturer, captureFrameScreenshot, startScreencast } from './frameCapture.js';
import { createOutputFfmpeg } from './ffmpeg.js';
import { Logger } from './index.js';


// see also in puppeteerEntry
export const getFrameId = (frameNum: number) => `frame-${frameNum}`;

class PageBrokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageBrokenError';
  }
}

declare global {
  interface Window {
    setupReact?: SetupReact;
    renderFrame?: RenderFrameFn;
    haveFontsLoaded?: HaveFontsLoaded
    awaitDomRenderSettled?: AwaitDomRenderSettled
  }
}

export interface WorkerProgress {
  frameNum: number,
}

export type WorkerEvent = {
  event: 'progress',
  data: WorkerProgress
} | {
  event: 'log',
  data: { level: keyof Logger, args: unknown[] },
}

function onProgress(progress: WorkerProgress) {
  workerpool.workerEmit({
    event: 'progress',
    data: progress,
  } satisfies WorkerEvent);
}

async function createBrowser({ captureMethod, extensionPath, extraPuppeteerArgs, headless, tempDir, browserExePath }: {
  captureMethod: CaptureMethod,
  extensionPath: string,
  extraPuppeteerArgs: string[],
  headless: boolean,
  tempDir: string,
  browserExePath: string,
}) {
  const extensionId = 'jjndjgheafjngoipoacpjgeicjeomjli';

  // https://github.com/puppeteer/puppeteer/issues/10517
  const userDataDir = join(tempDir, `puppeteer_dev_chrome_profile-${randomBytes(10).toString('hex')}-`);
  await mkdir(userDataDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: browserExePath,
    userDataDir,

    // this is important, see https://github.com/mifi/reactive-video/issues/11
    ignoreDefaultArgs: ['--disable-dev-shm-usage'],

    args: [
      // https://stackoverflow.com/a/52070244/6519037
      '--incognito',

      ...(captureMethod === 'extension' ? [
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
        `--whitelisted-extension-id=${extensionId}`,
      ] : []),

      '--disable-web-security',

      // "--enable-usermedia-screen-capturing",
      // "--allow-http-screen-capture",

      // Or else on Mac we get 2x size video
      '--force-device-scale-factor=1',
      // '--start-maximized',
      // `--window-size=${width},${height}`,

      // These flags are not strictly needed:
      '--no-sandbox', // sandbox can sometimes cause issues on linux
      '--disable-setuid-sandbox',
      // '--single-process', // we are running one browser per page, so one would think there is no need for processes. however when running tight on resources (e.g. inside withCrashRecovery), it will cause the wholee browser creation to fail due to errors like Target closed
      '--disable-background-media-suspend',

      // inconsistent font rendering between macos and ubuntu
      // https://github.com/puppeteer/puppeteer/issues/661
      // https://github.com/puppeteer/puppeteer/issues/2410
      '--font-render-hinting=none',

      ...extraPuppeteerArgs,
    ],
    headless,
    // dumpio: true,
    // defaultViewport: null,
  });

  const context = await browser.createBrowserContext();

  return {
    browser,
    context,
    extensionFrameCapturer: captureMethod === 'extension' ? await createExtensionFrameCapturer(browser) : undefined,
  };
}

export interface RenderPartBaseParams {
  captureMethod: CaptureMethod,
  headless: boolean,
  extraPuppeteerArgs: string[],
  customOutputFfmpegArgs?: string[] | undefined,
  numRetries?: number | undefined,
  tempDir: string,
  extensionPath: string,
  puppeteerCaptureFormat: PuppeteerCaptureFormat,
  ffmpegPath: string,
  fps: number,
  enableFfmpegLog: boolean,
  enablePerFrameLog: boolean,
  width: number,
  height: number,
  devMode: boolean,
  port: number,
  durationFrames: number,
  userData: unknown,
  videoComponentType?: VideoComponentType | undefined,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality: number,
  secret: string,
  distPath: string,
  failOnWebErrors: boolean,
  sleepTimeBeforeCapture: number,
  frameRenderTimeout: number,
  browserExePath: string,
  keepBrowserRunning?: number | undefined,
}

export interface RenderPartParams extends RenderPartBaseParams {
  partNum: number,
  partStart: number,
  partEnd: number,
}

async function renderPart({ captureMethod, headless, extraPuppeteerArgs, customOutputFfmpegArgs, numRetries = 0, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, enablePerFrameLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, partNum, partStart, partEnd, browserExePath, keepBrowserRunning }: RenderPartParams) {
  const renderId = partStart; // Unique ID per concurrent renderer

  // state:
  let frameNum = partStart;

  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let client: CDPSession;
  let extensionFrameCapturer: { captureFrame: () => Promise<Buffer> } | undefined;
  let screencast: Awaited<ReturnType<typeof startScreencast>> | undefined;
  let onPageError: ((err: Error) => void) | undefined;

  // creating a logging bridge over the worker channel
  const logWithLevel = (level: keyof Logger, ...args: unknown[]) => workerpool.workerEmit({
    event: 'log',
    data: { level, args: [`P${partNum},${partStart} F${frameNum}/${partEnd}:`, ...args.map((arg) => (arg instanceof Error ? arg.message : arg))] },
  } satisfies WorkerEvent);

  const logger = {
    log: (...args: unknown[]) => logWithLevel('log', ...args),
    info: (...args: unknown[]) => logWithLevel('info', ...args),
    debug: (...args: unknown[]) => logWithLevel('debug', ...args),
    error: (...args: unknown[]) => logWithLevel('error', ...args),
    trace: (...args: unknown[]) => logWithLevel('trace', ...args),
    warn: (...args: unknown[]) => logWithLevel('warn', ...args),
  };

  async function closeBrowser() {
    if (browser && !keepBrowserRunning) {
      logger.debug('Closing browser pages');
      const pages = await browser.pages();
      // sometimes browser.close will hang
      // https://github.com/puppeteer/puppeteer/issues/7922#issuecomment-1549052725
      for (const p of pages) {
        await p.close();
      }
      logger.info('Closing browser');
      const t = setTimeout(() => {
        logger.warn('Timed out closing browser, killing it');
        browser.process()?.kill('SIGKILL');
      }, 10000);
      try {
        await browser.close();
        logger.info('Closed browser');
      } finally {
        clearTimeout(t);
      }
    }
  }

  async function tryCreateBrowserAndPage() {
    onPageError = undefined;

    logger.info('Creating browser', { partStart });

    ({ browser, context, extensionFrameCapturer } = await createBrowser({ captureMethod, extensionPath, extraPuppeteerArgs, headless, tempDir, browserExePath }));

    page = await context.newPage();
    client = await page.createCDPSession();

    // https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#consolemessagetype
    // log all in-page console logs as warn, for easier identification of any issues
    page.on('console', (msg) => logger.warn('Page console.log', msg.text()));
    page.on('pageerror', (err) => {
      logger.warn('Page pageerror', err);
      if (onPageError) onPageError(new PageBrokenError(err.message));
    });
    page.on('error', (error) => {
      logger.warn('Page error', error && error.toString());
      if (onPageError) onPageError(new PageBrokenError(error.toString()));
    });
    page.on('requestfailed', (request) => {
      // requestFailedError examples:
      // net::ERR_INSUFFICIENT_RESOURCES error can be reproduced on ubuntu (not mac) with a high concurrency (10)
      // net::ERR_FAILED is hard to reproduce, but it happened if an (inline?) svg failed to load
      const requestFailedErrorText = request.failure()!.errorText;
      logger.warn('Page requestfailed', requestFailedErrorText);
      if (onPageError) onPageError(new PageBrokenError(requestFailedErrorText));
    });

    await page.setViewport({ width, height });
    // await page.setViewport({ width, height, deviceScaleFactor: 1 });

    const url = pathToFileURL(join(distPath, 'index.html')).toString();
    logger.info('Navigating to', url);

    // await page.goto(`http://localhost:${port}/index.html`);
    await page.goto(url);

    if (await page.evaluate(() => !window.setupReact)) {
      throw new Error('React webpage failed to initialize');
    }

    await page.evaluate((params) => (
      window.setupReact!(params)
    ), { devMode, width, height, fps, serverPort: port, durationFrames, renderId, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret });

    screencast = captureMethod === 'screencast' ? await startScreencast({ logger, format: puppeteerCaptureFormat, page, jpegQuality }) : undefined;
  }

  const awaitFatalError = () => new Promise<void>((_resolve, reject) => {
    onPageError = reject;
  });

  // Puppeteer/chromium is quite unreliable, and will crash for various reasons, but most importantly due to
  // net::ERR_INSUFFICIENT_RESOURCES or the page itself crashing.
  // https://stackoverflow.com/questions/57956697/unhandledpromiserejectionwarning-error-page-crashed-while-using-puppeteer
  async function withCrashRecovery(operation: () => Promise<void>) {
    let lastErr: unknown;

    /* eslint-disable no-await-in-loop */
    for (let i = 0; i <= numRetries; i += 1) {
      try {
        const promise = Promise.race([operation(), awaitFatalError()]);
        return await pTimeout(promise, frameRenderTimeout, 'Frame render timed out');
      } catch (err) {
        lastErr = err;
        // name=ProtocolError, message=Protocol error (Page.captureScreenshot): Unable to capture screenshot, originalMessage=Unable to capture screenshot
        if (numRetries < 1 || !(
          err instanceof PageBrokenError
          || err instanceof pTimeout.TimeoutError
          || (err && err instanceof Error && 'name' in err && 'originalMessage' in err && err.name === 'ProtocolError' && err.originalMessage === 'Unable to capture screenshot')
        )) throw err;

        logger.warn('Browser is broken, restarting:', err);

        try {
          await closeBrowser();
        } catch (err2) {
          logger.warn('Failed to close browser', err2);
        }
        await tryCreateBrowserAndPage();
      }
    }
    /* eslint-enable no-await-in-loop */

    logger.error(`Failed to restart browser after ${numRetries} attempts`);
    throw lastErr;
  }

  let outProcess: ReturnType<typeof createOutputFfmpeg> | undefined;

  try {
    const outPath = join(tempDir, `part ${partNum}-${partStart}-${partEnd}.mkv`);

    outProcess = createOutputFfmpeg({ puppeteerCaptureFormat, customOutputFfmpegArgs, ffmpegPath, fps, outPath, log: enableFfmpegLog });

    outProcess.on('exit', (code) => {
      if (code !== 0) logger.log('Output ffmpeg exited with code', code);
    });

    // to prevent process from exiting if it dies (e.g. we .kill it)
    outProcess.catch((err) => {
      logger.log('Output ffmpeg failed', err);
    });

    // todo log stdout/stderr if outProcess crashes

    // eslint-disable-next-line no-inner-declarations
    async function renderFrame() {
      function logFrame(...args: unknown[]) {
        if (enablePerFrameLog) logger.debug(...args);
      }

      let buf: Buffer | undefined;

      await withCrashRecovery(async () => {
        // Clearing the canvas doesn't work well with html5 videos (need to reload the video every frame)
        // await page.evaluate(() => renderFrame());
        // await page.waitForSelector('#frame-cleared');

        logFrame('renderFrame');

        try {
          // eslint-disable-next-line no-shadow
          const results = await page.evaluate(async (frameNum) => window.renderFrame!(frameNum), frameNum);
          logFrame('renderFrame results', results);
        } catch (err) {
          if (failOnWebErrors) throw err;
        }

        logFrame('waitForFonts');
        // Wait for fonts (fonts will have been loaded after page start, due to webpack imports from React components)
        await page.waitForFunction(async () => (
          window.haveFontsLoaded!()
        ));

        logFrame('waitForSelector');
        await page.waitForSelector(`#${getFrameId(frameNum)}`);

        logFrame('awaitDomRenderSettled');
        await page.evaluate(() => window.awaitDomRenderSettled!());

        // See https://github.com/mifi/reactive-video/issues/4
        await page.waitForNetworkIdle({ idleTime: sleepTimeBeforeCapture });
        // await new Promise((resolve) => setTimeout(resolve, 500));

        logFrame('Capturing frame');

        // Implemented three different ways
        switch (captureMethod) {
          // eslint-disable-next-line unicorn/switch-case-braces
          case 'screencast': buf = await screencast!.captureFrame(frameNum); break;
          // eslint-disable-next-line unicorn/switch-case-braces
          case 'extension': buf = await extensionFrameCapturer!.captureFrame(); break;
          // eslint-disable-next-line unicorn/switch-case-braces
          case 'screenshot': buf = await captureFrameScreenshot({ format: puppeteerCaptureFormat, client, jpegQuality }); break;
          // eslint-disable-next-line unicorn/switch-case-braces
          default: throw new Error('Invalid captureMethod');
        }

        logFrame('Captured frame');
      });

      // logger.log('data', opts);
      // fs.writeFile('lol.jpeg', buf);

      logFrame('Write frame');

      // write returns: <boolean> false if the stream wishes for the calling code to wait for the 'drain' event to be emitted before continuing to write additional data; otherwise true.
      // If we don't wait for cb, then we get EINVAL when dealing with high resolution files (big writes)
      await new Promise<void>((resolve) => {
        if (!outProcess!.stdin!.write(buf)) {
          logFrame('Draining output stream');
          outProcess!.stdin!.once('drain', resolve);
        } else {
          resolve();
        }
      });

      logFrame('Write frame done');
    }

    await tryCreateBrowserAndPage();

    for (; frameNum < partEnd; frameNum += 1) {
      // eslint-disable-next-line no-await-in-loop
      await renderFrame();
      onProgress({ frameNum });
    }

    logger.info('Rendered frames, closing output ffmpeg stream and waiting for process to exit');
    outProcess.stdin?.end?.();
    await outProcess;
    logger.info('ffmpeg process exited');
    return outPath;
  } catch (err) {
    if (outProcess) outProcess.kill('SIGKILL');
    logger.error(`Caught error in renderPart (partStart ${partStart})`, err);
    throw err;
  } finally {
    await closeBrowser();
  }
}

workerpool.worker({ renderPart });
