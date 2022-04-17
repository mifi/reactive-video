import { useMemo } from 'react';

let asyncRenderDoneCb;

export function setAsyncRenderDoneCb(cb) {
  asyncRenderDoneCb = cb;
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

function finishRender() {
  const allErrors = errors;
  const allAsyncRenders = asyncRenders;
  errors = [];
  asyncRenders = [];

  if (!window.isPuppeteer) return; // preview mode

  if (!asyncRenderDoneCb) throw new Error('asyncRenderDoneCb was not registered - this is most likely a bug');
  const cb = asyncRenderDoneCb;
  setAsyncRenderDoneCb(undefined);
  cb({ asyncRenders: allAsyncRenders, errors: allErrors });
}

export function checkForEmptyAsyncRenderers() {
  // If none were registered by now, (e.g. just simple HTML), there's nothing to wait for
  if (asyncRenders.length === 0 && asyncRenderDoneCb) finishRender();
}

export const useAsyncRenderer = () => {
  // const ref = useRef(createAsyncRenderId());

  const ret = useMemo(() => {
    const id = createAsyncRenderId();

    function waitFor(fnOrPromise, component) {
      asyncRenders.push({ component, id });
      unfinishedAsyncRenders.push(fnOrPromise);
      (async () => {
        try {
          await (typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise);
        } catch (err) {
          // console.error('Render error for', component, id, err);
          errors.push({ component, id, message: err.message });
        } finally {
          // console.log('finishRender', id);
          unfinishedAsyncRenders = unfinishedAsyncRenders.filter((r) => r !== fnOrPromise);
          if (unfinishedAsyncRenders.length === 0) finishRender();
        }
      })();
    }

    return {
      waitFor,
    };
  }, []);

  return ret;
};
