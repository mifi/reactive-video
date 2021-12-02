import React from 'react';

import { useVideo } from '../contexts';
import ImageInternal from './ImageInternal';

const Image = (props) => {
  const { isPuppeteer, getProxiedAssetUrl } = useVideo();
  const { src, ...rest } = props;

  if (isPuppeteer) {
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <ImageInternal {...props} />;
  }

  const srcProxied = getProxiedAssetUrl(src);
  // eslint-disable-next-line react/jsx-props-no-spreading
  return <ImageInternal {...rest} src={srcProxied} />;
};

export default Image;
