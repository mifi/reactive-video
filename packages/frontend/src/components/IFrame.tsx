import React, { SyntheticEvent, useRef } from 'react';

import { useAsyncRenderer } from '../asyncRegistry';

interface Props {
  src: string;
  onLoad: (a: void) => void;
}

export type IFrameProps = Props & React.DetailedHTMLProps<React.IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement>;

const IFrame = (props: IFrameProps) => {
  const { src, onError, onLoad } = props;

  const errorRef = useRef<(a: Error) => void>();
  const loadRef = useRef<(a: void) => void>();

  function handleLoad() {
    if (loadRef.current) loadRef.current();
    if (onLoad) onLoad();
  }

  function handleError(error: SyntheticEvent<HTMLIFrameElement, Event>) {
    if (errorRef.current) errorRef.current(new Error(`IFrame failed to load ${src}`));
    if (onError) onError(error);
  }

  useAsyncRenderer(async () => new Promise((resolve: (a: void) => void, reject: (a: Error) => void) => {
    errorRef.current = reject;
    loadRef.current = resolve;
  }), [src], 'IFrame');

  // eslint-disable-next-line jsx-a11y/iframe-has-title,react/jsx-props-no-spreading
  return <iframe {...props} onError={handleError} onLoad={handleLoad} />;
};

export default IFrame;
