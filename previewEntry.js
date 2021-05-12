import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';

// reactive-video-root-component is a webpack alias
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import Api from './api';
import { VideoContextProvider } from './contexts';

const PreviewRoot = () => {
  const hash = new URLSearchParams(window.location.hash.substr(1));
  const currentFrameInitial = hash.get('currentFrame') ? parseInt(hash.get('currentFrame'), 10) : 0;

  const [currentFrame, setCurrentFrame] = useState(currentFrameInitial);

  const params = new URLSearchParams(window.location.search);
  const width = parseInt(params.get('width'), 10);
  const height = parseInt(params.get('height'), 10);
  const fps = parseInt(params.get('fps'), 10);
  const serverPort = parseInt(params.get('serverPort'), 10);
  const durationFrames = parseInt(params.get('durationFrames'), 10);
  const userData = params.get('userData') && JSON.parse(params.get('userData'));
  const videoComponentType = params.get('videoComponentType');
  const secret = params.get('secret');

  function handleCurrentFrameChange(newVal) {
    hash.set('currentFrame', newVal);
    window.history.pushState(undefined, undefined, `#${hash.toString()}`);
    setCurrentFrame(newVal);
  }

  const api = useMemo(() => Api({ serverPort, secret }), [serverPort, secret]);

  const frameCanvasStyle = {
    width,
    height,
    overflow: 'hidden',
    position: 'relative',
    border: '3px solid black',
    borderRadius: 5,
  };

  return (
    <>
      <input type="range" min={0} max={durationFrames - 1} onChange={(e) => handleCurrentFrameChange(parseInt(e.target.value, 10))} value={currentFrame} style={{ width: '100%', margin: '10px 0' }} />

      <div style={frameCanvasStyle}>
        <VideoContextProvider
          currentFrame={currentFrame}
          durationFrames={durationFrames}
          width={width}
          height={height}
          fps={fps}
          api={api}
          userData={userData}
          videoComponentType={videoComponentType}
        >
          <RootComponent />
        </VideoContextProvider>
      </div>
    </>
  );
};

ReactDOM.render(<PreviewRoot />, document.getElementById('root'));
