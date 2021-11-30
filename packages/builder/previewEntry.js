import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';

// reactive-video-root-component is a webpack alias
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import { VideoContextProvider, Api } from 'reactive-video';
// import Api from 'reactive-video/dist/api';

const PreviewRoot = () => {
  const hash = new URLSearchParams(window.location.hash.substr(1));
  const currentFrameInitial = hash.get('currentFrame') ? parseInt(hash.get('currentFrame'), 10) : 0;

  const [currentFrame, setCurrentFrame] = useState(currentFrameInitial);

  // eslint-disable-next-line no-undef
  const { width, height, fps, serverPort, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret } = reactiveVideo.initData;

  function handleCurrentFrameChange(newVal) {
    hash.set('currentFrame', newVal);
    window.history.replaceState(undefined, undefined, `#${hash.toString()}`);
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
          ffmpegStreamFormat={ffmpegStreamFormat}
          jpegQuality={jpegQuality}
        >
          <RootComponent />
        </VideoContextProvider>
      </div>
    </>
  );
};

ReactDOM.render(<PreviewRoot />, document.getElementById('root'));
