import React from 'react';
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

/* ------------------------------------------------------------------ *
 *  clean-core.io — LinkedIn spot (v2.0)
 *  Narrative: deterministic, transparent coverage, honest limitations.
 *  40s @ 30fps. Text-driven (LinkedIn autoplays muted).
 *  Premium motion: aurora bg · crossfades · draw-on icons · count-ups.
 * ------------------------------------------------------------------ */

const FONT = '"Archivo", "Inter", system-ui, -apple-system, sans-serif';
const C = {
  bg0: '#0f172a',
  bg1: '#1e1b4b',
  green: '#34d399',
  greenDim: 'rgba(52,211,153,0.14)',
  amber: '#fbbf24',
  red: '#f87171',
  text: '#e2e8f0',
  muted: '#94a3b8',
  panel: 'rgba(2,6,23,0.66)',
  border: 'rgba(148,163,184,0.22)',
};

/* ---------- helpers ---------- */
const useFadeIn = (start = 0, len = 12) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [start, start + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
};
// Slightly over-damped spring = clean, confident entrances with no playful overshoot.
const usePop = (delay = 0, damping = 20) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6, stiffness: 120 } });
};
// Gentle "breathing" 0..1 for tasteful glow pulses.
const useBreath = (speed = 0.06, phase = 0) => {
  const frame = useCurrentFrame();
  return 0.5 + 0.5 * Math.sin(frame * speed + phase);
};

/* ---------- shared visuals ---------- */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / 30; // seconds
  // Slowly drifting aurora blobs — depth, not decoration.
  const b1x = 30 + Math.sin(t * 0.45) * 12;
  const b1y = 24 + Math.cos(t * 0.38) * 9;
  const b2x = 72 + Math.cos(t * 0.33) * 10;
  const b2y = 80 + Math.sin(t * 0.42) * 8;
  const gridDrift = interpolate(frame, [0, durationInFrames], [0, 60]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 30% 20%, ${C.bg1} 0%, ${C.bg0} 62%)` }}>
      <AbsoluteFill style={{ background: `radial-gradient(38% 30% at ${b1x}% ${b1y}%, rgba(99,102,241,0.22) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(42% 33% at ${b2x}% ${b2y}%, rgba(52,211,153,0.16) 0%, transparent 70%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(30% 26% at ${100 - b1x}% ${Math.max(0, b2y - 34)}%, rgba(45,212,191,0.10) 0%, transparent 72%)` }} />
      {/* faint grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          transform: `translateY(${gridDrift}px)`,
          maskImage: 'radial-gradient(85% 85% at 50% 40%, black 35%, transparent 100%)',
        }}
      />
      {/* vignette for focus */}
      <AbsoluteFill style={{ background: 'radial-gradient(120% 100% at 50% 50%, transparent 55%, rgba(2,6,23,0.55) 100%)' }} />
    </AbsoluteFill>
  );
};

/* Status icon with an optional draw-on-stroke animation (drawAt = frame delay). */
const StatusDot: React.FC<{ type: 'ok' | 'warn' | 'no'; size?: number; drawAt?: number }> = ({ type, size = 34, drawAt }) => {
  const fill = type === 'ok' ? C.green : type === 'warn' ? C.amber : C.red;
  const draw = usePop(drawAt ?? 0);
  const dash = 26;
  const off = drawAt != null ? dash * (1 - draw) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill={fill} opacity={0.18} />
      <circle cx="12" cy="12" r="11" fill="none" stroke={fill} strokeWidth="1.5" />
      {type === 'ok' && <path d="M7 12.5l3 3 7-7" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} strokeDashoffset={off} />}
      {type === 'warn' && <path d="M12 6.5v7M12 16.6v.2" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />}
      {type === 'no' && <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
};

const ShieldDot: React.FC<{ size?: number; drawAt?: number }> = ({ size = 32, drawAt }) => {
  const draw = usePop(drawAt ?? 0);
  const dash = 20;
  const off = drawAt != null ? dash * (1 - draw) : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 2l7 3v6c0 4.6-3 7.9-7 9-4-1.1-7-4.4-7-9V5l7-3z" fill={C.green} opacity={0.16} stroke={C.green} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8.4 12l2.4 2.4L15.7 9.4" fill="none" stroke={C.green} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} strokeDashoffset={off} />
    </svg>
  );
};

const Caption: React.FC<{ kicker?: string; line: string; sub?: string; delay?: number }> = ({ kicker, line, sub, delay = 6 }) => {
  const op = useFadeIn(delay, 14);
  const y = interpolate(usePop(delay), [0, 1], [24, 0]);
  return (
    <div style={{ position: 'absolute', left: 90, right: 90, bottom: 120, opacity: op, transform: `translateY(${y}px)` }}>
      {kicker && (
        <div style={{ color: C.green, fontFamily: FONT, fontWeight: 800, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>
          {kicker}
        </div>
      )}
      <div style={{ color: C.text, fontFamily: FONT, fontWeight: 800, fontSize: 62, lineHeight: 1.05 }}>{line}</div>
      {sub && <div style={{ color: C.muted, fontFamily: FONT, fontWeight: 500, fontSize: 30, lineHeight: 1.3, marginTop: 18 }}>{sub}</div>}
    </div>
  );
};

const CodePanel: React.FC<{ title: string; lines: string[]; accent: string; opacity: number; style?: React.CSSProperties }> = ({
  title, lines, accent, opacity, style,
}) => (
  <div
    style={{
      background: C.panel, border: `1px solid ${C.border}`, borderRadius: 22, padding: '22px 26px',
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', opacity, ...style,
    }}
  >
    <div style={{ color: accent, fontSize: 20, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, fontFamily: FONT }}>
      {title}
    </div>
    {lines.map((l, i) => (
      <div key={i} style={{ color: C.text, fontSize: 26, lineHeight: 1.5, whiteSpace: 'pre' }}>{l}</div>
    ))}
  </div>
);

/* ================= SCENES ================= */

const S1Hook: React.FC = () => {
  const pop = usePop(4);
  const scale = interpolate(pop, [0, 1], [0.94, 1]);
  const badge = useFadeIn(16, 12);
  const glow = useBreath(0.07);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ transform: `scale(${scale})` }}>
        <div style={{ opacity: badge, display: 'inline-flex', alignItems: 'center', gap: 12, border: `1px solid rgba(52,211,153,0.4)`, background: C.greenDim, borderRadius: 999, padding: '10px 22px', marginBottom: 34, boxShadow: `0 0 ${26 * glow}px rgba(52,211,153,${0.18 * glow})` }}>
          <span style={{ color: C.green, fontFamily: FONT, fontWeight: 800, fontSize: 22, letterSpacing: 2 }}>v2.0 · FREE COMMUNITY EDITION</span>
        </div>
        <div style={{ color: C.text, fontFamily: FONT, fontWeight: 900, fontSize: 92, lineHeight: 1, letterSpacing: -1 }}>The SAP Architect's</div>
        <div style={{ color: C.green, fontFamily: FONT, fontWeight: 900, fontSize: 100, lineHeight: 1.05, letterSpacing: -1, textShadow: `0 0 ${40 * glow}px rgba(52,211,153,${0.35 * glow})` }}>Clean Core Accelerator</div>
      </div>
    </AbsoluteFill>
  );
};

const S2Morph: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [20, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.ease) });
  const abap = ['SELECT vbak~vbeln vbap~matnr', '  FROM vbak', '  INNER JOIN vbap', '    ON vbap~vbeln = vbak~vbeln', '  INTO TABLE lt_items.'];
  const ts = ['const items = await', '  salesOrderItem', "  .select('SalesOrder',", "          'Material');"];
  const okPop = usePop(70);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 860 }}>
        <CodePanel title="Legacy ABAP" lines={abap} accent={C.muted} opacity={interpolate(t, [0, 1], [1, 0.16])} />
        <div style={{ position: 'absolute', inset: 0 }}>
          <CodePanel title="Clean Core · TypeScript" lines={ts} accent={C.green} opacity={t} style={{ borderColor: 'rgba(52,211,153,0.35)', boxShadow: `0 0 ${interpolate(t, [0, 1], [0, 60])}px rgba(52,211,153,0.12)` }} />
        </div>
        <div style={{ position: 'absolute', right: -18, top: 96, display: 'flex', alignItems: 'center', gap: 10, transform: `scale(${okPop})`, background: C.panel, border: `1px solid rgba(52,211,153,0.4)`, borderRadius: 12, padding: '8px 14px' }}>
          <StatusDot type="ok" size={26} drawAt={74} />
          <span style={{ color: C.green, fontFamily: FONT, fontWeight: 700, fontSize: 22 }}>released CDS view · I_SalesOrderItem</span>
        </div>
      </div>
      <Caption kicker="Deterministic, not guessed" line="Legacy ABAP → Clean Core." delay={50} />
    </AbsoluteFill>
  );
};

const S3Coverage: React.FC = () => {
  const rows: { type: 'ok' | 'warn' | 'no'; label: string; note: string }[] = [
    { type: 'ok', label: 'Direct reads · static calls · inheritance', note: 'Fully mapped' },
    { type: 'warn', label: 'Complex joins · BAdI implementations', note: 'Review — expert sign-off' },
    { type: 'no', label: 'Dynpro UI · kernel calls', note: 'Out of scope — flagged' },
  ];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 900 }}>
        {rows.map((r, i) => {
          const d = 10 + i * 12;
          const p = usePop(d);
          return (
            <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`, display: 'flex', alignItems: 'center', gap: 22, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 26px', marginBottom: 20 }}>
              <StatusDot type={r.type} drawAt={r.type === 'ok' ? d + 3 : undefined} />
              <div style={{ flex: 1 }}>
                <div style={{ color: C.text, fontFamily: FONT, fontWeight: 700, fontSize: 34 }}>{r.label}</div>
                <div style={{ color: r.type === 'ok' ? C.green : r.type === 'warn' ? C.amber : C.red, fontFamily: FONT, fontWeight: 600, fontSize: 24, marginTop: 4 }}>{r.note}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Caption kicker="Transparent coverage" line="What works. What needs review. What doesn't." delay={44} />
    </AbsoluteFill>
  );
};

const S5Live: React.FC = () => {
  const frame = useCurrentFrame();
  const pop = usePop(6);
  const cnt = (target: number) => Math.round(interpolate(frame, [12, 48], [0, target], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const metrics = [{ v: cnt(68), l: 'Fully', c: C.green }, { v: cnt(24), l: 'Review', c: C.amber }, { v: cnt(8), l: 'Out of scope', c: C.red }];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 900, borderRadius: 20, overflow: 'hidden', border: `1px solid ${C.border}`, transform: `scale(${interpolate(pop, [0, 1], [0.96, 1])})`, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ height: 52, background: '#0b1220', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px' }}>
          {['#f87171', '#fbbf24', '#34d399'].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />)}
          <div style={{ marginLeft: 16, color: C.muted, fontFamily: FONT, fontSize: 22 }}>clean-core.io / analyze</div>
        </div>
        <div style={{ background: '#0d1526', height: 470, padding: 34, fontFamily: FONT }}>
          <div style={{ color: C.muted, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>COVERAGE VERDICT</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
            {metrics.map((m) => (
              <div key={m.l} style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                <div style={{ color: m.c, fontSize: 54, fontWeight: 900 }}>{m.v}%</div>
                <div style={{ color: C.muted, fontSize: 24, fontWeight: 600 }}>{m.l}</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.text, fontSize: 26, marginTop: 26, lineHeight: 1.5 }}>Server-signed audit evidence pack · abapGit · tests</div>
        </div>
      </div>
      <Caption kicker="Proof, not promises" line="A signed evidence pack — every run." delay={40} />
    </AbsoluteFill>
  );
};

const S6CTA: React.FC = () => {
  const pop = usePop(6);
  const btn = usePop(24);
  const glow = useBreath(0.08);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.94, 1])})` }}>
        <div style={{ display: 'inline-flex', border: `1px solid rgba(52,211,153,0.4)`, background: C.greenDim, borderRadius: 999, padding: '8px 20px', marginBottom: 24 }}>
          <span style={{ color: C.green, fontFamily: FONT, fontWeight: 800, fontSize: 22, letterSpacing: 2 }}>FREE COMMUNITY EDITION · v2.0</span>
        </div>
        <div style={{ color: C.text, fontFamily: FONT, fontWeight: 900, fontSize: 84, lineHeight: 1.03 }}>Proven,</div>
        <div style={{ color: C.green, fontFamily: FONT, fontWeight: 900, fontSize: 92, lineHeight: 1.05, marginBottom: 40 }}>not claimed.</div>
        <div style={{ transform: `scale(${btn})`, display: 'inline-flex', alignItems: 'center', gap: 14, background: C.green, color: '#04240f', fontFamily: FONT, fontWeight: 900, fontSize: 40, padding: '22px 48px', borderRadius: 16, boxShadow: `0 0 ${50 * glow}px rgba(52,211,153,${0.45 * glow})` }}>
          Start free → clean-core.io
        </div>
        <div style={{ color: C.muted, fontFamily: FONT, fontWeight: 500, fontSize: 28, marginTop: 26, maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
          Complementary to your SAP tools. You review before you deploy.
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ---------- v2.0 section scenes (features + security) ---------- */
const SectionHead: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => {
  const op = useFadeIn(0, 12);
  const y = interpolate(usePop(2), [0, 1], [20, 0]);
  return (
    <div style={{ position: 'absolute', top: 120, left: 90, right: 90, textAlign: 'center', opacity: op, transform: `translateY(${y}px)` }}>
      <div style={{ color: C.green, fontFamily: FONT, fontWeight: 800, fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 14 }}>{kicker}</div>
      <div style={{ color: C.text, fontFamily: FONT, fontWeight: 900, fontSize: 58, lineHeight: 1.05 }}>{title}</div>
    </div>
  );
};

const IconList: React.FC<{ items: string[]; icon: 'ok' | 'shield' }> = ({ items, icon }) => (
  <div style={{ position: 'absolute', top: 350, left: 90, right: 90 }}>
    {items.map((label, i) => {
      const d = 12 + i * 11;
      const p = usePop(d);
      return (
        <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [44, 0])}px)`, display: 'flex', alignItems: 'center', gap: 20, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
          {icon === 'shield' ? <ShieldDot size={32} drawAt={d + 3} /> : <StatusDot type="ok" size={30} drawAt={d + 3} />}
          <div style={{ color: C.text, fontFamily: FONT, fontWeight: 700, fontSize: 30, lineHeight: 1.2 }}>{label}</div>
        </div>
      );
    })}
  </div>
);

const SFeatures: React.FC = () => (
  <AbsoluteFill>
    <SectionHead kicker="Everything included — no paywall" title="One free workspace. Every feature." />
    <IconList
      icon="ok"
      items={[
        'Deterministic ABAP evidence engine',
        '7-stage workflow: analyze → delivery',
        'abapGit export · ABAP-Unit tests · BPMN',
        'Server-signed audit evidence pack',
        '5 free runs — unlimited with your own key',
      ]}
    />
  </AbsoluteFill>
);

const SSecurity: React.FC = () => (
  <AbsoluteFill>
    <SectionHead kicker="Secure by design" title="Security-hardened. Audit-friendly." />
    <IconList
      icon="shield"
      items={[
        'AI keys never leave the server',
        'Your key encrypted at rest (AES-256-GCM)',
        'Server-authoritative, HMAC-signed runs',
        'SSRF-hardened S/4 sandbox, read-only',
        'GDPR erasure · EU hosting (europe-west1)',
      ]}
    />
  </AbsoluteFill>
);

/* ================= MAIN ================= */
// Background music with a gentle fade-in and a fade-out over the final ~1.5s.
const BgAudio: React.FC<{ src: string }> = ({ src }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile(src)}
      volume={(f) =>
        interpolate(f, [0, 20, durationInFrames - 45, durationInFrames - 1], [0, 0.55, 0.55, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      }
    />
  );
};

export const CleanCoreVideo: React.FC<{ short?: boolean; audioSrc?: string }> = ({ short = false, audioSrc }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg0 }}>
      <Background />
      {/* Background music — drop an mp3 in public/ and set audioSrc (e.g. "audio/bg.mp3"). */}
      {audioSrc && <BgAudio src={audioSrc} />}
      {short ? (
        /* 15s cut — hook → morph → coverage(+limits) → CTA. Sequences 60/123/153/168 − 3×18 = 450. */
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={60}><S1Hook /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={123}><S2Morph /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={153}><S3Coverage /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={168}><S6CTA /></TransitionSeries.Sequence>
        </TransitionSeries>
      ) : (
        /* 40s cut — hook → morph → features → security → limits → proof → CTA.
           Sequences 90/183/243/243/213/153/183 − 6×18 = 1200. */
        <TransitionSeries>
          <TransitionSeries.Sequence durationInFrames={90}><S1Hook /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={183}><S2Morph /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={243}><SFeatures /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={243}><SSecurity /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={213}><S3Coverage /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={153}><S5Live /></TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 18 })} />
          <TransitionSeries.Sequence durationInFrames={183}><S6CTA /></TransitionSeries.Sequence>
        </TransitionSeries>
      )}
    </AbsoluteFill>
  );
};
