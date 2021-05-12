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
let errors = [];

export function anyAsyncRendersRegistered() {
  return asyncRenders.length > 0;
}

export const useAsyncRenderer = () => {
  // const ref = useRef(createAsyncRenderId());

  const ret = useMemo(() => {
    const id = createAsyncRenderId();

    function finishRenderOperation() {
      if (!anyAsyncRendersRegistered()) {
        const allErrors = errors;
        errors = [];
        if (asyncRenderDoneCb) {
          const cb = asyncRenderDoneCb;
          setAsyncRenderDoneCb(undefined);
          cb(allErrors);
        }
      }
    }

    function waitFor(fnOrPromise, component) {
      asyncRenders.push(fnOrPromise);
      (async () => {
        try {
          await (typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise);
        } catch (err) {
          // console.error('Render error for', component, id, err);
          errors.push({ component, id, message: err.message });
        } finally {
          // console.log('finishRender', id);
          asyncRenders = asyncRenders.filter((r) => r !== fnOrPromise);
          finishRenderOperation();
        }
      })();
    }

    return {
      waitFor,
    };
  }, []);

  return ret;
};
