const fileUrl = require('file-url');
const puppeteer = require('puppeteer');
const { join, resolve: resolvePath } = require('path');
const hasha = require('hasha');
const { copyFile } = require('fs').promises;
const { mkdirp } = require('fs-extra');
const assert = require('assert');
const crypto = require('crypto');
const { promisify } = require('util');
const pTimeout = require('p-timeout');
const log = require('debug')('reactive-video');

const { concatParts, createOutputFfmpeg } = require('./ffmpeg');

const { readVideoFormatMetadata, readVideoStreamsMetadata, readDurationFrames } = require('./videoServer');
const { serve } = require('./server');
const { createBundler } = require('./bundler');

const { createExtensionFrameCapturer, captureFrameScreenshot, startScreencast } = require('./frameCapture');

const randomBytes = promisify(crypto.randomBytes);

async function generateSecret() {
  return (await randomBytes(32)).toString('base64');
}

async function startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath }) {
  return new Promise((resolve, reject) => {
    const watcher = bundler.watch({}, (err, stats) => {
      if (err) {
        reject(err);
        watcher.close();
        return;
      }
      if (stats.hasErrors()) {
        console.error(stats.toString());
        watcher.close();
        reject(new Error('Bundle failed'));
        return;
      }

      (async () => {
        try {
          await copyFile(reactHtmlPath, join(distPath, reactHtmlDistName));
          resolve(watcher);
        } catch (err2) {
          watcher.close();
          reject(err2);
        }
      })();
    });
  });
}

async function stopBundleWatcher(bundler, watcher) {
  console.log('Stopping bundle watcher');
  try {
    await new Promise((resolve, reject) => watcher.close((err) => {
      if (err) reject(err);
      else resolve();
    }));

    await new Promise((resolve, reject) => bundler.close((err) => {
      if (err) reject(err);
      else resolve();
    }));
    console.log('Bundle watcher stopped');
  } catch (err) {
    console.error(err);
  }
}

function splitIntoParts(durationFrames, concurrency) {
  const partLength = Math.floor(durationFrames / concurrency);
  const parts = Array(concurrency).fill().map((v, i) => [i * partLength, (i + 1) * partLength]);
  const remainder = durationFrames % concurrency;
  if (remainder > 0) parts[parts.length - 1][1] += remainder;
  return parts;
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
} = {}) {
  const bundleMode = devMode ? 'development' : 'production';

  async function edit({
    headless = true,
    autoCloseBrowser = true,
    width = 800,
    height = 600,
    fps = 30,
    userData,
    concurrency = 2,

    captureMethod = 'screencast',

    frameRenderTimeout = 30000,

    durationFrames: durationFramesIn,
    durationTime,

    reactVideo,
    tempDir: tempDirRel = 'reactive-video-tmp',

    // Output video path
    output: finalOutPath = 'reactive-video.mp4',

    rawOutput = false,

    failOnWebErrors = true,

    // Counts all frames in the final video and throws an error if there's a mismatch
    enableFrameCountCheck = false,

    // Can be enabled to throw an error if any two sequential frames are the same (note that in some videos this is actually valid)
    enableHashCheck = false,

    showProgress = true,
    enableFfmpegLog = false,
  }) {
    assert(captureMethod !== 'extension' || !headless, 'Headless is not compatible with this captureMethod');

    const {
      durationFrames, tempDir, distPath, userEntryPath,
    } = await processOptions({
      durationTime, durationFramesIn, reactVideo, fps, width, height, tempDirRel,
    });

    const frameHashes = {};

    const reactIndexPath = join(__dirname, 'puppeteerEntry.js');
    const reactHtmlDistName = 'index.html';
    const reactHtmlPath = join(__dirname, reactHtmlDistName);

    const bundler = createBundler({ entryPath: reactIndexPath, userEntryPath, outDir: distPath, mode: bundleMode });

    let browser;
    let stopServer;
    let watcher;

    try {
      console.log('Compiling Reactive Video Javascript');
      watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });

      const secret = await generateSecret();

      console.log('Starting server');
      // const server = await serve({ ffmpegPath, ffprobePath, serveStaticPath: distPath });
      const server = await serve({ ffmpegPath, ffprobePath, secret });
      stopServer = server.stop;
      const { port } = server;

      const extensionPath = join(__dirname, 'extension');
      const extensionId = 'jjndjgheafjngoipoacpjgeicjeomjli';

      console.log('Launching puppeteer');

      browser = await puppeteer.launch({
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
        ],
        headless,
        // defaultViewport: null,
      });

      const extensionFrameCapturer = captureMethod === 'extension' && await createExtensionFrameCapturer(browser);

      // eslint-disable-next-line no-inner-declarations
      function renderPart({ partNum, partStart, partEnd, onProgress }) {
        let aborted = false;

        let frameNum = partStart;

        const promise = (async () => {
          const renderId = partStart; // Unique ID per concurrent renderer

          let outProcess;

          try {
            const outPath = join(tempDir, `part ${partNum}-${partStart}-${partEnd}.mkv`);

            outProcess = createOutputFfmpeg({ ffmpegPath, fps, outPath, log: enableFfmpegLog });

            outProcess.on('exit', (code) => {
              console.log('Output ffmpeg exited with code', code);
            });

            const page = await browser.newPage();

            await page.setViewport({ width, height });
            // await page.setViewport({ width, height, deviceScaleFactor: 1 });

            // await page.goto(`http://localhost:${port}/index.html`);
            await page.goto(fileUrl(join(distPath, 'index.html')));

            if (await page.evaluate(() => !window.setupReact)) {
              throw new Error('React webpage failed to initialize');
            }

            await page.evaluate((params) => window.setupReact(params), { devMode, width, height, fps, serverPort: port, durationFrames, renderId, userData, secret });

            const screencast = captureMethod === 'screencast' && await startScreencast(page);

            // eslint-disable-next-line no-inner-declarations
            async function renderFrame() {
              // Clearing the canvas doesn't work well with html5 videos (need to reload the video every frame)
              // await page.evaluate(() => renderFrame());
              // await page.waitForSelector('#frame-cleared');

              log('renderFrame', frameNum);
              // eslint-disable-next-line no-shadow
              const errors = await page.evaluate(async (frameNum) => window.renderFrame(frameNum), frameNum);
              if (failOnWebErrors) throw new Error(`Render frame error: ${errors.map((error) => error.message).join(', ')}`);
              else errors.forEach((error) => console.warn('Web error', error));

              log('waitForFonts');
              // Wait for fonts (fonts will have been loaded after page start, due to webpack imports from React components)
              await page.waitForFunction(async () => window.haveFontsLoaded());

              log('waitForSelector');
              await page.waitForSelector(`#frame-${frameNum}`);
              log('awaitDomRenderSettled');
              await page.evaluate(() => window.awaitDomRenderSettled());

              // await new Promise((resolve) => setTimeout(resolve, 2000));

              log('Capturing');

              // Implemented three different ways
              let buf;
              switch (captureMethod) {
                case 'screencast': buf = await screencast.captureFrame(frameNum); break;
                case 'extension': buf = await extensionFrameCapturer.captureFrame(frameNum); break;
                case 'screenshot': buf = await captureFrameScreenshot(page, frameNum); break;
                default: throw new Error('Invalid captureMethod');
              }

              log('Capture done');

              if (enableHashCheck) frameHashes[frameNum] = await hasha(buf);

              // console.log('data', opts);
              // fs.writeFile('lol.jpeg', buf);

              // const mustDrain = await new Promise((resolve) => {
              await new Promise((resolve) => {
                // If we don't wait for cb, then we get EINVAL when dealing with high resolution files (big writes)
                const ret = outProcess.stdin.write(buf, () => {
                  resolve(!ret);
                });
              });

              // write returns: <boolean> false if the stream wishes for the calling code to wait for the 'drain' event to be emitted before continuing to write additional data; otherwise true.
              // However it seems like it hangs sometimes if we wait for drain...
              /* if (mustDrain) {
                log('Draining output stream');
                await new Promise((resolve) => outProcess.stdin.once('drain', resolve));
              } */
            }

            for (; frameNum < partEnd; frameNum += 1) {
              // eslint-disable-next-line no-await-in-loop
              await pTimeout(renderFrame(), frameRenderTimeout, 'Frame render timed out');

              if (aborted) throw new Error('Aborted');

              onProgress({ frameNum });
            }

            outProcess.stdin.end();
            return outPath;
          } catch (err) {
            if (outProcess) outProcess.kill();
            console.error(`Caught error at frame ${frameNum}, part ${partNum} (${partStart})`, err);
            throw err;
          }
        })();

        function abort() {
          aborted = true;
        }
        return { promise, abort };
      }

      const parts = splitIntoParts(durationFrames, concurrency);

      console.log(`Rendering with concurrency ${concurrency}`);

      const partProgresses = {};
      let totalFramesDone = 0;
      const startTime = new Date();

      const renderers = parts.map((part, partNum) => {
        const partStart = part[0];
        const partEnd = part[1];

        function onProgress({ frameNum }) {
          if (!showProgress) return;
          partProgresses[partNum] = { frameNum: frameNum - partStart, durationFrames: partEnd - partStart };
          totalFramesDone = Object.values(partProgresses).reduce((acc, { frameNum: frameNum2 }) => acc + frameNum2, 0);
          const avgFps = totalFramesDone / ((new Date().getTime() - startTime.getTime()) / 1000);
          // console.log(partProgresses, totalProgress, avgFps)
          if (totalFramesDone % fps === 0) {
            console.log(
              'Progress', `${((totalFramesDone / durationFrames) * 100).toFixed(2)}%`,
              'FPS:', avgFps.toFixed(2),
              'Parts:', Object.entries(partProgresses).map(([n, { frameNum: frameNum2, durationFrames: durationFrames2 }]) => `${n}: ${((frameNum2 / durationFrames2) * 100).toFixed(2)}%`).join(', '),
            );
          }
        }

        return (
          renderPart({ partNum, partStart, partEnd, onProgress })
        );
      });

      const promises = renderers.map((r) => r.promise);
      let outPaths;
      try {
        outPaths = await Promise.all(promises);
      } catch (err) {
        if (renderers.length > 1) {
          console.log('Caught error in one part, aborting the rest');
          renderers.forEach((r) => r.abort());
          await Promise.allSettled(promises);
        }
        throw err;
      }

      if (enableHashCheck) {
        for (let i = 0; i < durationFrames; i += 1) {
          if (i > 0 && frameHashes[i - 1] === frameHashes[i]) {
            throw new Error(`Duplicate frames ${i - 1} and ${i}`);
          }
        }
      }

      console.log('Merging parts');
      const concatFilePath = join(tempDir, 'concat.txt');
      await concatParts({ ffmpegPath, paths: outPaths, concatFilePath, finalOutPath, remuxOnly: rawOutput });

      if (enableFrameCountCheck) {
        const actualDurationFrames = await readDurationFrames({ ffprobePath, path: finalOutPath });
        assert.strictEqual(actualDurationFrames, durationFrames);
      }
    } finally {
      if (browser && autoCloseBrowser) await browser.close();
      if (stopServer) stopServer();
      if (watcher) stopBundleWatcher(bundler, watcher);
    }

    console.log('Edit finished:', finalOutPath);
  }

  async function preview({
    width = 800,
    height = 600,
    fps = 30,
    port = 3000,
    userData,

    videoComponentType = 'ffmpeg',

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

    const bundler = createBundler({ entryPath: reactIndexPath, userEntryPath, outDir: distPath, mode: bundleMode, entryOutName: 'preview.js' });

    console.log('Compiling Reactive Video Javascript');
    const watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });

    const secret = await generateSecret();

    const serveRoot = videoComponentType === 'html-proxied';
    console.warn('Warning: Serving filesystem root');
    const server = await serve({ ffmpegPath, ffprobePath, serveStaticPath: distPath, serveRoot, port, secret });
    const { stop: stopServer } = server;

    const params = { devMode, width, height, fps, serverPort: port, durationFrames, userData: userData && JSON.stringify(userData), videoComponentType, secret };
    const qs = Object.entries(params).filter(([, value]) => value).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
    console.log(`http://localhost:${port}/preview.html?${qs}`);

    let sig = false;
    process.on('SIGINT', () => {
      if (sig) process.exit(1);
      console.log('Caught SIGINT, shutting down');
      sig = true;
      stopServer();
      stopBundleWatcher(bundler, watcher);
    });
  }

  async function readVideoMetadata({ path, streamIndex = 0 }) {
    const { width, height, fps } = await readVideoStreamsMetadata({ ffprobePath, path, streamIndex });
    const { duration } = await readVideoFormatMetadata({ ffprobePath, path });
    return { width, height, fps, duration };
  }

  return {
    edit,
    readVideoMetadata,
    preview,
  };
}

module.exports = Editor;
