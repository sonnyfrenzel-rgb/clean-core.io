import { Composition } from 'remotion';
import { CleanCoreVideo } from './CleanCoreVideo';

const FPS = 30;
const DURATION = 35 * FPS; // 35 seconds — v2.0 full cut (hook → morph → features → security → limits → proof → CTA)
const DURATION_SHORT = 15 * FPS; // 15 seconds

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
      {/* Optional vertical variant (Stories / mobile-first) — 35s. */}
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
