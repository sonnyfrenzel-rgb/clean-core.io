import React from 'react';
import {
  AbsoluteFill,
  Series,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  // OffthreadVideo,   // ← uncomment to drop in real screen recordings
  // staticFile,
} from 'remotion';

/* ------------------------------------------------------------------ *
 *  clean-core.io — LinkedIn spot
 *  Narrative: deterministic, transparent coverage, honest limitations.
 *  30s @ 30fps. Text-driven (LinkedIn autoplays muted).
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
const usePop = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
};

/* ---------- shared visuals ---------- */
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 900], [0, 40]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 120% at 30% 20%, ${C.bg1} 0%, ${C.bg0} 60%)` }}>
      {/* faint grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          transform: `translateY(${drift}px)`,
          maskImage: 'radial-gradient(80% 80% at 50% 40%, black 40%, transparent 100%)',
        }}
      />
      {/* green glow */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 30% at 70% 85%, ${C.greenDim} 0%, transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const StatusDot: React.FC<{ type: 'ok' | 'warn' | 'no'; size?: number }> = ({ type, size = 34 }) => {
  const fill = type === 'ok' ? C.green : type === 'warn' ? C.amber : C.red;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill={fill} opacity={0.18} />
      <circle cx="12" cy="12" r="11" fill="none" stroke={fill} strokeWidth="1.5" />
      {type === 'ok' && <path d="M7 12.5l3 3 7-7" fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      {type === 'warn' && <path d="M12 6.5v7M12 16.6v.2" fill="none" stroke={fill} strokeWidth="2.4" strokeLinecap="round" />}
      {type === 'no' && <path d="M8 8l8 8M16 8l-8 8" fill="none" stroke={fill} strokeWidth="2.2" strokeLinecap="round" />}
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
  const pop = usePop(6, 12);
  const op = useFadeIn(0, 12);
  const scale = interpolate(pop, [0, 1], [0.92, 1]);
  const badge = useFadeIn(20, 12);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: op }}>
      <div style={{ transform: `scale(${scale})` }}>
        <div style={{ opacity: badge, display: 'inline-flex', alignItems: 'center', gap: 12, border: `1px solid ${C.border}`, background: C.greenDim, borderRadius: 999, padding: '10px 22px', marginBottom: 34 }}>
          <span style={{ color: C.green, fontFamily: FONT, fontWeight: 800, fontSize: 22, letterSpacing: 2 }}>FREE FOR THE SAP COMMUNITY</span>
        </div>
        <div style={{ color: C.text, fontFamily: FONT, fontWeight: 900, fontSize: 92, lineHeight: 1, letterSpacing: -1 }}>The SAP Architect's</div>
        <div style={{ color: C.green, fontFamily: FONT, fontWeight: 900, fontSize: 100, lineHeight: 1.05, letterSpacing: -1 }}>Clean Core Accelerator</div>
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
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: useFadeIn(0, 10) }}>
      <div style={{ position: 'relative', width: 860 }}>
        <CodePanel title="Legacy ABAP" lines={abap} accent={C.muted} opacity={interpolate(t, [0, 1], [1, 0.16])} />
        <div style={{ position: 'absolute', inset: 0 }}>
          <CodePanel title="Clean Core · TypeScript" lines={ts} accent={C.green} opacity={t} style={{ borderColor: 'rgba(52,211,153,0.35)' }} />
        </div>
        {/* deterministic ✓ marker */}
        <div style={{ position: 'absolute', right: -18, top: 96, display: 'flex', alignItems: 'center', gap: 10, transform: `scale(${okPop})`, background: C.panel, border: `1px solid rgba(52,211,153,0.4)`, borderRadius: 12, padding: '8px 14px' }}>
          <StatusDot type="ok" size={26} />
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
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: useFadeIn(0, 10) }}>
      <div style={{ width: 900 }}>
        {rows.map((r, i) => {
          const p = usePop(10 + i * 12);
          return (
            <div key={i} style={{ opacity: p, transform: `translateX(${interpolate(p, [0, 1], [40, 0])}px)`, display: 'flex', alignItems: 'center', gap: 22, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px 26px', marginBottom: 20 }}>
              <StatusDot type={r.type} />
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

const S4Honesty: React.FC = () => {
  const op = useFadeIn(0, 12);
  const pop = usePop(10);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: op }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.94, 1])})`, maxWidth: 900 }}>
        <div style={{ display: 'inline-flex', gap: 16, marginBottom: 30 }}>
          <StatusDot type="warn" size={64} />
        </div>
        <div style={{ color: C.text, fontFamily: FONT, fontWeight: 800, fontSize: 66, lineHeight: 1.08 }}>
          Honest limitations.
        </div>
        <div style={{ color: C.muted, fontFamily: FONT, fontWeight: 500, fontSize: 36, lineHeight: 1.35, marginTop: 22 }}>
          We tell you exactly what to hand to an expert — instead of pretending it's fully automatic.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const S5Live: React.FC = () => {
  const op = useFadeIn(0, 12);
  const pop = usePop(8);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}>
      {/* Browser frame — drop your real screen recording where noted below */}
      <div style={{ width: 900, borderRadius: 20, overflow: 'hidden', border: `1px solid ${C.border}`, transform: `scale(${interpolate(pop, [0, 1], [0.95, 1])})`, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ height: 52, background: '#0b1220', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px' }}>
          {['#f87171', '#fbbf24', '#34d399'].map((c) => <div key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />)}
          <div style={{ marginLeft: 16, color: C.muted, fontFamily: FONT, fontSize: 22 }}>clean-core.io / analyze</div>
        </div>
        {/*
          REAL FOOTAGE: replace the mock below with your screen recording:
          <OffthreadVideo src={staticFile('screens/analyze.mp4')} style={{ width: '100%', display: 'block' }} muted />
        */}
        <div style={{ background: '#0d1526', height: 470, padding: 34, fontFamily: FONT }}>
          <div style={{ color: C.muted, fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>COVERAGE VERDICT</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
            {[{ v: '68%', l: 'Fully', c: C.green }, { v: '24%', l: 'Review', c: C.amber }, { v: '8%', l: 'Out of scope', c: C.red }].map((m) => (
              <div key={m.l} style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22 }}>
                <div style={{ color: m.c, fontSize: 54, fontWeight: 900 }}>{m.v}</div>
                <div style={{ color: C.muted, fontSize: 24, fontWeight: 600 }}>{m.l}</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.text, fontSize: 26, marginTop: 26, lineHeight: 1.5 }}>abapGit export · generated tests · evidence-bound report</div>
        </div>
      </div>
      <Caption kicker="See it on your own code" line="Run an analysis in minutes." delay={40} />
    </AbsoluteFill>
  );
};

const S6CTA: React.FC = () => {
  const op = useFadeIn(0, 12);
  const pop = usePop(8, 11);
  const btn = usePop(28, 12);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: op }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.92, 1])})` }}>
        <div style={{ color: C.muted, fontFamily: FONT, fontWeight: 700, fontSize: 34, letterSpacing: 1, marginBottom: 12 }}>Belegt, nicht behauptet.</div>
        <div style={{ color: C.text, fontFamily: FONT, fontWeight: 900, fontSize: 78, lineHeight: 1.05 }}>Accelerator with a</div>
        <div style={{ color: C.green, fontFamily: FONT, fontWeight: 900, fontSize: 86, lineHeight: 1.05, marginBottom: 46 }}>trust guarantee.</div>
        <div style={{ transform: `scale(${btn})`, display: 'inline-flex', alignItems: 'center', gap: 14, background: C.green, color: '#04240f', fontFamily: FONT, fontWeight: 900, fontSize: 40, padding: '22px 48px', borderRadius: 16 }}>
          Start free → clean-core.io
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ================= MAIN ================= */
export const CleanCoreVideo: React.FC<{ short?: boolean }> = ({ short = false }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg0 }}>
      <Background />
      {short ? (
        /* 15s cut — core + limitations, fast to CTA. Hook → Morph → Coverage(+limits) → CTA */
        <Series>
          <Series.Sequence durationInFrames={60}><S1Hook /></Series.Sequence>
          <Series.Sequence durationInFrames={105}><S2Morph /></Series.Sequence>
          <Series.Sequence durationInFrames={135}><S3Coverage /></Series.Sequence>
          <Series.Sequence durationInFrames={150}><S6CTA /></Series.Sequence>
        </Series>
      ) : (
        /* 30s cut — full narrative incl. the honesty beat + live product */
        <Series>
          <Series.Sequence durationInFrames={90}><S1Hook /></Series.Sequence>
          <Series.Sequence durationInFrames={180}><S2Morph /></Series.Sequence>
          <Series.Sequence durationInFrames={180}><S3Coverage /></Series.Sequence>
          <Series.Sequence durationInFrames={150}><S4Honesty /></Series.Sequence>
          <Series.Sequence durationInFrames={150}><S5Live /></Series.Sequence>
          <Series.Sequence durationInFrames={150}><S6CTA /></Series.Sequence>
        </Series>
      )}
    </AbsoluteFill>
  );
};
