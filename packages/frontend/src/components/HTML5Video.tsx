// eslint-disable-line unicorn/filename-case
import React, { useRef } from 'react';

import { useVideo } from '../contexts';
import { useAsyncRenderer } from '../asyncRegistry';

const HTML5Video = (props: React.DetailedHTMLProps<React.VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement> & { src: string }) => {
  const { src, style, ...rest } = props;

  const { currentFrame, currentTime, fps } = useVideo();

  const videoRef = useRef<HTMLVideoElement>(null);

  useAsyncRenderer(async () => new Promise<void>((resolve, reject) => {
    // It seems that if currentTime just a tiny fraction lower than the desired frame start time, HTML5 video will instead seek to the previous frame. So we add a bit of the frame duration
    // See also FFmpegVideo backend
    const frameDuration = 1 / fps;
    const currentTimeCorrected = currentTime + frameDuration * 0.1;

    if (videoRef.current == null) throw new Error('videoRef was nullish');
    if (videoRef.current.src === src && videoRef.current.error == null) {
      if (Math.abs(videoRef.current.currentTime - currentTime) < frameDuration * 0.5) {
        if (videoRef.current.readyState >= 2) {
          resolve();
          return;
        }

        videoRef.current.addEventListener('loadeddata', () => resolve(), { once: true });
        return;
      }

      videoRef.current.currentTime = currentTimeCorrected;
      videoRef.current.addEventListener('canplay', () => resolve(), { once: true });
      return;
    }

    videoRef.current.addEventListener('canplay', () => resolve(), { once: true });
    videoRef.current.addEventListener('ended', () => resolve(), { once: true });
    videoRef.current.addEventListener('error', () => {
      reject(new Error(videoRef.current?.error ? `${videoRef.current.error.code} ${videoRef.current.error.message}` : 'Unknown HTML5 video error'));
    }, { once: true });

    videoRef.current.src = src;
    videoRef.current.currentTime = currentTimeCorrected;
  }), [src, currentFrame, fps, currentTime], 'HTML5Video');

  // object-fit to make it similar to canvas
  // eslint-disable-next-line jsx-a11y/media-has-caption,jsx-a11y/media-has-caption,react/jsx-props-no-spreading
  return <video style={{ objectFit: 'fill', ...style }} {...rest} ref={videoRef} />;
};

export default HTML5Video;
