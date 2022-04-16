import React from 'react';

import { useVideo, Segment, Image } from 'reactive-video';

import './segments.css';
// svg made by https://www.instagram.com/nack___thanakorn/
import pumpkin from '../../../../reactive-video-assets/pumpkin.svg';

const Counter = () => {
  const { currentFrame, currentTime, durationFrames, durationTime, progress, video } = useVideo();

  const seg = { currentFrame, currentTime, durationFrames, durationTime, progress };

  const renderTimes = (times) => (
    <>
      <div style={{ fontSize: '800%' }}>{times.currentFrame} f&nbsp;&nbsp;&nbsp;<span style={{ fontSize: '50%' }}>{times.currentTime.toFixed(2)} s</span></div>
      <div style={{ fontSize: '300%' }}>/ {times.durationFrames} f&nbsp;&nbsp;&nbsp;{times.durationTime.toFixed(2)} s</div>
      <div style={{ fontSize: '200%' }}>{(times.progress * 100).toFixed(0)} %</div>
    </>
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: `hsl(${(currentFrame * 10) % 360}deg 78% 37%)`, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
      <div>Segment:</div>
      {renderTimes(seg)}

      <div style={{ marginTop: '6vh' }}>Video:</div>
      {renderTimes(video)}
    </div>
  );
};

export default () => {
  const { currentTime } = useVideo();

  return (
    <div style={{ fontFamily: 'Girassol' }}>
      <div style={{ position: 'absolute', width: '100%', height: '100%' }}>
        <Segment duration={30}>
          <Counter />
        </Segment>
        <Segment start={30} duration={30}>
          <Counter />
        </Segment>
        <Segment start={60}>
          <Counter />
        </Segment>
      </div>

      <Image
        style={{ position: 'absolute', top: '50vh', right: '10vw', width: 100, transform: `scale(${1 + 0.4 * Math.sin(currentTime)})` }}
        src={pumpkin}
      />

      <Segment cut={false} start={40} duration={20} render={({ progress }) => (<div style={{ position: 'absolute', borderRadius: '.7vw', left: '1vw', top: '1vw', padding: '1vw', background: 'white', height: `${(0.1 + progress * 0.3) * 100}%` }}>{progress.toFixed(2)}</div>)} />
    </div>
  );
};
