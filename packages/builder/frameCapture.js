const pTimeout = require('p-timeout');

// https://github.com/puppeteer/puppeteer/issues/478

// Alternative recording: MediaRecorder API (but only webm/mp4)

// https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-screencastFrame
// https://chromedevtools.github.io/devtools-protocol/tot/Page/#type-ScreencastFrameMetadata
// https://github.com/shaynet10/puppeteer-mass-screenshots/blob/main/index.js
// Very fast but needs synchronization
// Captures whole browser window
async function startScreencast(page) {
  const client = await page.target().createCDPSession();

  const options = {
    format: 'jpeg',
    quality: 100,
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
    // console.log(frameObject.metadata, frameObject.sessionId);

    try {
      onScreencastFrame(Buffer.from(frameObject.data, 'base64'));
      await client.send('Page.screencastFrameAck', { sessionId: frameObject.sessionId });

      // Sometimes it hangs if we start it only once, so restart for every frame
      // Also we avoid duplicates
      await client.send('Page.stopScreencast');
    } catch (err) {
      console.error('Page.screencastFrame', err);
    }
  });

  async function captureFrame(frameNum) {
    const numRetries = 5;
    const timeoutVal = 5000;

    // Sometimes we never receive the Page.screencastFrame event
    // This can sometimes be triggered on MacOS by doing Exposé
    for (let i = 0; i < numRetries; i += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await client.send('Page.startScreencast', options);
        // eslint-disable-next-line no-await-in-loop,no-loop-func
        const frame = await pTimeout(new Promise((resolve) => { screenCastFrameCb = resolve; }), timeoutVal, `Page.screencastFrame Timeout after ${timeoutVal}ms`);
        if (!frame) throw new Error('Empty frame');
        return frame;
      } catch (err) {
        console.error('captureFrame failed', frameNum, err);
        console.log('Retrying', i + 1);
        // eslint-disable-next-line no-await-in-loop
        await client.send('Page.stopScreencast');
      }
    }
    throw new Error(`No Page.screencastFrame after ${numRetries} retries`);
  }

  return { captureFrame };
}

// Works most reliably but it's slow
// Captures viewport only
async function captureFrameScreenshot(page) {
  // eslint-disable-next-line no-underscore-dangle
  const client = page._client;
  const { data } = await client.send('Page.captureScreenshot', {
    // format: 'png',
    format: 'jpeg',
    // quality: 0,
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
