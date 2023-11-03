import { SyntheticEvent, useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

interface Props {
  src: string;
  _originalSrc: string;
  onLoad: (a: void) => void;
}

export type ImageInternalProps = Props & React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;

const ImageInternal = ({ src, _originalSrc, onError, onLoad, ...rest }: ImageInternalProps) => {
  const errorRef = useRef<(a: Error) => void>();
  const loadRef = useRef<(a: void) => void>();

  function handleLoad() {
    if (loadRef.current) loadRef.current();
    if (onLoad) onLoad();
  }

  function handleError(errorEvent: SyntheticEvent<HTMLImageElement, Event>) {
    if (errorRef.current) errorRef.current(new Error(`Image failed to load ${_originalSrc}`));
    if (onError) onError(errorEvent);
  }

  useAsyncRenderer(async () => new Promise((resolve: (a: void) => void, reject: (a: Error) => void) => {
    errorRef.current = reject;
    loadRef.current = resolve;
  }), [src], 'ImageInternal');

  // eslint-disable-next-line jsx-a11y/iframe-has-title,jsx-a11y/alt-text,react/jsx-props-no-spreading
  return <img {...rest} src={src} onError={handleError} onLoad={handleLoad} />;
};

export default ImageInternal;
