import React, { useEffect, useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

const ImageInternal = (props) => {
  const { waitFor } = useAsyncRenderer();
  const { src, onError: userOnError, onLoad: userOnLoad } = props;

  const errorRef = useRef();
  const loadRef = useRef();

  function onLoad() {
    if (loadRef.current) loadRef.current();
    if (userOnLoad) userOnLoad();
  }

  function onError(err) {
    if (errorRef.current) errorRef.current(err);
    if (userOnError) userOnError(err);
  }

  useEffect(() => {
    waitFor(new Promise((resolve, reject) => {
      errorRef.current = reject;
      loadRef.current = resolve;
    }));
  }, [src, waitFor]);

  // eslint-disable-next-line jsx-a11y/iframe-has-title,jsx-a11y/alt-text,react/jsx-props-no-spreading
  return <img {...props} onError={onError} onLoad={onLoad} />;
};

export default ImageInternal;
