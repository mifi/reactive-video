import React, { useRef } from 'react';

import { useVideo } from '../contexts';
import { useAsyncRenderer } from '../asyncRegistry';

// fetch seems to be faster than letting the <image> fetch the src itself
// but it seems to be causing sporadic blank (white) image
const useFetch = false;

type RestProps = React.DetailedHTMLProps<React.CanvasHTMLAttributes<HTMLCanvasElement>, HTMLCanvasElement>
  & React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;

export interface FFmpegVideoProps {
  src: string,
  scaleToWidth?: number,
  scaleToHeight?: number,
  streamIndex?: number,
  isPuppeteer?: boolean,
}

const FFmpegVideo = ({ src, scaleToWidth, scaleToHeight, streamIndex = 0, style, isPuppeteer = false, ...rest }: FFmpegVideoProps & RestProps) => {
  const { currentTime, fps, api, ffmpegStreamFormat, jpegQuality } = useVideo();
  if (api == null) throw new Error('No API in context');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const videoMetaCache = useRef<Record<string, {width: number, height: number, fps: number}>>({});

  const ongoingRequestsRef = useRef<Promise<Response>>();

  useAsyncRenderer(() => {
    let objectUrl: string;
    let canceled = false;

    return [
      async () => {
        function drawOnCanvas(ctx: CanvasRenderingContext2D, rgbaImage: ArrayBuffer, w: number, h: number) {
          // https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData
          // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData
          ctx.putImageData(new ImageData(new Uint8ClampedArray(rgbaImage), w, h), 0, 0);
        }

        // No need to flash white when preview
        if (isPuppeteer) {
          if (ffmpegStreamFormat === 'raw') {
            if (canvasRef.current == null) throw new Error('canvasRef was nullish');
            canvasRef.current.style.visibility = 'hidden';
          }
          if (['png', 'jpeg'].includes(ffmpegStreamFormat)) {
            if (imgRef.current == null) throw new Error('imgRef was nullish');
            imgRef.current.src = '';
          }
        }

        // Allow optional resizing
        let width = scaleToWidth;
        let height = scaleToHeight;
        const scale = !!(scaleToWidth || scaleToHeight);

        const cacheKey = src;
        if (!videoMetaCache.current[cacheKey]) {
          const videoMetadataResponse = await api.readVideoMetadata({ path: src, streamIndex });
          const meta = await videoMetadataResponse.json();
          videoMetaCache.current[cacheKey] = { width: meta.width, height: meta.height, fps: meta.fps };
        }
        const cached = videoMetaCache.current[cacheKey];

        if (!width) width = cached!.width;
        if (!height) height = cached!.height;
        const fileFps = cached!.fps;

        const ffmpegParams = { fps, uri: src, width, height, fileFps, scale, time: currentTime, streamIndex, ffmpegStreamFormat, jpegQuality };

        if (ffmpegStreamFormat === 'raw') {
          let fetchResponse: Response;

          if (isPuppeteer) {
            fetchResponse = await api.readVideoFrame(ffmpegParams);
          } else {
            // Throttle requests to server when only previewing
            if (!ongoingRequestsRef.current) {
              ongoingRequestsRef.current = (async () => {
                try {
                  return await api.readVideoFrame(ffmpegParams);
                } finally {
                  ongoingRequestsRef.current = undefined;
                }
              })();
            }

            fetchResponse = await ongoingRequestsRef.current;
          }

          const blob = await fetchResponse.blob();

          if (canceled) return;

          const canvas = canvasRef.current;
          if (canvas == null) throw new Error('canvas was nullish');

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (ctx == null) throw new Error('ctx was null');

          const arrayBuffer = await blob.arrayBuffer();
          drawOnCanvas(ctx, arrayBuffer, width, height);

          if (canvasRef.current == null) throw new Error('canvas was nullish');
          canvasRef.current.style.visibility = '';
          return;
        }

        if (['png', 'jpeg'].includes(ffmpegStreamFormat)) {
          const loadPromise = new Promise((resolve, reject) => {
            if (imgRef.current == null) throw new Error('imgRef was nullish');
            imgRef.current.addEventListener('load', resolve);
            imgRef.current.addEventListener('error', () => reject(new Error(`FFmpegVideo frame image at time ${currentTime} failed to load`)));
          });

          await Promise.all([
            loadPromise,
            (async () => {
              if (useFetch) {
                const response = await fetch(new Request(api.getVideoFrameUrl(ffmpegParams)));
                objectUrl = URL.createObjectURL(await response.blob());
                if (imgRef.current == null) throw new Error('imgRef was nullish');
                imgRef.current.src = objectUrl;
              } else {
                if (imgRef.current == null) throw new Error('imgRef was nullish');
                imgRef.current.src = api.getVideoFrameUrl(ffmpegParams);
              }
            })(),
          ]);
        }
      },
      () => {
        if (!isPuppeteer) canceled = true;
        if (useFetch && objectUrl) URL.revokeObjectURL(objectUrl);
      },
    ];
  }, [src, currentTime, scaleToWidth, scaleToHeight, fps, api, streamIndex, isPuppeteer, ffmpegStreamFormat, jpegQuality], 'FFmpegVideo');

  // eslint-disable-next-line react/jsx-props-no-spreading
  if (ffmpegStreamFormat === 'raw') return <canvas {...rest} style={style} ref={canvasRef} />;

  // eslint-disable-next-line react/jsx-props-no-spreading,jsx-a11y/alt-text
  if (['png', 'jpeg'].includes(ffmpegStreamFormat)) return <img {...rest} style={style} ref={imgRef} />;

  return null;
};

export default FFmpegVideo;
