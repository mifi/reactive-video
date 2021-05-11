import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';

import { Main, setAsyncRenderDoneCb, anyAsyncRendersRegistered, setUserData } from './entry';

const PuppeteerRenderer = ({
  devMode, width, height, fps, serverPort, durationFrames, waitForAsyncRenders, renderId,
}) => {
  const [currentFrame, setCurrentFrame] = useState();

  useEffect(() => {
    window.renderFrame = async (n) => {
      if (n == null) {
        setCurrentFrame(); // clear screen
      } else {
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
          await promise;
        }
      }
    };
  }, [waitForAsyncRenders]);

  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <Main devMode={devMode} width={width} height={height} fps={fps} serverPort={serverPort} durationFrames={durationFrames} currentFrame={currentFrame} renderId={renderId} />
  );
};

window.setupReact = ({ devMode, width, height, fps, serverPort, durationFrames, renderId, userData }) => {
  async function waitForAsyncRenders() {
    return new Promise((resolve) => {
      setAsyncRenderDoneCb(() => {
        console.log('asyncRenderDoneCb');
        resolve();
      });
    });
  }

  setUserData(userData);

  ReactDOM.render(<PuppeteerRenderer devMode={devMode} width={width} height={height} fps={fps} serverPort={serverPort} durationFrames={durationFrames} waitForAsyncRenders={waitForAsyncRenders} renderId={renderId} userData={userData} />, document.getElementById('root'));
};

// This is a bit hacky. trying to make sure we don't get dup frames (previous frame rendered again)
// So we wait for the browser to completely finish rendering of all DOM updates that react have done
// https://stackoverflow.com/questions/15875128/is-there-element-rendered-event
// https://stackoverflow.com/questions/26556436/react-after-render-code
// Alternatively we could try to run requestAnimationFrame twice to skip the first frame
// Alternative2: callback from ReactDOM.render(element, container[, callback])
// https://reactjs.org/docs/react-dom.html#render
// alternatively we could clear the screen between each frame render and detect that screenshot is not white (retry if it is)
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
