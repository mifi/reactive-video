import { useState, useMemo, ComponentType, CSSProperties } from 'react';
import { Jsonify } from 'type-fest';

// reactive-video-root-component is a webpack alias
// @ts-expect-error declared below
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import { VideoContextProvider, Api } from 'reactive-video';
import { FFmpegStreamFormat, VideoComponentType } from 'reactive-video/dist/types.js';
import { createRoot } from 'react-dom/client';
// import Api from 'reactive-video/dist/api';

type RootComponent = ComponentType;

export interface ReactVideoInitData {
  width: number;
  height: number;
  fps: number;
  serverPort: number;
  durationFrames: number;
  userData: unknown | undefined;
  videoComponentType: VideoComponentType;
  ffmpegStreamFormat: FFmpegStreamFormat;
  jpegQuality: number;
  secret: string;
}

declare global {
  const reactiveVideo: {
    initData: Jsonify<ReactVideoInitData> & { userData?: unknown | undefined },
  };
}

const PreviewRoot = () => {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const currentFrameInitial = hash.get('currentFrame') ? parseInt(hash.get('currentFrame')!, 10) : 0;

  const [currentFrame, setCurrentFrame] = useState(currentFrameInitial);

  // eslint-disable-next-line no-undef
  const { width, height, fps, serverPort, durationFrames, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret } = reactiveVideo.initData;

  function handleCurrentFrameChange(newVal: number) {
    hash.set('currentFrame', String(newVal));
    window.history.replaceState(undefined, '', `#${hash.toString()}`);
    setCurrentFrame(newVal);
  }

  const api = useMemo(() => Api({ serverPort, secret }), [serverPort, secret]);

  const frameCanvasStyle: CSSProperties = {
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

const element = document.getElementById('root');
const root = createRoot(element!);
root.render(<PreviewRoot />);
