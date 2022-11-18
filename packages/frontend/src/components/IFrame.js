import React, { useEffect, useRef } from 'react';

import { waitFor } from '../asyncRegistry';

const IFrame = (props) => {
  const { src, onError, onLoad } = props;

  const errorRef = useRef();
  const loadRef = useRef();

  function handleLoad() {
    loadRef.current();
    if (onLoad) onLoad();
  }

  function handleError(err) {
    if (errorRef.current) errorRef.current(new Error(`IFrame failed to load ${src}`));
    if (onError) onError(err);
  }

  useEffect(() => {
    waitFor(new Promise((resolve, reject) => {
      errorRef.current = reject;
      loadRef.current = resolve;
    }), 'IFrame');
  }, [src]);

  // eslint-disable-next-line jsx-a11y/iframe-has-title,react/jsx-props-no-spreading
  return <iframe {...props} onError={handleError} onLoad={handleLoad} />;
};

export default IFrame;
