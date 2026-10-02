import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';

/* ------------------------------------------------------------------ *
 *  Clean-Core.io 3.0 — launch clip, version 3c (DRAFT for review)
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
const XFADE = 20; // frames of cross-fade between scenes (0.67 s)

const fadeIn = (f: number, start: number, len = 16) => interpolate(f, [start, start + len], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, start: number, len = 18, px = 14) => interpolate(f, [start, start + len], [px, 0], { ...clamp, easing: ease });

/* ---------- timing (frames @ 30 fps) ---------- */
const SCENES = [
  { id: 'hook', len: 225 },
  { id: 'process', len: 210 },
  { id: 'editor', len: 210 },
  { id: 'score', len: 210 },
  { id: 'source', len: 210 },
  { id: 'views', len: 540 },
  { id: 'look', len: 210 },
  { id: 'chain', len: 255 },
  { id: 'end', len: 180 },
] as const;
export const CC30V3C_DURATION = SCENES.reduce((s, x) => s + x.len, 0) - XFADE * (SCENES.length - 1);

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
  void len;
  return <AbsoluteFill style={{ background: T.page, fontFamily: SANS, color: T.ink }}>{children}</AbsoluteFill>;
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
        opacity: fadeIn(f, at, 18),
        transform: `translateY(${rise(f, at, 20, 18)}px)`,
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
    <Scene len={225}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 190 }}>
        {line(
          6,
          60,
          T.ink,
          <>
            Who still understands <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 52 }}>Z_MM_PO_APPROVAL</span>?
          </>,
        )}
        {line(50, 60, T.ink, 'Who has its process documented — and up to date?', 44)}
        {line(100, 60, T.inkMuted, 'Exactly.', 56)}
        {line(125, 60, T.brandStrong, 'Nobody has to. Clean-Core.io 3.0 reads the code for you.', 56)}
      </div>
      <Footnote at={125}>Demo program · fictitious code · real screens</Footnote>
    </Scene>
  );
};

/* 2 · Process from code */
const B2: React.FC = () => {
  const c = region(42, 690, 1042, 960, 960, 210, 0.02);
  const p = region(1150, 1090, 2150, 1340, 960, 210, 0.02);
  return (
    <Scene len={210}>
      <Head chip="Process map from code" title="It reads the ABAP first — and draws the process." lead="Every step points to the line it came from." />
      <div style={{ position: 'absolute', left: 60, top: 340 }}>
        <Cam src="screens30/v3-landing-panel.png" iw={2400} ih={1400} w={960} h={c.h} at={8} keys={c.keys} hl={[{ x: 42, y: 705, w: 1000, h: 40, from: 50 }]} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 340 + c.h + 22 }}>
        <Cam src="screens30/v3-landing-panel.png" iw={2400} ih={1400} w={960} h={p.h} at={30} keys={p.keys} hl={[{ x: 1325, y: 1215, w: 245, h: 80, from: 80 }]} />
      </div>
      <Footnote at={30}>Line 78 of the program becomes the decision &quot;Material given?&quot; — no model involved.</Footnote>
    </Scene>
  );
};

/* 3 · BPMN editor */
const B3: React.FC = () => {
  const L = region(380, 700, 1150, 1484, 560, 210, 0.02);
  return (
    <Scene len={210}>
      <Head chip="BPMN editor" title="Edit it like a process modeller." lead="Rename CHECK_VENDOR to something a buyer would say. The line anchor stays put." />
      <div style={{ position: 'absolute', left: 60, top: 340 }}>
        <Cam src="screens30/v3-editor.png" iw={2816} ih={1536} w={560} h={L.h} at={8} keys={L.keys} hl={[{ x: 535, y: 970, w: 170, h: 156, from: 40 }]} />
      </div>
      <div style={{ position: 'absolute', left: 640, top: 340 }}>
        <Cam
          src="screens30/v3-editor.png"
          iw={2816}
          ih={1536}
          w={380}
          h={L.h}
          at={20}
          keys={[{ f: 0, cx: 2503, cy: 1010, vw: 626 }]}
          hl={[
            { x: 2196, y: 563, w: 458, h: 71, from: 40, to: 100 },
            { x: 2202, y: 1320, w: 588, h: 140, from: 105 },
          ]}
        />
      </div>
      <Footnote at={30}>bpmn-js modeller · every save is a new revision · leaves as a BPMN 2.0 XML file for SAP Signavio (import there not yet verified).</Footnote>
    </Scene>
  );
};

/* 4 · Clean Core Score with its bands */
const B4: React.FC = () => {
  const r = region(40, 115, 1664, 760, 960, 210, 0.02);
  return (
    <Scene len={210}>
      <Head chip="Analyze, rebuilt" title="A Clean Core Score — and what it means." lead="28 of 100: far from clean core. Each band says what stands in the way." />
      <div style={{ position: 'absolute', left: 60, top: 380 }}>
        <Cam src="screens30/v3b-score.png" iw={1704} ih={1518} w={960} h={r.h} at={8} keys={r.keys} hl={[{ x: 58, y: 318, w: 388, h: 440, from: 70 }]} />
      </div>
      <Footnote at={30}>Real signed run of the example on the 3.0 line. A grade, not a compliance percentage, and not an SAP measure.</Footnote>
    </Scene>
  );
};

/* 5 · A dot on the program map opens the code */
const B5: React.FC = () => {
  const r = region(0, 0, 1588, 908, 960, 210, 0.02);
  return (
    <Scene len={210}>
      <Head chip="Analyze, rebuilt" title="Every finding at its line." lead="Pick a dot on the program map, read the code behind it." />
      <div style={{ position: 'absolute', left: 60, top: 380 }}>
        <Cam src="screens30/v3b-source.png" iw={1588} ih={908} w={960} h={r.h} at={8} keys={r.keys} hl={[{ x: 40, y: 518, w: 1500, h: 44, from: 45 }]} />
      </div>
      <Footnote at={30}>Critical: a direct write to SAP table EBAN at line 246 — with the successor SAP names.</Footnote>
    </Scene>
  );
};

/* 6 · Three views in one scene */
const VIEWS3 = [
  {
    name: 'Business',
    q: 'Do I still need this, and what changes for me?',
    src: 'screens30/v3-business-process.png',
    iw: 2432,
    ih: 1192,
    r: [20, 235, 1440, 700] as const,
    note: '11 business rules hard-coded in the program, each with its line.',
  },
  {
    name: 'IT',
    q: 'What exactly, where to, and is it right?',
    src: 'screens30/v3-it-levels.png',
    iw: 1680,
    ih: 1090,
    r: [30, 180, 1680, 770] as const,
    note: "A clean core level A to D per SAP object, from SAP's own data — 33,864 objects classified.",
  },
  {
    name: 'Management',
    q: 'What do I risk, what do I decide?',
    src: 'screens30/v3-mgmt-charts.png',
    iw: 1536,
    ih: 1048,
    r: [0, 465, 1536, 1048] as const,
    note: 'Where the objects stand, and how much of the case is backed by evidence. Same facts in every view.',
  },
];
const VSLOT = 168;
const B6: React.FC = () => {
  const f = useCurrentFrame();
  const active = Math.min(2, Math.max(0, Math.floor((f - 18) / VSLOT)));
  return (
    <Scene len={540}>
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
        const s = 18 + i * VSLOT;
        const o = interpolate(f, [s - 9, s + 9, s + VSLOT - 9, s + VSLOT + 9], [0, 1, 1, i === 2 ? 1 : 0], { ...clamp, easing: ease });
        const [x0, y0, x1, y1] = v.r;
        const r = region(x0, y0, x1, y1, 960, 540, 0.015);
        return (
          <div key={v.name} style={{ position: 'absolute', left: 60, top: 300, width: 960, opacity: o }}>
            <div style={{ fontSize: 34, fontWeight: 750, marginBottom: 20, lineHeight: 1.2 }}>{v.q}</div>
            <Cam src={v.src} iw={v.iw} ih={v.ih} w={960} h={Math.min(r.h, 520)} keys={r.keys} />
            <div style={{ marginTop: 18, fontSize: 25, fontWeight: 550, color: T.inkMuted, lineHeight: 1.35 }}>{v.note}</div>
          </div>
        );
      })}
    </Scene>
  );
};

/* 7 · The new look */
const B7: React.FC = () => {
  const r = region(0, 0, 1185, 392, 960, 210, 0.02);
  return (
    <Scene len={210}>
      <Head
        chip="Rebuilt tools"
        title="A new look, closer to the SAP screens you work in every day."
        lead="Seven tools as object pages: key figures on top, details in tabs. Familiar if you know SAP Fiori."
      />
      <div style={{ position: 'absolute', left: 60, top: 450 }}>
        <Cam src="screens30/v3b-tiles.png" iw={2372} ih={392} w={960} h={r.h} at={8} keys={r.keys} />
      </div>
      <Footnote at={30}>Analyze in 3.0 · an independent design, not affiliated with or endorsed by SAP.</Footnote>
    </Scene>
  );
};

/* 8 · The turn + chain of evidence, compact */
type Tone = 'info' | 'proposal' | 'mock' | 'proven';
const CH: { name: string; mark: string; chip: string; tone: Tone }[] = [
  { name: 'Process', mark: 'line anchor', chip: 'Reconstructed', tone: 'info' },
  { name: 'Design', mark: 'built on the signed run', chip: 'Model proposal', tone: 'proposal' },
  { name: 'Code draft', mark: 'finding by finding', chip: 'Model proposal', tone: 'proposal' },
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
    <Scene len={255}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
        <NewChip>One chain of evidence</NewChip>
        <div style={{ marginTop: 26 }}>
          <Headline size={50} at={4}>
            Other tools explain code, or rewrite it.
          </Headline>
        </div>
        <div style={{ marginTop: 18 }}>
          <Headline size={50} at={30} color={T.brandStrong}>
            Clean-Core.io does both on one chain of evidence — and says what it could not determine.
          </Headline>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 500, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CH.map((c, i) => {
          const at = 60 + i * 20;
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
      <Footnote at={140}>Each step says where it came from. The code is a draft for review; tests run in an isolated runner against mocks, not in your S/4HANA system.</Footnote>
    </Scene>
  );
};

/* 9 · End card */
const B9: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={180}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 160 }}>
        <div style={{ opacity: fadeIn(f, 0) }}>
          <NewChip plain>Clean-Core.io 3.0 · so nobody has to</NewChip>
        </div>
        <div style={{ marginTop: 30 }}>
          <Headline size={58} at={4}>
            From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check.
          </Headline>
        </div>
        <div style={{ marginTop: 44, display: 'flex', flexWrap: 'wrap', gap: 14, opacity: fadeIn(f, 28) }}>
          {['Free', 'No SAP licence needed'].map((t) => (
            <span key={t} style={{ fontSize: 30, fontWeight: 700, color: T.brandStrong, background: T.brandSurface, border: `2px solid ${T.brandStrong}`, borderRadius: 999, padding: '8px 22px' }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 64, opacity: fadeIn(f, 46), display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <Wordmark size={60} />
          <span style={{ fontSize: 38, fontWeight: 650, color: T.brandStrong }}>clean-core.io</span>
        </div>
      </div>
      <Footnote at={50}>Independent community project, not affiliated with or endorsed by SAP SE. No analytics, advertising or tracking cookies. Demo program: fictitious code.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
const PARTS = [B1, B2, B3, B4, B5, B6, B7, B8, B9];

const xfade = () => linearTiming({ durationInFrames: XFADE, easing: Easing.inOut(Easing.cubic) });

const Track: React.FC = () => (
  <TransitionSeries>
    {PARTS.flatMap((P, i) => {
      const seq = (
        <TransitionSeries.Sequence key={SCENES[i].id} durationInFrames={SCENES[i].len} name={SCENES[i].id}>
          <P />
        </TransitionSeries.Sequence>
      );
      return i === 0 ? [seq] : [<TransitionSeries.Transition key={'t' + i} presentation={fade()} timing={xfade()} />, seq];
    })}
  </TransitionSeries>
);

export const CleanCore30v3c: React.FC = () => {
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
