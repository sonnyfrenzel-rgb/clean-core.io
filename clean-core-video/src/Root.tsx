import { Composition } from 'remotion';
import { CleanCoreVideo } from './CleanCoreVideo';

const FPS = 30;
const DURATION = 43 * FPS; // 43 seconds — v2.0 full cut (hook → morph → features → security → limits → proof → CTA); features scene held longer for readability
const DURATION_SHORT = 15 * FPS; // 15 seconds

// Background music: drop a track in public/ (e.g. public/audio/bg.mp3) and set AUDIO.
// Leave undefined to render silent. See README for licensing-safe sources.
const AUDIO: string | undefined = undefined; // e.g. 'audio/bg.mp3'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 35s — full v2.0 narrative. LinkedIn feed, square (highest completion). */}
      <Composition
        id="CleanCoreSquare"
        component={CleanCoreVideo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{ short: false, audioSrc: AUDIO }}
      />
      {/* 15s — core + limitations, fast to CTA. Best for cold reach / higher completion. */}
      <Composition
        id="CleanCoreShort"
        component={CleanCoreVideo}
        durationInFrames={DURATION_SHORT}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{ short: true, audioSrc: AUDIO }}
      />
      {/* Optional vertical variant (Stories / mobile-first) — 40s. */}
      <Composition
        id="CleanCoreVertical"
        component={CleanCoreVideo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ short: false, audioSrc: AUDIO }}
      />
    </>
  );
};
