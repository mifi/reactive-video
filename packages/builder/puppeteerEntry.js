import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';

// reactive-video-root-component is a webpack alias
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import { VideoContextProvider, setAsyncRenderDoneCb, anyAsyncRendersRegistered, Api } from 'reactive-video';
// import { setAsyncRenderDoneCb, anyAsyncRendersRegistered } from 'reactive-video/dist/asyncRegistry';
// import Api from 'reactive-video/dist/api';

const getId = (currentFrame) => `frame-${currentFrame}`;

const PuppeteerRoot = ({
  devMode, width, height, fps, serverPort, durationFrames, waitForAsyncRenders, renderId, userData, secret,
}) => {
  const [currentFrame, setCurrentFrame] = useState();

  // We need to set this immediately (synchronously) or we risk calling it before it has been set
  window.renderFrame = async (n) => {
    if (n == null) {
      setCurrentFrame(); // clear screen
      return [];
    }
    // const promise = tryElement(getId(n));
    setCurrentFrame(n);
    // await promise

    const promise = waitForAsyncRenders();

    // Need to wait for all components to register themselves
    // setTimeout 0 seems to work well (I'm guessing because all react components will get initialized in the same tick)
    await new Promise((resolve) => setTimeout(resolve, 0));
    // await new Promise((resolve) => window.requestAnimationFrame(resolve));
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    // If none were registered (e.g. just simple HTML), don't await
    if (anyAsyncRendersRegistered()) {
      return promise;
    }
    return [];
  };

  const api = useMemo(() => Api({ serverPort, renderId, secret }), [renderId, serverPort, secret]);

  // if (currentFrame == null) return <div id="frame-cleared" />;
  if (currentFrame == null) return null;

  // Allow the user to override?
  const videoComponentType = 'ffmpeg';

  const frameCanvasStyle = {
    width,
    height,
    overflow: 'hidden',
    position: 'relative',
  };

  // <div key={currentFrame} id={getId(currentFrame)}>
  return (
    <div id={getId(currentFrame)} style={frameCanvasStyle}>
      <VideoContextProvider
        currentFrame={currentFrame}
        durationFrames={durationFrames}
        width={width}
        height={height}
        fps={fps}
        api={api}
        userData={userData}
        videoComponentType={videoComponentType}
        isPuppeteer
      >
        {devMode && <div id="currentFrame" style={{ fontSize: 18, position: 'absolute', zIndex: 100, background: 'white' }}>{currentFrame} ID{renderId}</div>}

        <RootComponent />
      </VideoContextProvider>
    </div>
  );
};

window.setupReact = ({ devMode, width, height, fps, serverPort, durationFrames, renderId, userData, secret }) => {
  async function waitForAsyncRenders() {
    return new Promise((resolve) => {
      setAsyncRenderDoneCb((errors) => {
        // console.log('asyncRenderDoneCb');
        resolve(errors);
      });
    });
  }

  ReactDOM.render(<PuppeteerRoot devMode={devMode} width={width} height={height} fps={fps} serverPort={serverPort} durationFrames={durationFrames} waitForAsyncRenders={waitForAsyncRenders} renderId={renderId} userData={userData} secret={secret} />, document.getElementById('root'));
};

// This is a bit hacky. trying to make sure we don't get dup frames (previous frame rendered again)
// So we wait for the browser to completely finish rendering of all DOM updates that react have done
// https://stackoverflow.com/questions/15875128/is-there-element-rendered-event
// https://stackoverflow.com/questions/26556436/react-after-render-code
// Alternatively we could try to run requestAnimationFrame twice to skip the first frame
// Alternative2: callback from ReactDOM.render(element, container[, callback])
// https://reactjs.org/docs/react-dom.html#render
// Alternatively we could clear the screen between each frame render and detect that screenshot is not white (retry if it is)
// But the problem is that sometimes only parts of the scene will finish rendering (e.g. canvas/video will not yet update, but text etc will)
window.awaitDomRenderSettled = async () => new Promise((resolve) => {
  window.requestAnimationFrame(() => {
    setTimeout(() => {
      resolve();
    }, 0);
  });
});

// https://github.com/puppeteer/puppeteer/issues/422#issuecomment-708142856
window.haveFontsLoaded = async () => {
  const ready = await document.fonts.ready;
  return ready.status === 'loaded';
};
