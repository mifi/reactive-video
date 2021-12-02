import React, { useContext, useMemo, memo } from 'react';

export const VideoContext = React.createContext();

export const useVideo = () => {
  const videoContext = useContext(VideoContext);
  return videoContext;
};

export const calculateProgress = (currentFrame, duration) => Math.max(0, Math.min(1, currentFrame / Math.max(1, duration - 1)));

export const VideoContextProvider = memo(({
  currentFrame = 0, durationFrames, width = 800, height = 600, fps = 30, api, userData, videoComponentType = 'html', ffmpegStreamFormat, jpegQuality, isPuppeteer = false, children,
}) => {
  const videoContext = useMemo(() => {
    const getFrameTime = (f) => f / fps;
    const getTimeFrame = (time) => Math.round(time * fps);
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
      getProxiedAssetUrl: (src) => (api && api.getProxiedAssetUrl ? api.getProxiedAssetUrl(src) : src),

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
