import { useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

export type ImageProps = React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>
  & { src: string };

const ImageInternal = ({ src, _originalSrc, onError, onLoad, ...rest }: ImageProps & { _originalSrc: string }) => {
  const errorRef = useRef<(a: Error) => void>();
  const loadRef = useRef<(a: void) => void>();

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (...args) => {
    if (loadRef.current) loadRef.current();
    onLoad?.(...args);
  };

  const handleError: React.ReactEventHandler<HTMLImageElement> = (...args) => {
    if (errorRef.current) errorRef.current(new Error(`Image failed to load ${_originalSrc}`));
    onError?.(...args);
  };

  useAsyncRenderer(async () => new Promise((resolve: (a: void) => void, reject: (a: Error) => void) => {
    errorRef.current = reject;
    loadRef.current = resolve;
  }), [src], 'ImageInternal');

  // eslint-disable-next-line jsx-a11y/iframe-has-title,jsx-a11y/alt-text,react/jsx-props-no-spreading
  return <img {...rest} src={src} onError={handleError} onLoad={handleLoad} />;
};

export default ImageInternal;
