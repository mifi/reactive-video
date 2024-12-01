import { useEffect } from 'react';

import { useVideo } from './contexts';

const framesDone = new Set<number | null>();

type ComponentName = string

let promises: Promise<{ component: ComponentName, currentFrame: number } | undefined>[] = [];

export async function awaitAsyncRenders(frameNumber: number | null) {
  // console.log('awaitAsyncRenders', promises.length)
  if (framesDone.has(frameNumber)) throw new Error(`Tried to awaitAsyncRenders already done frame ${frameNumber}`);
  try {
    return await Promise.all(promises);
  } finally {
    promises = [];
    framesDone.add(frameNumber);
  }
}

export function useAsyncRenderer(
  fn: () => Promise<void> | [() => Promise<void>, (() => void)],
  deps: unknown[],
  component: ComponentName,
) {
  const { video: { currentFrame } } = useVideo();

  // console.log('useAsyncRenderer', component, currentFrame)

  if (framesDone.has(currentFrame)) {
    throw new Error(`Tried to useAsyncRenderer already done frame ${currentFrame}`);
  }

  let resolve: (a: { component: ComponentName, currentFrame: number } | undefined) => void;
  let reject: (a: Error) => void;

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
    let promise: Promise<void>;
    if (Array.isArray(arrayOrPromise)) {
      const [fn2] = arrayOrPromise;
      [, cleanup] = arrayOrPromise;
      promise = fn2();
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
        reject(err instanceof Error ? err : new Error('An unknown error occurred'));
      }
    })();

    return cleanup;
  }, deps);

  useEffect(() => {
    // if this render had no deps changes triggering the above useEffect, we need to just resolve the promise
    if (!hasTriggeredAsyncEffect) {
      resolve(undefined);
    }
  });
}
