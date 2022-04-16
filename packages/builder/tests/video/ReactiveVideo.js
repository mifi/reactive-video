import React from 'react';
import { Video, useVideo, Image } from 'reactive-video';

import './fonts.css';

import flag from '../../../../reactive-video-assets/Flag_of_Thailand.svg';

export default () => {
  const { width, height, userData: { videoUri, title, description }, currentTime } = useVideo();

  const blurAmount = Math.floor((width * 0.008) / (1 + currentTime));
  const brightnessAmount = Math.max(1, 1 + 5 * (1 - currentTime));
  const videoStyle = { width, height, position: 'absolute', filter: `blur(${blurAmount.toFixed(5)}px) brightness(${brightnessAmount})` };

  return (
    <div style={{ fontFamily: 'Oswald regular' }}>
      {/* scaleToWidth makes the test much faster */}
      <Video src={videoUri} style={videoStyle} scaleToWidth={width} scaleToHeight={height} />

      <div style={{ position: 'absolute', color: 'white', left: 0, right: 0, top: 0, bottom: 0, fontSize: width / 15, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '.1em 0', lineHeight: '130%', boxShadow: 'rgba(0,0,0,0.4) 0px 0px 1em 1em' }}>
          <div style={{ textShadow: '1px 1px 0px #000', marginBottom: '.4em', fontSize: '1.3em', textTransform: 'uppercase' }}>{title}</div>
          <div>{description}</div>
        </div>

        <div style={{ marginLeft: '-1.8em', display: 'flex', justifyContent: 'center', alignItems: 'baseline', fontSize: '1.5em', fontFamily: 'Oswald bold', marginTop: '.5em', textShadow: '1px 1px 0px #000' }}>
          <Image src={flag} style={{ height: '0.75em', marginRight: '.3em' }} />
          Visit Now
        </div>
      </div>
    </div>
  );
};
