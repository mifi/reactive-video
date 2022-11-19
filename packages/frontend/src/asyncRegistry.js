import { useEffect } from 'react';

import { useVideo } from './contexts';

const framesDone = new Set();

let promises = [];

export async function awaitAsyncRenders(frameNumber) {
  // console.log('awaitAsyncRenders', promises.length)
  if (framesDone.has(frameNumber)) throw new Error(`Tried to awaitAsyncRenders already done frame ${frameNumber}`);
  try {
    return await Promise.all(promises);
  } finally {
    promises = [];
    framesDone.add(frameNumber);
  }
}

export function useAsyncRenderer(fn, deps, component) {
  const { video: { currentFrame } } = useVideo();

  // console.log('useAsyncRenderer', component, currentFrame)

  if (framesDone.has(currentFrame)) {
    throw new Error(`Tried to useAsyncRenderer already done frame ${currentFrame}`);
  }

  let resolve;
  let reject;

  // add promises immediately when calling the hook so we don't lose them
  promises.push(new Promise((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  }));

  let hasTriggeredAsyncEffect = false;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    hasTriggeredAsyncEffect = true;

    // allow returning an array with a cleanup function too
    const arrayOrPromise = fn();
    let cleanup;
    let promise;
    if (Array.isArray(arrayOrPromise)) {
      [, cleanup] = arrayOrPromise;
      promise = arrayOrPromise[0]();
    } else {
      promise = arrayOrPromise;
    }

    (async () => {
      try {
        // console.log('waiting for', component);
        await promise;
        // console.log('finishRender', component, currentFrame);
        resolve({ component, currentFrame });
      } catch (err) {
        // console.error('Render error for', component, currentFrame, err.message);
        reject(err);
      }
    })();

    return cleanup;
  }, deps);

  useEffect(() => {
    // if this render had no deps changes triggering the above useEffect, we need to just resolve the promise
    if (!hasTriggeredAsyncEffect) {
      resolve();
    }
  });
}
