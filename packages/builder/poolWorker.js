const fileUrl = require('file-url');
const puppeteer = require('puppeteer');
const { join } = require('path');
const pTimeout = require('p-timeout');
const log = require('debug')('reactive-video');
const workerpool = require('workerpool');

const { createExtensionFrameCapturer, captureFrameScreenshot, startScreencast } = require('./frameCapture');
const { createOutputFfmpeg } = require('./ffmpeg');

class PageBrokenError extends Error {}

function onProgress(progress) {
  workerpool.workerEmit({
    event: 'progress',
    data: progress,
  });
}

// creating a logging bridge over the worker channel
const logWithLevel = (level, ...args) => workerpool.workerEmit({ event: 'log', data: { level, args } });
const logger = Object.fromEntries(['log', 'info', 'debug', 'error', 'trace', 'warn'].map((fn) => [fn, (...args) => logWithLevel(fn, ...args)]));

async function createBrowser({ captureMethod, extensionPath, extraPuppeteerArgs, headless }) {
  const extensionId = 'jjndjgheafjngoipoacpjgeicjeomjli';

  const browser = await puppeteer.launch({
    args: [
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

      ...extraPuppeteerArgs,
    ],
    headless,
    // dumpio: true,
    // defaultViewport: null,
  });

  const context = await browser.createIncognitoBrowserContext();

  return {
    browser,
    context,
    extensionFrameCapturer: captureMethod === 'extension' && await createExtensionFrameCapturer(browser),
  };
}

async function renderPart({ captureMethod, headless, extraPuppeteerArgs, numRetries = 0, tempDir, extensionPath, puppeteerCaptureFormat, ffmpegPath, fps, enableFfmpegLog, width, height, devMode, port, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret, distPath, failOnWebErrors, sleepTimeBeforeCapture, frameRenderTimeout, partNum, partStart, partEnd }) {
  const renderId = partStart; // Unique ID per concurrent renderer

  let frameNum = partStart;

  let browser;
  let context;
  let page;
  let extensionFrameCapturer;
  let screencast;
  let onPageError;

  async function tryCreateBrowserAndPage() {
    onPageError = undefined;

    ({ browser, context, extensionFrameCapturer } = await createBrowser({ captureMethod, extensionPath, extraPuppeteerArgs, headless }));

    page = await context.newPage();

    page.on('console', (msg) => logger.log(`Part ${partNum},${frameNum} log`, msg.text()));
    page.on('pageerror', (err) => {
      if (onPageError) onPageError(new PageBrokenError(err.message));
      logger.warn(`Part ${partNum},${frameNum} page pageerror`, err);
    });
    page.on('error', (error) => {
      if (onPageError) onPageError(new PageBrokenError(error.toString()));
      logger.warn(`Part ${partNum},${frameNum} page error`, error && error.toString());
    });
    page.on('requestfailed', (request) => {
      // requestFailedError examples:
      // net::ERR_INSUFFICIENT_RESOURCES error can be reproduced on ubuntu (not mac) with a high concurrency (10)
      // net::ERR_FAILED is hard to reproduce, but it happened if an (inline?) svg failed to load
      const requestFailedErrorText = request.failure().errorText;
      if (onPageError) onPageError(new PageBrokenError(requestFailedErrorText));
      logger.warn(`Part ${partNum},${frameNum} page requestfailed`, requestFailedErrorText);
    });

    await page.setViewport({ width, height });
    // await page.setViewport({ width, height, deviceScaleFactor: 1 });

    // await page.goto(`http://localhost:${port}/index.html`);
    await page.goto(fileUrl(join(distPath, 'index.html')));

    if (await page.evaluate(() => !window.setupReact)) {
      throw new Error('React webpage failed to initialize');
    }

    await page.evaluate((params) => window.setupReact(params), { devMode, width, height, fps, serverPort: port, durationFrames, renderId, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret });

    screencast = captureMethod === 'screencast' && await startScreencast({ logger, format: puppeteerCaptureFormat, page, jpegQuality });
  }

  const awaitFatalError = () => new Promise((resolve, reject) => {
    onPageError = reject;
  });

  // Puppeteer/chromium is quite unreliable, and will crash for various reasons, but most importantly due to
  // net::ERR_INSUFFICIENT_RESOURCES or the page itself crashing.
  // https://stackoverflow.com/questions/57956697/unhandledpromiserejectionwarning-error-page-crashed-while-using-puppeteer
  async function withCrashRecovery(operation) {
    let lastErr;

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
          || (err && err.name === 'ProtocolError' && err.originalMessage === 'Unable to capture screenshot')
        )) throw err;

        logger.warn(`Part ${partNum},${frameNum} browser is broken, restarting`, err);

        try {
          await browser.close();
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

  let outProcess;

  try {
    const outPath = join(tempDir, `part ${partNum}-${partStart}-${partEnd}.mkv`);

    outProcess = createOutputFfmpeg({ outFormat: puppeteerCaptureFormat, ffmpegPath, fps, outPath, log: enableFfmpegLog });

    outProcess.on('exit', (code) => {
      logger.log('Output ffmpeg exited with code', code);
    });

    // eslint-disable-next-line no-inner-declarations
    async function renderFrame() {
      const logFrame = (...args) => log(frameNum, ...args);

      let buf;

      if (!browser) await tryCreateBrowserAndPage();

      await withCrashRecovery(async () => {
        // Clearing the canvas doesn't work well with html5 videos (need to reload the video every frame)
        // await page.evaluate(() => renderFrame());
        // await page.waitForSelector('#frame-cleared');

        logFrame('renderFrame');
        // eslint-disable-next-line no-shadow
        const errors = await page.evaluate(async (frameNum) => window.renderFrame(frameNum), frameNum);
        if (failOnWebErrors && errors.length > 0) throw new PageBrokenError(`Render frame error: ${errors.map((error) => error.message).join(', ')}`);
        else errors.forEach((error) => logger.warn('Web error', error));

        logFrame('waitForFonts');
        // Wait for fonts (fonts will have been loaded after page start, due to webpack imports from React components)
        await page.waitForFunction(async () => window.haveFontsLoaded());

        logFrame('waitForSelector');
        await page.waitForSelector(`#frame-${frameNum}`);

        logFrame('awaitDomRenderSettled');
        await page.evaluate(() => window.awaitDomRenderSettled());

        // See https://github.com/mifi/reactive-video/issues/4
        await page.waitForNetworkIdle({ idleTime: sleepTimeBeforeCapture });
        // await new Promise((resolve) => setTimeout(resolve, 500));

        logFrame('Capturing');

        // Implemented three different ways
        switch (captureMethod) {
          case 'screencast': buf = await screencast.captureFrame(frameNum); break;
          case 'extension': buf = await extensionFrameCapturer.captureFrame(); break;
          case 'screenshot': buf = await captureFrameScreenshot({ format: puppeteerCaptureFormat, page, jpegQuality }); break;
          default: throw new Error('Invalid captureMethod');
        }

        logFrame('Capture done');
      });

      // logger.log('data', opts);
      // fs.writeFile('lol.jpeg', buf);

      logFrame('Write frame');

      let mustDrain;
      const writePromise = new Promise((resolve, reject) => {
        // If we don't wait for cb, then we get EINVAL when dealing with high resolution files (big writes)

        // write returns: <boolean> false if the stream wishes for the calling code to wait for the 'drain' event to be emitted before continuing to write additional data; otherwise true.
        mustDrain = outProcess.stdin.write(buf, (err) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      });

      let drainPromise;
      if (mustDrain) {
        logFrame('Draining output stream');
        drainPromise = new Promise((resolve) => outProcess.stdin.once('drain', resolve));
      }
      await Promise.all([writePromise, drainPromise]);

      logFrame('Write frame done');
    }

    for (; frameNum < partEnd; frameNum += 1) {
      // eslint-disable-next-line no-await-in-loop
      await renderFrame();
      onProgress({ frameNum });
    }

    outProcess.stdin.end();
    await outProcess;
    return outPath;
  } catch (err) {
    if (outProcess) outProcess.kill();
    logger.error(`Caught error at frame ${frameNum}, part ${partNum} (${partStart})`, err);
    throw err;
  } finally {
    await browser.close();
  }
}

workerpool.worker({ renderPart });
