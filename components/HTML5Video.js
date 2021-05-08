import React, { useEffect, useRef, useContext } from 'react';

import { useAsyncRenderer } from '../entry';

import { VideoContext } from '../contexts';

const HTML5Video = (props) => {
  const { src, ...rest } = props;

  const { waitFor } = useAsyncRenderer();

  const { currentFrame, currentTime, fps } = useContext(VideoContext);

  const videoRef = useRef();

  useEffect(() => {
    waitFor(new Promise((resolve, reject) => {
      if (videoRef.current.src === src) {
        if (Math.abs(videoRef.current.currentTime - currentTime) < (1 / fps) * 0.5) {
          if (videoRef.current.readyState >= 2) {
            resolve();
            return;
          }

          videoRef.current.addEventListener('loadeddata', () => resolve(), { once: true });
          return;
        }

        videoRef.current.currentTime = currentTime;
        videoRef.current.addEventListener('canplay', () => resolve(), { once: true });
        return;
      }

      videoRef.current.addEventListener('canplay', () => resolve(), { once: true });
      videoRef.current.addEventListener('ended', () => resolve(), { once: true });
      videoRef.current.addEventListener('error', (err) => reject(err), { once: true });

      videoRef.current.src = src;
      videoRef.current.currentTime = currentTime;
    }), 'HTML5Video');
  }, [src, currentFrame, fps, currentTime, waitFor]);

  // eslint-disable-next-line jsx-a11y/media-has-caption,jsx-a11y/media-has-caption,react/jsx-props-no-spreading
  return <video {...rest} ref={videoRef} />;
};

export default HTML5Video;
