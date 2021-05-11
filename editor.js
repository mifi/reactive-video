const fileUrl = require('file-url');
const puppeteer = require('puppeteer');
const { join, resolve: resolvePath } = require('path');
const hasha = require('hasha');
const { copyFile } = require('fs').promises;
const { mkdirp } = require('fs-extra');
const assert = require('assert');
const { concatParts, createOutputFfmpeg } = require('./ffmpeg');

const { readVideoFormatMetadata, readVideoStreamsMetadata, readDurationFrames } = require('./videoServer');
const { serve } = require('./server');
const { createBundler } = require('./bundler');

const { createExtensionFrameCapturer, captureFrameScreenshot, startScreencast } = require('./frameCapture');

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

function getParts(durationFrames, concurrency) {
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

    captureType = 'screencast',

    frameRenderTimeout = 30000,

    durationFrames: durationFramesIn,
    durationTime,

    reactVideo,
    tempDir: tempDirRel = 'reactive-video-tmp',

    // Output video path
    output: finalOutPath = 'reactive-video.mp4',

    rawOutput = false,

    // Counts all frames in the final video and throws an error if there's a mismatch
    enableFrameCountCheck = false,

    // Can be enabled to throw an error if any two sequential frames are the same (note that in some videos this is actually valid)
    enableHashCheck = false,

    debug = false,
  }) {
    assert(captureType !== 'extension' || !headless, 'Headless is not compatible with this captureType');

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
      console.log('Compiling');
      watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });

      // TODO security issue? can cd ..?
      // const server = await serve({ ffmpegPath, ffprobePath, serveStaticPath: distPath });
      const server = await serve({ ffmpegPath, ffprobePath });
      stopServer = server.stop;
      const { port } = server;

      const extensionPath = join(__dirname, 'extension');
      const extensionId = 'jjndjgheafjngoipoacpjgeicjeomjli';

      browser = await puppeteer.launch({
        args: [
          ...(captureType === 'extension' ? [
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

      const extensionFrameCapturer = captureType === 'extension' && await createExtensionFrameCapturer(browser);

      // eslint-disable-next-line no-inner-declarations
      function renderPart({ partStart, partEnd }) {
        let aborted = false;

        const promise = (async () => {
          const renderId = partStart;

          let outProcess;

          try {
            const outPath = join(tempDir, `part-${partStart}.mkv`);

            outProcess = createOutputFfmpeg({ ffmpegPath, fps, outPath, debug });

            outProcess.on('exit', (code) => {
              console.log('Output ffmpeg exited with code', code);
            });

            const page = await browser.newPage();

            await page.setViewport({ width, height });
            // await page.setViewport({ width, height, deviceScaleFactor: 1 });

            // await page.goto(`http://localhost:${port}/index.html`);
            await page.goto(fileUrl(join(distPath, 'index.html')));

            await page.evaluate((params) => window.setupReact(params), { devMode, width, height, fps, serverPort: port, durationFrames, renderId, userData });

            const screencast = captureType === 'screencast' && await startScreencast(page);

            let timeoutTimer;
            /* eslint-disable no-await-in-loop */
            for (let i = partStart; i < partEnd; i += 1) {
              try {
                await Promise.race([
                  // eslint-disable-next-line no-loop-func
                  new Promise((resolve, reject) => {
                    timeoutTimer = setTimeout(() => reject(new Error(`Frame render timed out for part starting at ${partStart}`)), frameRenderTimeout);
                  }),
                  (async () => {
                    // Clearing the canvas doesn't work well with html5 videos (need to reload the video every frame)
                    // await page.evaluate(() => renderFrame());
                    // await page.waitForSelector('#frame-cleared');

                    console.log('renderFrame', i);
                    // eslint-disable-next-line no-shadow
                    await page.evaluate((i) => window.renderFrame(i), i);

                    console.log('waitForFonts');
                    // Wait for fonts (fonts will have been loaded after page start, due to webpack imports from React components)
                    await page.waitForFunction(async () => window.haveFontsLoaded());

                    console.log('waitForSelector');
                    await page.waitForSelector(`#frame-${i}`);
                    console.log('awaitDomRenderSettled');
                    await page.evaluate(() => window.awaitDomRenderSettled());

                    // await new Promise((resolve) => setTimeout(resolve, 2000));

                    console.log('Capturing');

                    // Implemented three different ways
                    let buf;
                    switch (captureType) {
                      case 'screencast': buf = await screencast.captureFrame(); break;
                      case 'extension': buf = await extensionFrameCapturer.captureFrame(); break;
                      case 'screenshot': buf = await captureFrameScreenshot(page); break;
                      default: throw new Error('Invalid captureType');
                    }

                    console.log('Capture done');

                    if (enableHashCheck) frameHashes[i] = await hasha(buf);

                    // console.log('data', opts);
                    // fs.writeFile('lol.jpeg', buf);

                    // If we don't wait, then we get EINVAL when dealing with high resolution files (big writes)
                    await new Promise((r) => outProcess.stdin.write(buf, r));
                  })(),
                ]);
                if (aborted) throw new Error('Aborted');
              } finally {
                if (timeoutTimer) clearTimeout(timeoutTimer);
                timeoutTimer = undefined;
              }
            }

            outProcess.stdin.end();
            return outPath;
          } catch (err) {
            if (outProcess) outProcess.kill();
            throw err;
          }
        })();

        function abort() {
          aborted = true;
        }
        return { promise, abort };
      }

      const parts = getParts(durationFrames, concurrency);

      console.log(`Rendering with concurrency ${concurrency}`);

      const renderers = parts.map((part) => (
        renderPart({ partStart: part[0], partEnd: part[1] })
      ));
      const promises = renderers.map((r) => r.promise);
      let outPaths;
      try {
        outPaths = await Promise.all(promises);
      } catch (err) {
        if (renderers.length > 1) {
          console.log('Aborting parts');
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

    console.log('Compiling');
    const watcher = await startBundler({ bundler, reactHtmlPath, reactHtmlDistName, distPath });

    // TODO security issue? can cd ..?
    const server = await serve({ ffmpegPath, ffprobePath, serveStaticPath: distPath, port });
    const { stop: stopServer } = server;

    const params = { devMode, width, height, fps, serverPort: port, durationFrames, userData: userData && JSON.stringify(userData) };
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
