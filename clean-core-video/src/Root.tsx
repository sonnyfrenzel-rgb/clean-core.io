import { Composition } from 'remotion';
import { CleanCoreVideo } from './CleanCoreVideo';

const FPS = 30;
const DURATION = 30 * FPS; // 30 seconds
const DURATION_SHORT = 15 * FPS; // 15 seconds

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 30s — full narrative. LinkedIn feed, square (highest completion). */}
      <Composition
        id="CleanCoreSquare"
        component={CleanCoreVideo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{ short: false }}
      />
      {/* 15s — core + limitations, fast to CTA. Best for cold reach / higher completion. */}
      <Composition
        id="CleanCoreShort"
        component={CleanCoreVideo}
        durationInFrames={DURATION_SHORT}
        fps={FPS}
        width={1080}
        height={1080}
        defaultProps={{ short: true }}
      />
      {/* Optional vertical variant (Stories / mobile-first) — 30s. */}
      <Composition
        id="CleanCoreVertical"
        component={CleanCoreVideo}
        durationInFrames={DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={{ short: false }}
      />
    </>
  );
};
