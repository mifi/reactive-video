import { CSSProperties } from 'react';
import { Video, useVideo } from 'reactive-video';


export interface UserData {
  videoUri: string,
}

export default function ReactiveVideo() {
  const { width, height, userData: { videoUri } } = useVideo<UserData>();

  const videoStyle: CSSProperties = { width, height, position: 'absolute' };

  return (
    <div>
      <Video src={videoUri} style={videoStyle} />
    </div>
  );
}
