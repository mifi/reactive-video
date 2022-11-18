let asyncRenderDoneCb;
let currentFrameNumber;

export function setAsyncRenderDoneCb(cb, n) {
  // console.log('setAsyncRenderDoneCb frameNum', n)
  asyncRenderDoneCb = cb;
  currentFrameNumber = n;
}

let asyncRenderCounter = 0;
function createAsyncRenderId() {
  const id = asyncRenderCounter;
  asyncRenderCounter += 1;
  return id;
}

let asyncRenders = [];
let unfinishedAsyncRenders = [];
let errors = [];
const readyToFinishFrame = new Map();

function finishRender(frameNumber) {
  // console.log('finishRender', frameNumber)
  const ret = { asyncRenders, errors };
  errors = [];
  asyncRenders = [];

  if (!window.isPuppeteer) return; // preview mode

  if (!asyncRenderDoneCb) throw new Error(`asyncRenderDoneCb was not registered - this is most likely a bug (frameNumber ${frameNumber})`);
  const cb = asyncRenderDoneCb;
  readyToFinishFrame.set(frameNumber, false);
  setAsyncRenderDoneCb();
  cb(ret);
}

export function checkForEmptyAsyncRenderers() {
  // console.log('checkForEmptyAsyncRenderers frame', currentFrameNumber, unfinishedAsyncRenders.length);
  readyToFinishFrame.set(currentFrameNumber, true);
  // If none were registered by now, (e.g. just simple HTML), there's nothing to wait for
  if (unfinishedAsyncRenders.length === 0 && asyncRenderDoneCb) finishRender(currentFrameNumber);
}

export function waitFor(fnOrPromise, component) {
  const waitingForFrameNumber = currentFrameNumber;

  const id = createAsyncRenderId();
  // console.log('createAsyncRenderId', component, id)

  const obj = { component, id };
  asyncRenders.push(obj);
  unfinishedAsyncRenders.push(obj);

  (async () => {
    try {
      // console.log('waiting for', component, id);
      await (typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise);
    } catch (err) {
      // console.error('Render error for', component, id, err.message);
      errors.push({ component, id, message: err.message });
    } finally {
      // console.log('finishRender', component, id, 'unfinishedAsyncRenders:', unfinishedAsyncRenders.map((r) => r.id).join(','));
      unfinishedAsyncRenders = unfinishedAsyncRenders.filter((r) => r.id !== id);
      if (unfinishedAsyncRenders.length === 0) {
        if (readyToFinishFrame.get(waitingForFrameNumber)) finishRender(waitingForFrameNumber);
        // else console.warn('readyForFinish was false', component, id, waitingForFrameNumber);
      }
    }
  })();
}
