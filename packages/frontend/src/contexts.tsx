import React, { useContext, useMemo, memo, PropsWithChildren } from 'react';
import { API, FFmpegStreamFormat, VideoComponentType } from './types';

interface VideoContextData <UserData> {
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

  api?: API,
  getProxiedAssetUrl: (a: string) => string,

  isPuppeteer: boolean,
  videoComponentType: VideoComponentType,
  ffmpegStreamFormat: FFmpegStreamFormat,
  jpegQuality?: number,
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const VideoContext = React.createContext<VideoContextData<any> | null>(null);

export const useVideo = <UserData, >() => {
  const videoContext = useContext<VideoContextData<UserData> | null>(VideoContext);
  if (videoContext == null) throw new Error('VideoContext not provided');
  return videoContext;
};

export const calculateProgress = (currentFrame: number, duration: number) => Math.max(0, Math.min(1, currentFrame / Math.max(1, duration - 1)));

// eslint-disable-next-line react/display-name
export const VideoContextProvider = memo(({
  currentFrame = 0, durationFrames, width = 800, height = 600, fps = 30, api, userData, videoComponentType = 'html', ffmpegStreamFormat = 'raw', jpegQuality, isPuppeteer = false, children,
}: PropsWithChildren<{
  currentFrame?: number, durationFrames: number, width?: number, height?: number, fps?: number, api?: API, userData?: unknown, videoComponentType?: VideoComponentType, ffmpegStreamFormat: FFmpegStreamFormat, jpegQuality?: number, isPuppeteer?: boolean,
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

      api,
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
