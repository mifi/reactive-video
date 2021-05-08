import React, { useEffect, useRef } from 'react';

import { useAsyncRenderer } from '../entry';

const IFrame = (props) => {
  const { waitFor } = useAsyncRenderer();
  const { src, onError: userOnError, onLoad: userOnLoad } = props;

  const errorRef = useRef();
  const loadRef = useRef();

  function onLoad() {
    loadRef.current();
    if (userOnLoad) userOnLoad();
  }

  function onError(err) {
    errorRef.current(err);
    if (userOnError) userOnError(err);
  }

  useEffect(() => {
    waitFor(new Promise((resolve, reject) => {
      errorRef.current = reject;
      loadRef.current = resolve;
    }));
  }, [src, waitFor]);

  // eslint-disable-next-line jsx-a11y/iframe-has-title,react/jsx-props-no-spreading
  return <iframe {...props} onError={onError} onLoad={onLoad} />;
};

export default IFrame;
