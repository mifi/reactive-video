import React, { useContext, useMemo, memo, PropsWithChildren } from 'react';
import { API, FFmpegStreamFormat, UserData, VideoComponentType } from './types';

interface VideoContextData {
  currentFrame: number,
  currentTime: number,
  durationFrames: number,
  durationTime: number,
  progress: number,

  video: {
    currentFrame: number,
    currentTime: number,
    durationFrames: number,
    durationTime: number,
    progress: number,
  },

  fps: number,
  width: number,
  height: number,

  getFrameTime: (a: number) => number,
  getTimeFrame: (a: number) => number,

  userData: UserData,

  api: API,
  getProxiedAssetUrl: (a: string) => string,

  isPuppeteer: boolean,
  videoComponentType: VideoComponentType,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality: number,
}

export const VideoContext = React.createContext<VideoContextData | undefined>(undefined);

export const useVideo = () => {
  const videoContext = useContext(VideoContext);
  if (videoContext == null) throw new Error('VideoContext not provided');
  return videoContext;
};

export const calculateProgress = (currentFrame: number, duration: number) => Math.max(0, Math.min(1, currentFrame / Math.max(1, duration - 1)));

// eslint-disable-next-line react/display-name
export const VideoContextProvider = memo(({
  currentFrame = 0, durationFrames, width = 800, height = 600, fps = 30, api, userData, videoComponentType = 'html', ffmpegStreamFormat, jpegQuality, isPuppeteer = false, children,
}: PropsWithChildren<{
  currentFrame?: number, durationFrames: number, width?: number, height?: number, fps?: number, api: API, userData: UserData, videoComponentType: VideoComponentType, ffmpegStreamFormat: FFmpegStreamFormat, jpegQuality: number, isPuppeteer?: boolean,
}>) => {
  const videoContext = useMemo(() => {
    const getFrameTime = (f: number) => f / fps;
    const getTimeFrame = (time: number) => Math.round(time * fps);
    const currentTime = getFrameTime(currentFrame);
    const durationTime = getFrameTime(durationFrames);
    const progress = calculateProgress(currentFrame, durationFrames);

    return {
      currentFrame,
      currentTime,
      durationFrames,
      durationTime,
      progress,

      // Global, never altered:
      video: {
        currentFrame,
        currentTime,
        durationFrames,
        durationTime,
        progress,
      },

      fps,
      width,
      height,

      getFrameTime,
      getTimeFrame,

      userData: userData || {},

      api: api || {},
      getProxiedAssetUrl: (src: string) => (api && api.getProxiedAssetUrl ? api.getProxiedAssetUrl(src) : src),

      isPuppeteer,
      videoComponentType,
      ffmpegStreamFormat,
      jpegQuality,
    };
  }, [currentFrame, durationFrames, fps, height, width, api, userData, isPuppeteer, videoComponentType, ffmpegStreamFormat, jpegQuality]);

  return (
    <VideoContext.Provider value={videoContext}>
      {children}
    </VideoContext.Provider>
  );
});
