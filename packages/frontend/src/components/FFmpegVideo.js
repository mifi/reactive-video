import React, { useEffect, useRef } from 'react';

import { useVideo } from '../contexts';
import { useAsyncRenderer } from '../asyncRegistry';

const FFmpegVideo = (props) => {
  const { src, scaleToWidth, scaleToHeight, streamIndex = 0, style, isPuppeteer, ...rest } = props;

  const type = 'raw';
  // const type = 'png';
  // const type = 'jpeg'; // TODO implement and test jpeg, see if it's faster

  const { waitFor } = useAsyncRenderer();
  const { currentTime, fps, api } = useVideo();

  const canvasRef = useRef();
  const imgRef = useRef();

  const videoMetaCache = useRef({});

  const ongoingRequestsRef = useRef();

  useEffect(() => {
    function drawOnCanvas(ctx, rgbaImage, w, h) {
      // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
      // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgbaImage), w, h), 0, 0);
    }

    let pngBlobUrl;
    let canceled = false;

    if (type === 'raw') canvasRef.current.style.visibility = 'hidden';
    if (type === 'png') imgRef.current.style.visibility = 'hidden';

    waitFor(async () => {
      // Allow optional resizing
      let width = scaleToWidth;
      let height = scaleToHeight;
      const scale = (scaleToWidth || scaleToHeight);

      const cacheKey = src;
      if (!videoMetaCache.current[cacheKey]) {
        const videoMetadataResponse = await api.readVideoMetadata({ path: src, streamIndex });
        if (!videoMetadataResponse.ok) throw new Error('HTTP error');
        const meta = await videoMetadataResponse.json();
        videoMetaCache.current[cacheKey] = { width: meta.width, height: meta.height, fps: meta.fps };
      }
      const cached = videoMetaCache.current[cacheKey];
      if (!scale) {
        width = cached.width;
        height = cached.height;
      }
      const fileFps = cached.fps;

      // eslint-disable-next-line no-inner-declarations
      async function readVideoFrame() {
        const response = await api.readVideoFrame({ fps, uri: src, width, height, fileFps, scale, time: currentTime, streamIndex, type });
        if (!response.ok) throw new Error('HTTP error');
        return response;
      }

      let fetchResponse;
      if (isPuppeteer) {
        fetchResponse = await readVideoFrame();
      } else {
        // Throttle requests to server when only previewing
        if (!ongoingRequestsRef.current) {
          ongoingRequestsRef.current = (async () => {
            try {
              const response = await readVideoFrame();
              if (!response.ok) throw new Error('HTTP error');
              return response;
            } finally {
              ongoingRequestsRef.current = undefined;
            }
          })();
        }

        fetchResponse = await ongoingRequestsRef.current;
      }

      const blob = await fetchResponse.blob();

      if (canceled) return;

      if (type === 'raw') {
        const canvas = canvasRef.current;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        drawOnCanvas(ctx, await blob.arrayBuffer(), width, height);
      } else if (type === 'png') {
        // See https://github.com/mifi/reactive-video/issues/4
        pngBlobUrl = URL.createObjectURL(blob);
        const promise = new Promise((resolve, reject) => {
          imgRef.current.addEventListener('load', resolve);
          imgRef.current.addEventListener('error', reject);
        });
        imgRef.current.src = pngBlobUrl;
        await promise;
      }

      if (canceled) return;

      if (type === 'raw') canvasRef.current.style.visibility = null;
      if (type === 'png') imgRef.current.style.visibility = null;
    });

    return () => {
      if (!isPuppeteer) canceled = true;
      if (pngBlobUrl) URL.revokeObjectURL(pngBlobUrl);
    };
  }, [src, currentTime, scaleToWidth, scaleToHeight, fps, api, streamIndex, waitFor, isPuppeteer]);

  // eslint-disable-next-line react/jsx-props-no-spreading
  if (type === 'raw') return <canvas {...rest} style={style} ref={canvasRef} />;
  // eslint-disable-next-line react/jsx-props-no-spreading,jsx-a11y/alt-text
  if (type === 'png') return <img {...rest} style={style} ref={imgRef} />;

  return null;
};

export default FFmpegVideo;
