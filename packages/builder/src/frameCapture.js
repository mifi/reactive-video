const pTimeout = require('p-timeout');

// https://github.com/puppeteer/puppeteer/issues/478

// Alternative recording: MediaRecorder API (but only webm/mp4)

// https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-screencastFrame
// https://chromedevtools.github.io/devtools-protocol/tot/Page/#type-ScreencastFrameMetadata
// https://github.com/shaynet10/puppeteer-mass-screenshots/blob/main/index.js
// Very fast but needs synchronization
// Captures whole browser window
async function startScreencast({ logger, format, page, jpegQuality }) {
  const client = await page.target().createCDPSession();

  const options = {
    format,
    quality: jpegQuality || undefined,
    // maxWidth: width,
    // maxHeight: height,
    everyNthFrame: 1,
  };
  // await client.send('Page.startScreencast', options);

  let screenCastFrameCb;
  // eslint-disable-next-line no-inner-declarations
  function onScreencastFrame(frame) {
    if (screenCastFrameCb) {
      screenCastFrameCb(frame);
      screenCastFrameCb = undefined;
    }
  }

  client.on('Page.screencastFrame', async (frameObject) => {
    // logger.log(frameObject.metadata, frameObject.sessionId);

    try {
      const buf = Buffer.from(frameObject.data, 'base64');
      await client.send('Page.screencastFrameAck', { sessionId: frameObject.sessionId });

      // Sometimes it hangs if we start it only once, so restart for every frame
      // Also we avoid duplicates
      await client.send('Page.stopScreencast');
      onScreencastFrame(buf);
    } catch (err) {
      logger.error('Page.screencastFrame', err);
    }
  });

  async function captureFrame(frameNum) {
    const numRetries = 5;
    const timeoutVal = 5000;

    // Sometimes we never receive the Page.screencastFrame event
    // This can sometimes be triggered on MacOS by doing Exposé
    for (let i = 0; i < numRetries; i += 1) {
      try {
        // eslint-disable-next-line no-loop-func
        const promise = new Promise((resolve) => { screenCastFrameCb = resolve; });
        // eslint-disable-next-line no-await-in-loop
        await client.send('Page.startScreencast', options);
        // eslint-disable-next-line no-await-in-loop
        const frame = await pTimeout(promise, timeoutVal, `Page.screencastFrame Timeout after ${timeoutVal}ms`);
        if (!frame) throw new Error('Empty frame');
        return frame;
      } catch (err) {
        logger.error('captureFrame failed', frameNum, err);
        logger.log('Retrying', i + 1);
        // eslint-disable-next-line no-await-in-loop
        await client.send('Page.stopScreencast');
      }
    }
    throw new Error(`No Page.screencastFrame after ${numRetries} retries`);
  }

  return { captureFrame };
}

// Alternative simpler implementation:
/*
async function startScreencast({ format, page, jpegQuality }) {
  const client = await page.target().createCDPSession();

  const options = {
    format,
    quality: jpegQuality || undefined,
    // maxWidth: width,
    // maxHeight: height,
    everyNthFrame: 1,
  };

  async function captureFrame() {
    return new Promise((resolve) => {
      client.once('Page.screencastFrame', async (frameObject) => {
        // logger.log('Page.screencastFrame');
        // logger.log(frameObject.metadata, frameObject.sessionId);

        if (!frameObject.data) throw new Error('No frame captured');

        const buf = Buffer.from(frameObject.data, 'base64');

        // I think acking before stopping will cause a slight slowdown
        // await client.send('Page.screencastFrameAck', { sessionId: frameObject.sessionId });
        await client.send('Page.stopScreencast', options);

        resolve(buf);
      });
      client.send('Page.startScreencast', options);
    });
  }

  return { captureFrame };
}
*/

// Works most reliably but it's slow
// Captures viewport only
async function captureFrameScreenshot({ format, client, jpegQuality }) {
  // eslint-disable-next-line no-underscore-dangle
  // https://github.com/puppeteer/puppeteer/blob/4d9dc8c0e613f22d4cdf237e8bd0b0da3c588edb/src/common/Page.ts#L2729
  const { data } = await client.send('Page.captureScreenshot', {
    format,
    quality: jpegQuality || undefined,
    // clip: undefined,
    // captureBeyondViewport: true,
  });
  return Buffer.from(data, 'base64');
}

// Fast but doesn't work in headless mode:
// Captures whole browser window
// https://github.com/puppeteer/puppeteer/issues/659
async function createExtensionFrameCapturer(browser) {
  const targets = browser.targets();
  const extensionTarget = targets.find(
    // eslint-disable-next-line no-underscore-dangle
    (target) => target.type() === 'background_page' && target._targetInfo.title === 'CaptureFrame',
  );

  const videoCaptureExtension = await extensionTarget.page();

  let onCapturedFrame;
  await videoCaptureExtension.exposeFunction('onCapturedFrame', (base64Data) => onCapturedFrame(base64Data));

  // eslint-disable-next-line no-inner-declarations
  async function captureFrame() {
    // eslint-disable-next-line no-loop-func
    const promise = new Promise((resolve) => {
      onCapturedFrame = resolve;
    });
    // eslint-disable-next-line no-await-in-loop
    await videoCaptureExtension.evaluate((opts) => captureFrame(opts), {});
    // eslint-disable-next-line no-await-in-loop
    const base64Data = await promise;
    if (!base64Data) throw new Error('Got no screenshot data');
    return Buffer.from(base64Data.replace(/^data:image\/(png|jpeg);base64,/, ''), 'base64');
  }

  return {
    captureFrame,
  };
}

module.exports = {
  createExtensionFrameCapturer,
  captureFrameScreenshot,
  startScreencast,
};
