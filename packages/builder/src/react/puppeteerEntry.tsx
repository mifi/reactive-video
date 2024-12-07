import { useState, useMemo, useLayoutEffect, useRef, CSSProperties, ComponentType } from 'react';
import { createRoot } from 'react-dom/client';

// reactive-video-root-component is a webpack alias
// @ts-expect-error declared below
// eslint-disable-next-line import/no-unresolved
import RootComponent from 'reactive-video-root-component';

import { VideoContextProvider, awaitAsyncRenders, Api } from 'reactive-video';
import { FFmpegStreamFormat, VideoComponentType } from 'reactive-video/dist/types.js';

type RootComponent = ComponentType;

export const getFrameId = (frameNum: number) => `frame-${frameNum}`;

// https://github.com/mifi/reactive-video/issues/4
// This is a bit hacky. trying to make sure we don't get dupe frames (previous frame rendered again)
// So we wait for the browser to completely finish rendering of all DOM updates that react have done
const awaitDomRenderSettled = async () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => {
    setTimeout(() => {
      resolve();
    }, 0);
  });
});

export type RenderFrameFn = (n: number | null) => Promise<{ component: string; currentFrame: number }[]>;

const PuppeteerRoot = ({ callback, devMode, width, height, fps, serverPort, durationFrames, renderId, userData, videoComponentType = 'ffmpeg', ffmpegStreamFormat, jpegQuality, secret }: {
  callback: () => void,
  devMode: boolean,
  width: number,
  height: number,
  fps: number,
  serverPort: number,
  durationFrames: number,
  renderId: number,
  userData: unknown,
  videoComponentType?: VideoComponentType | undefined,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality: number,
  secret: string,
}) => {
  // https://github.com/reactwg/react-18/discussions/5#discussioncomment-2276079
  const callbackCalledRef = useRef(false);
  useLayoutEffect(() => {
    if (callbackCalledRef.current) return;
    callbackCalledRef.current = true;
    callback();
  }, [callback]);

  const [currentFrame, setCurrentFrame] = useState<number | undefined>();

  const waitingForLayoutEffectRef = useRef<() => void>();

  // We need to set this immediately (synchronously) or we risk the callee calling window.renderFrame before it has been set
  const renderFrame: RenderFrameFn = async (n) => {
    const awaitLayoutEffect = async () => new Promise<void>((resolve) => {
      waitingForLayoutEffectRef.current = () => {
        waitingForLayoutEffectRef.current = undefined;
        resolve();
      };
    });

    const layoutEffectPromise = awaitLayoutEffect();

    // null means clear screen
    setCurrentFrame(n == null ? undefined : n);

    // Need to wait for all components to register themselves
    await layoutEffectPromise;

    // also wait for various other events, to be sure
    await awaitDomRenderSettled();
    // await new Promise((resolve) => setTimeout(resolve, 1000));

    return awaitAsyncRenders(n);
  };

  window.renderFrame = renderFrame;

  useLayoutEffect(() => {
    if (waitingForLayoutEffectRef.current) waitingForLayoutEffectRef.current();
  }, [currentFrame]);

  const api = useMemo(() => Api({ serverPort, renderId, secret }), [renderId, serverPort, secret]);

  // Clear the screen
  // if (currentFrame == null) return <div id="frame-cleared" />;
  if (currentFrame == null) return null;

  const frameCanvasStyle: CSSProperties = {
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
        ffmpegStreamFormat={ffmpegStreamFormat}
        jpegQuality={jpegQuality}
        isPuppeteer
      >
        {devMode && <div id="currentFrame" style={{ fontSize: 18, position: 'absolute', zIndex: 100, background: 'white' }}>{currentFrame} ID{renderId}</div>}

        <RootComponent />
      </VideoContextProvider>
    </div>
  );
};

async function setupReact({ devMode, width, height, fps, serverPort, durationFrames, renderId, userData, videoComponentType, ffmpegStreamFormat, jpegQuality, secret }: {
  devMode: boolean,
  width: number,
  height: number,
  fps: number,
  serverPort: number,
  durationFrames: number,
  renderId: number,
  userData: unknown,
  videoComponentType?: VideoComponentType | undefined,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality: number,
  secret: string,
}) {
  // @ts-expect-error todo
  window.isPuppeteer = true;

  const container = document.getElementById('root');
  const root = createRoot(container!);

  // https://github.com/reactwg/react-18/discussions/5
  return new Promise<void>((resolve) => {
    root.render(
      <PuppeteerRoot
        devMode={devMode}
        width={width}
        height={height}
        fps={fps}
        serverPort={serverPort}
        durationFrames={durationFrames}
        renderId={renderId}
        userData={userData}
        videoComponentType={videoComponentType}
        ffmpegStreamFormat={ffmpegStreamFormat}
        jpegQuality={jpegQuality}
        secret={secret}
        callback={resolve}
      />,
    );
  });
}

// https://github.com/puppeteer/puppeteer/issues/422#issuecomment-708142856
async function haveFontsLoaded() {
  const ready = await document.fonts.ready;
  return ready.status === 'loaded';
}

export type AwaitDomRenderSettled = typeof awaitDomRenderSettled;
export type SetupReact = typeof setupReact;
export type HaveFontsLoaded = typeof haveFontsLoaded;

window.awaitDomRenderSettled = awaitDomRenderSettled;
window.haveFontsLoaded = haveFontsLoaded;
window.setupReact = setupReact;
