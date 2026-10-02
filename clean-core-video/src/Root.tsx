import { Composition } from 'remotion';
import { CleanCoreVideo } from './CleanCoreVideo';
import { CleanCore30, CC30_DURATION } from './CleanCore30';
import { CleanCore30v3, CC30V3_DURATION } from './CleanCore30v3';
import { CleanCore30v3b, CC30V3B_DURATION } from './CleanCore30v3b';
import { CleanCore30v3c, CC30V3C_DURATION } from './CleanCore30v3c';
import { CleanCore30v3d, CC30V3D_DURATION } from './CleanCore30v3d';
import { CleanCore30v3e, CC30V3E_DURATION } from './CleanCore30v3e';
import { CleanCore30v3f, CC30V3F_DURATION } from './CleanCore30v3f';

const FPS = 30;
const DURATION = 43 * FPS; // 43 seconds — v2.0 full cut (hook → morph → features → security → limits → proof → CTA); features scene held longer for readability
const DURATION_SHORT = 15 * FPS; // 15 seconds

// Background music: drop a track in public/ (e.g. public/audio/bg.mp3) and set AUDIO.
// Leave undefined to render silent. See README for licensing-safe sources.
const AUDIO: string | undefined = undefined; // e.g. 'audio/bg.mp3'

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 3.0 launch clip (DRAFT) — 73 s, square, silent, real product captures. */}
      <Composition id="CleanCore30" component={CleanCore30} durationInFrames={CC30_DURATION} fps={FPS} width={1080} height={1080} />
      {/* 3.0 launch clip v3 (DRAFT) — ~84 s, square, silent, release tour on fresh 2x captures of the dev line. */}
      <Composition id="CleanCore30v3" component={CleanCore30v3} durationInFrames={CC30V3_DURATION} fps={FPS} width={1080} height={1080} />
      {/* v3b - owner feedback 01.10.: max 70 s, one message per scene, readable on a phone. */}
      <Composition id="CleanCore30v3b" component={CleanCore30v3b} durationInFrames={CC30V3B_DURATION} fps={FPS} width={1080} height={1080} />
      {/* v3c - v3b content, eased cross-fades, playful hook. */}
      <Composition id="CleanCore30v3c" component={CleanCore30v3c} durationInFrames={CC30V3C_DURATION} fps={FPS} width={1080} height={1080} />
      {/* v3d - clean cuts, Design + Transformation on the chain. */}
      <Composition id="CleanCore30v3d" component={CleanCore30v3d} durationInFrames={CC30V3D_DURATION} fps={FPS} width={1080} height={1080} />
      {/* v3e - v3d with current figures (33,877 objects; 25 findings at 31 places). */}
      <Composition id="CleanCore30v3e" component={CleanCore30v3e} durationInFrames={CC30V3E_DURATION} fps={FPS} width={1080} height={1080} />
      {/* v3f - v3e with the full-screen BPMN editor. */}
      <Composition id="CleanCore30v3f" component={CleanCore30v3f} durationInFrames={CC30V3F_DURATION} fps={FPS} width={1080} height={1080} />
      <Composition id="CleanCore30v3Wide" component={CleanCore30v3} durationInFrames={CC30V3_DURATION} fps={FPS} width={1920} height={1080} />
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
