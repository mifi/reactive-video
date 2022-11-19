import React, { useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

const ImageInternal = (props) => {
  const { src, _originalSrc, onError, onLoad, ...rest } = props;

  const errorRef = useRef();
  const loadRef = useRef();

  function handleLoad() {
    if (loadRef.current) loadRef.current();
    if (onLoad) onLoad();
  }

  function handleError(err) {
    if (errorRef.current) errorRef.current(new Error(`Image failed to load ${_originalSrc}`));
    if (onError) onError(err);
  }

  useAsyncRenderer(async () => new Promise((resolve, reject) => {
    errorRef.current = reject;
    loadRef.current = resolve;
  }), [src], 'ImageInternal');

  // eslint-disable-next-line jsx-a11y/iframe-has-title,jsx-a11y/alt-text,react/jsx-props-no-spreading
  return <img {...rest} src={src} onError={handleError} onLoad={handleLoad} />;
};

export default ImageInternal;
