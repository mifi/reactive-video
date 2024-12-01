import { useVideo } from 'reactive-video';

import '../../style.css';

export default function ReactiveVideo() {
  const { currentTime } = useVideo();

  return (
    <div style={{ fontFamily: 'Oswald', fontSize: '20vw', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#542', color: 'white' }}>
      {currentTime}
    </div>
  );
}
