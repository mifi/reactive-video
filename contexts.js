import React, { useContext, useMemo, memo } from 'react';

export const VideoContext = React.createContext();

export const useVideo = () => {
  const videoContext = useContext(VideoContext);
  return videoContext;
};

export const VideoContextProvider = memo(({
  currentFrame = 0, durationFrames, width = 800, height = 600, fps = 30, api, userData, videoComponentType = 'html', isPuppeteer = false, children,
}) => {
  const videoContext = useMemo(() => {
    const getFrameTime = (f) => f / fps;
    const currentTime = getFrameTime(currentFrame);
    const durationTime = getFrameTime(durationFrames);

    return {
      currentFrame,
      currentTime,
      durationFrames,
      durationTime,

      // Global, never altered:
      video: {
        currentFrame,
        currentTime,
        durationFrames,
        durationTime,
      },

      fps,
      width,
      height,

      getFrameTime,

      userData: userData || {},

      api: api || {},

      isPuppeteer,
      videoComponentType,
    };
  }, [currentFrame, durationFrames, fps, height, width, api, userData, isPuppeteer, videoComponentType]);

  return (
    <VideoContext.Provider value={videoContext}>
      {children}
    </VideoContext.Provider>
  );
});
