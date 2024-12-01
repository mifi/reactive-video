import React, { useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

const IFrame = (props: React.DetailedHTMLProps<React.IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement>) => {
  const { src, onError, onLoad } = props;

  const errorRef = useRef<(a: Error) => void>();
  const loadRef = useRef<() => void>();

  const handleLoad: React.ReactEventHandler<HTMLIFrameElement> = (...args) => {
    if (loadRef.current) loadRef.current();
    onLoad?.(...args);
  };

  const handleError: React.ReactEventHandler<HTMLIFrameElement> = (...args) => {
    if (errorRef.current) errorRef.current(new Error(`IFrame failed to load ${src}`));
    onError?.(...args);
  };

  useAsyncRenderer(async () => new Promise<void>((resolve, reject) => {
    errorRef.current = reject;
    loadRef.current = resolve;
  }), [src], 'IFrame');

  // eslint-disable-next-line jsx-a11y/iframe-has-title,react/jsx-props-no-spreading
  return <iframe {...props} onError={handleError} onLoad={handleLoad} />;
};

export default IFrame;
