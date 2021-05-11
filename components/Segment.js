import React, { useMemo } from 'react';
import { useVideo } from '../entry';
import { VideoContext } from '../contexts';

const Segment = (props) => {
  const videoContext = useVideo();

  const { children, start = 0, duration, render } = props;

  const { currentFrame, getFrameTime } = videoContext;

  const currentFrameRelative = currentFrame - start;
  const currentTimeRelative = getFrameTime(currentFrameRelative);

  const segmentDurationFrames = duration != null ? duration : videoContext.durationFrames - start;
  const segmentDurationTime = getFrameTime(segmentDurationFrames);

  // Override the existing video context
  const videoContextNew = useMemo(() => ({
    ...videoContext,

    // Override these values:
    currentFrame: currentFrameRelative,
    currentTime: currentTimeRelative,
    durationFrames: segmentDurationFrames,
    durationTime: segmentDurationTime,
  }), [currentFrameRelative, currentTimeRelative, segmentDurationFrames, segmentDurationTime, videoContext]);

  if (currentFrame < start || (duration != null && currentFrame >= start + duration)) return null;

  return (
    <VideoContext.Provider value={videoContextNew}>
      {render && render(videoContextNew)}
      {children}
    </VideoContext.Provider>
  );
};

export default Segment;
