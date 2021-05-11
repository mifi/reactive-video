import React, { useMemo, useContext } from 'react';
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import { VideoContext } from './contexts';

const getId = (currentFrame) => `frame-${currentFrame}`;

let userData;

export function setUserData(d) {
  userData = d;
}

export const Main = ({
  devMode, width, height, fps, serverPort, durationFrames, currentFrame, renderId,
}) => {
  const videoContext = useMemo(() => {
    const getFrameTime = (f) => f / fps;
    const currentTime = getFrameTime(currentFrame);
    const durationTime = getFrameTime(durationFrames);

    const baseUrl = `http://localhost:${serverPort}`;

    async function readVideoFrame(params) {
      return fetch(`${baseUrl}/api/read-frame`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...params, renderId }) });
    }

    async function readVideoMetadata({ path, streamIndex }) {
      return fetch(`${baseUrl}/api/read-video-metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, streamIndex }) });
    }

    return {
      currentFrame,
      currentTime,
      durationFrames,
      durationTime,

      // Global, never altered:
      video: {
        currentFrame,
        currentTime,
        durationFrames,
        durationTime,
      },

      fps,
      width,
      height,

      getFrameTime,

      userData,

      api: {
        readVideoFrame,
        readVideoMetadata,
      },
    };
  }, [currentFrame, serverPort, durationFrames, fps, height, width, renderId]);

  // if (currentFrame == null) return <div id="frame-cleared" />;
  if (currentFrame == null) return null;

  const frameCanvasStyle = {
    width,
    height,
    overflow: 'hidden',
    position: 'relative',
  };

  // <div key={currentFrame} id={getId(currentFrame)}>
  return (
    <div id={getId(currentFrame)} style={frameCanvasStyle}>
      <VideoContext.Provider value={videoContext}>
        {devMode && <div id="currentFrame" style={{ fontSize: 18, position: 'absolute', zIndex: 100, background: 'white' }}>{currentFrame} ID{renderId}</div>}

        <RootComponent />
      </VideoContext.Provider>
    </div>
  );
};

export const useVideo = () => useContext(VideoContext);

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

export function anyAsyncRendersRegistered() {
  return asyncRenders.length > 0;
}

// eslint-disable-next-line import/prefer-default-export
export const useAsyncRenderer = () => {
  // const ref = useRef(createAsyncRenderId());

  const ret = useMemo(() => {
    const id = createAsyncRenderId();

    function finishRenderOperation() {
      if (!anyAsyncRendersRegistered()) {
        if (asyncRenderDoneCb) {
          const cb = asyncRenderDoneCb;
          setAsyncRenderDoneCb(undefined);
          cb();
        }
      }
    }

    function waitFor(fnOrPromise, name) {
      asyncRenders.push(fnOrPromise);
      (async () => {
        try {
          await (typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise);
        } catch (err) {
          console.error('Render error for', name, id, err);
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
