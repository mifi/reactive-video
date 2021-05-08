import React, { useState } from 'react';
import ReactDOM from 'react-dom';

import { Main, onRootComponentRegistered, setUserData } from './entry';

const Preview = () => {
  const [currentFrame, setCurrentFrame] = useState(0);

  const params = new URLSearchParams(window.location.search);
  const devMode = params.get('devMode') === 'true';
  const width = parseInt(params.get('width'), 10);
  const height = parseInt(params.get('height'), 10);
  const fps = parseInt(params.get('fps'), 10);
  const serverPort = parseInt(params.get('serverPort'), 10);
  const durationFrames = parseInt(params.get('durationFrames'), 10);
  const userData = params.get('userData') && JSON.parse(params.get('userData'));

  setUserData(userData);

  return (
    <>
      <input type="range" min={0} max={durationFrames - 1} onChange={(e) => setCurrentFrame(parseInt(e.target.value, 10))} value={currentFrame} style={{ width: '100%' }} />

      <div style={{ border: '3px solid black', borderRadius: 5, width, height, overflow: 'hidden', scale: 0.5 }}>
        <Main devMode={devMode} width={width} height={height} fps={fps} serverPort={serverPort} durationFrames={durationFrames} currentFrame={currentFrame} />
      </div>
    </>
  );
};

onRootComponentRegistered(() => {
  ReactDOM.render(<Preview />, document.getElementById('root'));
});
