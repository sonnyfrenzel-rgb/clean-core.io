import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';


/* ------------------------------------------------------------------ *
 *  Clean-Core.io 3.0 — launch clip, version 3h (DRAFT for review)
 *  v3h (04.10.2026): every scene with a product screen re-captured from the
 *  release build v3.0.3 (local production build of the release commit on the
 *  Firebase emulators, demo project Z_MM_PO_APPROVAL, deviceScaleFactor 2,
 *  public/screens30/v3h-*.png). Score 23 (was 28), Business opens with the next
 *  step and numbered steps, Management leads with the decision, a code branch
 *  is a "decision point" (ADR-073), Design and Transformation show the demo
 *  (engine, no model), RAP tests from your own system. Same scenes and timing.
 *  v3g (owner 02.10.): the opening hook holds long enough to read — the hook
 *  runs 9.5 s instead of 5.5 s (+4 s in total, 74 s); every later scene is
 *  unchanged.
 *  v3f (02.10.): the editor scene shows the full-screen editor with all its
 *  functions, then zooms calmly to the properties panel.
 *  v3e (02.10.): catalog count 33,877 (synced 2026-10-01, live landing on
 *  integrate/next-3.0 @ 62432186); "findings" = distinct findings (25), the
 *  31 are places in the code.
 *  v3d (owner 02.10.): clean cuts — each scene fades out completely before the
 *  next fades in; Design and Transformation from a real run of the example
 *  on integrate/next-3.0 @ 3ae36294 take the chain of evidence; <= 70 s.
 *  v3c (owner 01.10.): same content as v3b; eased cross-fades between scenes,
 *  highlights that grow in, transform-based camera (no sub-pixel jitter),
 *  a playful hook and one dry caption on the editor.
 *  Owner feedback 01.10.: max 70 s, one message per scene, each screen held
 *  long enough to read, tight crops for phones, newest 3.0 screens (rebuilt
 *  Analyze from a real signed run of the example on the dev line).
 *
 *  Square 1080 x 1080 (a 1920 x 1080 variant re-uses the same scenes on a
 *  centred 1080 stage), 30 fps, ~84 s, silent.
 *  A release tour: every scene that shows something new carries a
 *  "New in 3.0" chip. Business and management first, IT second, then the
 *  USP turn and the chain of evidence; the end card carries the approved
 *  short USP verbatim (Sonny, 01.10.2026).
 *
 *  Every product image is a real capture of the demo project
 *  Z_MM_PO_APPROVAL (fictitious code) on the dev line integrate/next-3.0
 *  @ a8814985, taken at deviceScaleFactor 2 (public/screens30/v3-*.png).
 *  The "2.x" image in the look scene is the earlier capture st-testing.png.
 *  Crops avoid every screen that says "SAP BTP" alone and every German
 *  UI word ("Ist" in the editor toolbar).
 * ------------------------------------------------------------------ */

const T = {
  page: '#f8f9ff',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  ink: '#0b1c30',
  inkMuted: '#4b5563',
  line: '#e5e7eb',
  brand: '#16a34a',
  brandStrong: '#15803d',
  brandSurface: '#f0fdf4',
  info: '#1d4ed8',
  infoBg: '#eff6ff',
  infoBorder: '#bfdbfe',
  warning: '#92400e',
  warningBg: '#fffbeb',
  hl: '#2563eb',
};
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const FADE = 10; // frames each scene fades in and out (no overlap)

const fadeIn = (f: number, start: number, len = 16) => interpolate(f, [start, start + len], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, start: number, len = 18, px = 14) => interpolate(f, [start, start + len], [px, 0], { ...clamp, easing: ease });

/* ---------- timing (frames @ 30 fps) ---------- */
const SCENES = [
  { id: 'hook', len: 285 },
  { id: 'process', len: 180 },
  { id: 'editor', len: 225 },
  { id: 'score', len: 180 },
  { id: 'views', len: 480 },
  { id: 'look', len: 150 },
  { id: 'design', len: 195 },
  { id: 'transformation', len: 195 },
  { id: 'chain', len: 180 },
  { id: 'end', len: 150 },
] as const;
export const CC30V3H_DURATION = SCENES.reduce((s, x) => s + x.len, 0);

/* ---------- font ---------- */
const useInter = () => {
  const [handle] = useState(() => delayRender('Loading Inter'));
  useEffect(() => {
    const face = new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')}) format('woff2')`, { weight: '100 900' });
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
};

/* ---------- building blocks ---------- */
const Scene: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const inOut = Easing.inOut(Easing.cubic);
  const o = Math.min(interpolate(f, [0, FADE], [0, 1], { ...clamp, easing: inOut }), interpolate(f, [len - FADE, len], [1, 0], { ...clamp, easing: inOut }));
  return (
    <AbsoluteFill style={{ background: T.page }}>
      <AbsoluteFill style={{ opacity: o, fontFamily: SANS, color: T.ink }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const NewChip: React.FC<{ children: React.ReactNode; plain?: boolean }> = ({ children, plain }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: fadeIn(f, 4) }}>
      {!plain && (
        <span
          style={{
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: '#fff',
            background: T.brandStrong,
            borderRadius: 999,
            padding: '6px 16px',
          }}
        >
          NEW IN 3.0
        </span>
      )}
      <span style={{ fontSize: 23, fontWeight: 650, color: T.brandStrong, letterSpacing: '0.01em' }}>{children}</span>
    </div>
  );
};

const Headline: React.FC<{ children: React.ReactNode; size?: number; at?: number; color?: string }> = ({ children, size = 52, at = 0, color }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: color ?? T.ink, opacity: fadeIn(f, at), transform: `translateY(${rise(f, at)}px)` }}>
      {children}
    </div>
  );
};

const Lead: React.FC<{ children: React.ReactNode; at?: number; size?: number }> = ({ children, at = 0, size = 30 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontSize: size, fontWeight: 500, lineHeight: 1.35, color: T.inkMuted, opacity: fadeIn(f, at), transform: `translateY(${rise(f, at)}px)` }}>
      {children}
    </div>
  );
};

const Footnote: React.FC<{ children: React.ReactNode; at?: number }> = ({ children, at = 20 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 34, fontSize: 19, fontWeight: 500, lineHeight: 1.4, color: T.inkMuted, opacity: fadeIn(f, at) }}>
      {children}
    </div>
  );
};

const Top: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: 60, right: 60, top: 54, display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
);

type Key = { f: number; cx: number; cy: number; vw: number };
type HL = { x: number; y: number; w: number; h: number; from: number; to?: number };

/**
 * A real capture seen through a fixed window: the camera moves over the
 * 2x image (centre cx/cy and visible width vw, in image pixels) and the
 * highlight boxes are drawn in screen space over the exact element.
 */
const Cam: React.FC<{
  src: string;
  iw: number;
  ih: number;
  w: number;
  h: number;
  keys: Key[];
  hl?: HL[];
  at?: number;
  label?: string;
  style?: React.CSSProperties;
}> = ({ src, iw, ih, w, h, keys, hl = [], at = 0, label, style }) => {
  const f = useCurrentFrame();
  const fr = keys.map((k) => k.f);
  const drift = Easing.inOut(Easing.sin);
  const pick = (sel: (k: Key) => number) => (keys.length === 1 ? sel(keys[0]) : interpolate(f, fr, keys.map(sel), { ...clamp, easing: drift }));
  const cx = pick((k) => k.cx);
  const cy = pick((k) => k.cy);
  const vw = pick((k) => k.vw);
  const s = w / vw;
  const tx = w / 2 - cx * s;
  const ty = h / 2 - cy * s;
  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: h,
        overflow: 'hidden',
        borderRadius: 16,
        border: `1.5px solid ${T.line}`,
        background: T.surface,
        boxShadow: '0 18px 50px rgba(11,28,48,0.13)',
        opacity: fadeIn(f, at, 14),
        transform: `translateY(${rise(f, at, 16, 14)}px)`,
        ...style,
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: iw,
          height: ih,
          maxWidth: 'none',
          transformOrigin: '0 0',
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${s})`,
          willChange: 'transform',
        }}
      />
      {hl.map((bx, i) => {
        const inn = interpolate(f, [bx.from, bx.from + 16], [0, 1], { ...clamp, easing: ease });
        const out = bx.to ? interpolate(f, [bx.to, bx.to + 16], [1, 0], { ...clamp, easing: ease }) : 1;
        const o = Math.min(inn, out);
        const grow = 0.92 + 0.08 * inn;
        const pad = 8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: tx + bx.x * s - pad,
              top: ty + bx.y * s - pad,
              width: bx.w * s + pad * 2,
              height: bx.h * s + pad * 2,
              border: `4px solid ${T.hl}`,
              borderRadius: 12,
              boxShadow: '0 0 0 6px rgba(37,99,235,0.16)',
              opacity: o,
              transform: `scale(${grow})`,
              transformOrigin: 'center',
            }}
          />
        );
      })}
      {label && (
        <div style={{ position: 'absolute', left: 14, top: 14, fontSize: 20, fontWeight: 800, color: '#fff', background: T.ink, borderRadius: 8, padding: '4px 12px' }}>{label}</div>
      )}
    </div>
  );
};

const Wordmark: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>
    Clean-Core<span style={{ color: T.brandStrong }}>.io</span>
  </div>
);


/* ---------- v3b helpers ---------- */
/** A fixed crop [x0,x1] x [y0,y1] of a 2x capture, shown w wide, with a barely visible drift. */
const region = (x0: number, y0: number, x1: number, y1: number, w: number, len: number, drift = 0.03) => {
  const vw = x1 - x0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    h: Math.round(((y1 - y0) * w) / vw),
    keys: [
      { f: 0, cx, cy, vw },
      { f: len, cx, cy, vw: vw * (1 - drift) },
    ],
  };
};

const Head: React.FC<{ chip: string; title: React.ReactNode; lead?: React.ReactNode; plain?: boolean }> = ({ chip, title, lead, plain }) => (
  <Top>
    <NewChip plain={plain}>{chip}</NewChip>
    <Headline size={54} at={4}>
      {title}
    </Headline>
    {lead ? (
      <Lead at={16} size={31}>
        {lead}
      </Lead>
    ) : null}
  </Top>
);

/* 1 · Hook — a question, a beat, another question, a beat, a wry answer */
const B1: React.FC = () => {
  const f = useCurrentFrame();
  const line = (at: number, size: number, color: string, children: React.ReactNode, mt = 0) => (
    <div style={{ marginTop: mt, opacity: fadeIn(f, at, 18), transform: `translateY(${rise(f, at, 20, 16)}px)`, fontSize: size, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.12, color }}>
      {children}
    </div>
  );
  return (
    <Scene len={285}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 190 }}>
        {line(
          6,
          60,
          T.ink,
          <>
            Who still understands <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 52 }}>Z_MM_PO_APPROVAL</span>?
          </>,
        )}
        {line(72, 60, T.ink, 'Who has its process documented — and up to date?', 44)}
        {line(150, 60, T.inkMuted, 'Exactly.', 56)}
        {line(180, 60, T.brandStrong, 'Nobody has to. Clean-Core.io 3.0 reads the code for you.', 56)}
      </div>
      <Footnote at={180}>Demo program · fictitious code · real screens</Footnote>
    </Scene>
  );
};

/* 2 · Process from code */
const B2: React.FC = () => {
  const c = region(42, 690, 1042, 960, 960, 180, 0.02);
  const p = region(1150, 1160, 2150, 1410, 960, 180, 0.02);
  return (
    <Scene len={180}>
      <Head chip="Process map from code" title="It reads the ABAP first — and draws the process." lead="Every step points to the line it came from." />
      <div style={{ position: 'absolute', left: 60, top: 340 }}>
        <Cam src="screens30/v3h-landing-panel.png" iw={2400} ih={1870} w={960} h={c.h} at={2} keys={c.keys} hl={[{ x: 42, y: 750, w: 1000, h: 44, from: 34 }]} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 340 + c.h + 22 }}>
        <Cam src="screens30/v3h-landing-panel.png" iw={2400} ih={1870} w={960} h={p.h} at={12} keys={p.keys} hl={[{ x: 1330, y: 1268, w: 232, h: 64, from: 60 }]} />
      </div>
      <Footnote at={30}>Line 78 of the program becomes the decision point &quot;Material given?&quot; — no model involved.</Footnote>
    </Scene>
  );
};

/* 3 · BPMN editor — the whole editor first, then a calm zoom to the properties panel */
const B3: React.FC = () => {
  const f = useCurrentFrame();
  // 16:9 box for the whole editor, then the box grows a little while the camera zooms in
  const h = Math.round(interpolate(f, [80, 132], [540, 640], { ...clamp, easing: Easing.inOut(Easing.sin) }));
  return (
  <Scene len={225}>
    <Head chip="BPMN editor" title="Edit it like a process modeller." lead="Rename CHECK_VENDOR to something a buyer would say. The line anchor stays put." />
    <div style={{ position: 'absolute', left: 60, top: 322 }}>
      <Cam
        src="screens30/v3h-editor-fullscreen.png"
        iw={3840}
        ih={2160}
        w={960}
        h={h}
        at={2}
        keys={[
          { f: 0, cx: 1920, cy: 1080, vw: 3840 },
          { f: 80, cx: 1920, cy: 1080, vw: 3840 },
          { f: 132, cx: 3140, cy: 1162, vw: 1400 },
          { f: 225, cx: 3150, cy: 1162, vw: 1380 },
        ]}
        hl={[
          { x: 50, y: 50, w: 2235, h: 80, from: 18, to: 70 },
          { x: 3195, y: 730, w: 445, h: 62, from: 138, to: 168 },
          { x: 3193, y: 1469, w: 589, h: 144, from: 172 },
        ]}
      />
    </div>
    <Footnote at={30}>bpmn-js modeller: palette, properties, minimap, compare with the as-is process, import and export as BPMN 2.0, SVG, PNG. Every save is a revision. Import in SAP Signavio not yet verified.</Footnote>
  </Scene>
  );
};

/* 4 · Clean Core Score with its bands */
const B4: React.FC = () => {
  const r = region(40, 60, 2000, 750, 960, 180, 0.02);
  return (
    <Scene len={180}>
      <Head chip="Analyze, rebuilt" title="A Clean Core Score — and what it means." lead="23 of 100: far from clean core. Each band says what stands in the way." />
      <div style={{ position: 'absolute', left: 60, top: 380 }}>
        <Cam src="screens30/v3h-score.png" iw={2060} ih={1320} w={960} h={r.h} at={2} keys={r.keys} hl={[{ x: 68, y: 368, w: 463, h: 360, from: 50 }]} />
      </div>
      <Footnote at={30}>The engine&apos;s reading of the demo program — a demo is never signed. A grade, not a compliance percentage, and not an SAP measure.</Footnote>
    </Scene>
  );
};

/* 6 · Three views in one scene */
type View = { name: string; q: string; src: string; iw: number; ih: number; r: readonly [number, number, number, number]; keys?: Key[]; note: string };
const VIEWS3: View[] = [
  {
    name: 'Business',
    q: 'Do I still need this, and what changes for me?',
    src: 'screens30/v3h-business.png',
    iw: 2434,
    ih: 1318,
    r: [0, 0, 2434, 1318] as const,
    keys: [
      { f: 0, cx: 1217, cy: 659, vw: 2434 },
      { f: 70, cx: 1217, cy: 659, vw: 2434 },
      { f: 104, cx: 800, cy: 862, vw: 1600 },
      { f: 166, cx: 790, cy: 862, vw: 1580 },
    ],
    note: 'The next step first, then the process in plain, numbered steps — each with the line it was read from.',
  },
  {
    name: 'IT',
    q: 'What exactly, where to, and is it right?',
    src: 'screens30/v3h-it-uses.png',
    iw: 1646,
    ih: 800,
    r: [0, 0, 1646, 800] as const,
    note: "Every object the code uses, with its lines and its clean core level A to D from SAP's own data.",
  },
  {
    name: 'Management',
    q: 'What do I risk, what do I decide?',
    src: 'screens30/v3h-mgmt-decision.png',
    iw: 2400,
    ih: 1289,
    r: [0, 0, 1200, 650] as const,
    keys: [
      { f: 0, cx: 520, cy: 320, vw: 1040 },
      { f: 377, cx: 520, cy: 320, vw: 1040 },
      { f: 412, cx: 1730, cy: 400, vw: 1360 },
      { f: 480, cx: 1735, cy: 400, vw: 1340 },
    ],
    note: 'The decision first — keep, rebuild, move to SAP standard or retire — and fit to standard as one figure.',
  },
];
const VSLOT = 156;
const B6: React.FC = () => {
  const f = useCurrentFrame();
  const active = Math.min(2, Math.max(0, Math.floor((f - 10) / VSLOT)));
  return (
    <Scene len={480}>
      <Top>
        <NewChip>Three views</NewChip>
        <Headline size={54} at={4}>
          One case, three views.
        </Headline>
      </Top>
      <div style={{ position: 'absolute', left: 60, top: 196, display: 'flex', border: `2px solid ${T.ink}`, borderRadius: 12, overflow: 'hidden', opacity: fadeIn(f, 8) }}>
        {VIEWS3.map((v, i) => (
          <div key={v.name} style={{ padding: '10px 30px', fontSize: 28, fontWeight: 750, background: i === active ? T.ink : T.surface, color: i === active ? '#fff' : T.ink }}>
            {v.name}
          </div>
        ))}
      </div>
      {VIEWS3.map((v, i) => {
        const s = 10 + i * VSLOT;
        const inO = i === 0 ? 1 : interpolate(f, [s, s + 8], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
        const outO = i === 2 ? 1 : interpolate(f, [s + VSLOT - 8, s + VSLOT], [1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });
        const o = f < s && i > 0 ? 0 : Math.min(inO, outO);
        const [x0, y0, x1, y1] = v.r;
        const r = region(x0, y0, x1, y1, 960, 480, 0.015);
        return (
          <div key={v.name} style={{ position: 'absolute', left: 60, top: 300, width: 960, opacity: o }}>
            <div style={{ fontSize: 34, fontWeight: 750, marginBottom: 20, lineHeight: 1.2 }}>{v.q}</div>
            <Cam src={v.src} iw={v.iw} ih={v.ih} w={960} h={v.keys ? 520 : Math.min(r.h, 520)} keys={v.keys ?? r.keys} />
            <div style={{ marginTop: 18, fontSize: 25, fontWeight: 550, color: T.inkMuted, lineHeight: 1.35 }}>{v.note}</div>
          </div>
        );
      })}
    </Scene>
  );
};

/* 7 · The new look */
const B7: React.FC = () => {
  const r = region(0, 0, 1380, 405, 960, 150, 0.02);
  return (
    <Scene len={150}>
      <Head
        chip="Rebuilt tools"
        title="A new look, closer to the SAP screens you work in every day."
        lead="Seven tools as object pages: key figures on top, details in tabs. Familiar if you know SAP Fiori."
      />
      <div style={{ position: 'absolute', left: 60, top: 450 }}>
        <Cam src="screens30/v3h-tiles.png" iw={2760} ih={405} w={960} h={r.h} at={2} keys={r.keys} />
      </div>
      <Footnote at={30}>Analyze in 3.0 · an independent design, not affiliated with or endorsed by SAP.</Footnote>
    </Scene>
  );
};

/* 7a · On the chain: a small band that says where we are */
const STEPS = ['Process', 'Design', 'Code draft', 'Tests', 'Handover'];
const ChainBand: React.FC<{ active: number }> = ({ active }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {STEPS.map((n, i) => (
      <React.Fragment key={n}>
        {i > 0 && <span style={{ fontSize: 20, fontWeight: 800, color: T.inkMuted }}>→</span>}
        <span
          style={{
            fontSize: 21,
            fontWeight: 750,
            padding: '5px 13px',
            borderRadius: 999,
            border: `2px solid ${i === active ? T.ink : T.line}`,
            background: i === active ? T.ink : T.surface,
            color: i === active ? '#fff' : i < active ? T.ink : T.inkMuted,
            whiteSpace: 'nowrap',
          }}
        >
          {i + 1} {n}
        </span>
      </React.Fragment>
    ))}
  </div>
);

/* 7b · Design */
const BD: React.FC = () => {
  const f = useCurrentFrame();
  const r = region(40, 130, 1240, 680, 960, 195, 0.02);
  return (
    <Scene len={195}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 50, opacity: fadeIn(f, 2) }}>
        <ChainBand active={1} />
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 118, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <NewChip>Design, rebuilt</NewChip>
        <Headline size={50} at={4}>
          Then the same evidence becomes a design.
        </Headline>
        <Lead at={14} size={29}>
          The target architecture, drawn from the evidence: released APIs take over the table access, line by line.
        </Lead>
      </div>
      <div style={{ position: 'absolute', left: 60, top: 420 }}>
        <Cam
          src="screens30/v3h-design-canvas.png"
          iw={1985}
          ih={1114}
          w={960}
          h={r.h}
          at={4}
          keys={r.keys}
          hl={[{ x: 111, y: 319, w: 465, h: 69, from: 50 }]}
        />
      </div>
      <Footnote at={30}>Demo project · fictitious code · the engine&apos;s reading, no model. You confirm the target yourself; in a real run the design document is a model proposal.</Footnote>
    </Scene>
  );
};

/* 7c · Transformation */
const BT: React.FC = () => {
  const f = useCurrentFrame();
  const r = region(980, 40, 2790, 1020, 960, 195, 0.02);
  return (
    <Scene len={195}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 50, opacity: fadeIn(f, 2) }}>
        <ChainBand active={2} />
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 118, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <NewChip>Transformation, rebuilt</NewChip>
        <Headline size={50} at={4}>
          And every finding gets its target for the code draft.
        </Headline>
        <Lead at={14} size={29}>
          25 findings at 31 places in the code, each with its target — the plan the model writes the code against.
        </Lead>
      </div>
      <div style={{ position: 'absolute', left: 60, top: 420 }}>
        <Cam
          src="screens30/v3h-transf-sankey.png"
          iw={2790}
          ih={1512}
          w={960}
          h={r.h}
          at={4}
          keys={r.keys}
          hl={[{ x: 1660, y: 200, w: 460, h: 80, from: 50 }]}
        />
      </div>
      <Footnote at={30}>Demo project · fictitious code. The demo stops where the model begins; in a real run every file it writes is marked as a proposal, and nothing is compiled here.</Footnote>
    </Scene>
  );
};

/* 8 · The turn + chain of evidence, compact */
type Tone = 'info' | 'proposal' | 'mock' | 'proven';
const CH: { name: string; mark: string; chip: string; tone: Tone }[] = [
  { name: 'Process', mark: 'line anchor', chip: 'Reconstructed', tone: 'info' },
  { name: 'Design', mark: 'built on the signed run', chip: 'Model proposal', tone: 'proposal' },
  { name: 'Code draft', mark: 'finding → target → file', chip: 'Model proposal', tone: 'proposal' },
  { name: 'Tests', mark: 'isolated runner · receipt', chip: 'Mock', tone: 'mock' },
  { name: 'Handover', mark: 'signature', chip: 'Proven', tone: 'proven' },
];
const toneMap = {
  info: [T.info, T.infoBg, T.infoBorder, 'solid'],
  proposal: [T.warning, T.warningBg, '#b45309', 'dashed'],
  mock: [T.warning, T.warningBg, '#b45309', 'dashed'],
  proven: [T.brandStrong, T.brandSurface, T.brandStrong, 'solid'],
} as const;
const B8: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={180}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
        <NewChip>One chain of evidence</NewChip>
        <div style={{ marginTop: 26 }}>
          <Headline size={50} at={4}>
            Other tools explain code, or rewrite it.
          </Headline>
        </div>
        <div style={{ marginTop: 18 }}>
          <Headline size={50} at={20} color={T.brandStrong}>
            Clean-Core.io does both on one chain of evidence — and says what it could not determine.
          </Headline>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 500, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CH.map((c, i) => {
          const at = 40 + i * 12;
          const [fg, bg, bd, st] = toneMap[c.tone];
          return (
            <div
              key={c.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                height: 66,
                padding: '0 22px',
                borderRadius: 12,
                background: T.surface,
                border: `1.5px solid ${T.line}`,
                borderLeft: `6px solid ${T.ink}`,
                opacity: fadeIn(f, at),
                transform: `translateX(${interpolate(f, [at, at + 12], [-14, 0], { ...clamp, easing: ease })}px)`,
              }}
            >
              <span style={{ width: 30, fontSize: 28, fontWeight: 800, color: T.inkMuted }}>{i + 1}</span>
              <span style={{ width: 210, fontSize: 31, fontWeight: 800 }}>{c.name}</span>
              <span style={{ flex: 1, fontSize: 25, fontWeight: 600, color: T.inkMuted }}>{c.mark}</span>
              <span style={{ fontSize: 21, fontWeight: 650, color: fg, background: bg, border: `1.5px ${st} ${bd}`, borderRadius: 999, padding: '4px 14px', whiteSpace: 'nowrap' }}>{c.chip}</span>
            </div>
          );
        })}
      </div>
      <Footnote at={90}>Each step says where it came from. The code is a draft for review; tests run in an isolated runner against mocks, and an ABAP Unit result from your own system is recorded as imported or self-declared.</Footnote>
    </Scene>
  );
};

/* 9 · End card */
const B9: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={150}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 160 }}>
        <div style={{ opacity: fadeIn(f, 0) }}>
          <NewChip plain>Clean-Core.io 3.0 · so nobody has to</NewChip>
        </div>
        <div style={{ marginTop: 30 }}>
          <Headline size={58} at={4}>
            From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check.
          </Headline>
        </div>
        <div style={{ marginTop: 44, display: 'flex', flexWrap: 'wrap', gap: 14, opacity: fadeIn(f, 22) }}>
          {['Free', 'No SAP licence needed'].map((t) => (
            <span key={t} style={{ fontSize: 30, fontWeight: 700, color: T.brandStrong, background: T.brandSurface, border: `2px solid ${T.brandStrong}`, borderRadius: 999, padding: '8px 22px' }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 64, opacity: fadeIn(f, 34), display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <Wordmark size={60} />
          <span style={{ fontSize: 38, fontWeight: 650, color: T.brandStrong }}>clean-core.io</span>
        </div>
      </div>
      <Footnote at={36}>Independent community project, not affiliated with or endorsed by SAP SE. No analytics, advertising or tracking cookies. Demo program: fictitious code.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
const PARTS = [B1, B2, B3, B4, B6, B7, BD, BT, B8, B9];

const Track: React.FC = () => {
  let from = 0;
  return (
    <>
      {PARTS.map((P, i) => {
        const len = SCENES[i].len;
        const el = (
          <Sequence key={SCENES[i].id} from={from} durationInFrames={len} name={SCENES[i].id}>
            <P />
          </Sequence>
        );
        from += len;
        return el;
      })}
    </>
  );
};

export const CleanCore30v3h: React.FC = () => {
  useInter();
  const { width, height } = useVideoConfig();
  if (width === height) {
    return (
      <AbsoluteFill style={{ background: T.page }}>
        <Track />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: T.page }}>
      <div style={{ position: 'absolute', left: (width - 1080) / 2, top: (height - 1080) / 2, width: 1080, height: 1080, overflow: 'hidden' }}>
        <Track />
      </div>
    </AbsoluteFill>
  );
};
