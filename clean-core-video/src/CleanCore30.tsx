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
  Easing,
} from 'remotion';

/* ------------------------------------------------------------------ *
 *  Clean-Core.io 3.0 — launch clip (DRAFT for review)
 *
 *  1080 x 1080, 30 fps, 76 s, silent (LinkedIn autoplays muted).
 *  Storyline follows the approved USP (01.10.2026): understanding first,
 *  then one chain of evidence to a reviewed, tested rebuild; the end card
 *  carries the short USP verbatim.
 *  Look follows DESIGN.md: light page, Inter, one dark surface only for
 *  code, green only where something is backed, motion only where it
 *  explains a change of state (a line lights up, a step grows out of it).
 *  No gradients, no confetti, no typewriter, no pulsing dots (§5.4).
 *
 *  Product images are the real workspace captures of the demo project
 *  Z_MM_PO_APPROVAL (fictitious code) from public/landing/*.jpg, which
 *  tests/capture-screens.spec.ts produces. Code lines in scene 2 are the
 *  real lines 225-234 of public/starter-examples/Z_MM_PO_APPROVAL.abap.
 * ------------------------------------------------------------------ */

// Tokens from app/globals.css (:root, --cc-*)
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
  neutral: '#4b5563',
  neutralBg: '#f9fafb',
  warning: '#92400e',
  warningBg: '#fffbeb',
  codeBg: '#030712',
  codeInk: '#e5e7eb',
  codeMuted: '#9ca3af',
  codeKeyword: '#c4b5fd',
  codeLiteral: '#fcd34d',
  codeName: '#93c5fd',
  codeHl: 'rgba(59,130,246,0.28)',
  codeHlBar: '#93c5fd',
};
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.bezier(0.2, 0, 0, 1);

/* ---------- timing (frames @ 30 fps) ---------- */
const SCENES = [
  { id: 'scene', len: 150 }, // 5 s  - the meeting
  { id: 'reveal', len: 300 }, // 10 s - a line lights up, a step grows out of it
  { id: 'process', len: 210 }, // 7 s - real screen: this is your process
  { id: 'map', len: 270 }, // 9 s  - BPMN map, editable, BPMN 2.0 XML
  { id: 'views', len: 330 }, // 11 s - three views
  { id: 'levels', len: 240 }, // 8 s - level A-D, target platform, buckets
  { id: 'chain', len: 390 }, // 13 s - one chain of evidence: process, design, code draft, tests, handover
  { id: 'limits', len: 180 }, // 6 s  - not determined
  { id: 'end', len: 210 }, // 7 s  - free, no tracking, invitation
] as const;
export const CC30_DURATION = SCENES.reduce((s, x) => s + x.len, 0); // 2280 = 76 s

/* ---------- font ---------- */
const useInter = () => {
  const [handle] = useState(() => delayRender('Loading Inter'));
  useEffect(() => {
    const face = new FontFace('Inter', `url(${staticFile('fonts/InterVariable.woff2')}) format('woff2')`, {
      weight: '100 900',
    });
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        continueRender(handle);
      })
      .catch(() => continueRender(handle));
  }, [handle]);
};

/* ---------- helpers ---------- */
const fadeIn = (f: number, start: number, len = 12) => interpolate(f, [start, start + len], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, start: number, len = 14, px = 14) => interpolate(f, [start, start + len], [px, 0], { ...clamp, easing: ease });

/** Every scene fades in and out over 10 frames, nothing else moves by itself. */
const Scene: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 10, len - 10, len], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ background: T.page, opacity: o, fontFamily: SANS, color: T.ink }}>{children}</AbsoluteFill>;
};

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      display: 'inline-block',
      fontSize: 20,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: T.brandStrong,
      background: T.brandSurface,
      border: `1.5px solid ${T.brandStrong}`,
      borderRadius: 999,
      padding: '6px 16px',
    }}
  >
    {children}
  </div>
);

const Headline: React.FC<{ children: React.ReactNode; size?: number; at?: number }> = ({ children, size = 54, at = 0 }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1.12,
        opacity: fadeIn(f, at),
        transform: `translateY(${rise(f, at)}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Lead: React.FC<{ children: React.ReactNode; at?: number; size?: number }> = ({ children, at = 0, size = 28 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ fontSize: size, fontWeight: 500, lineHeight: 1.45, color: T.inkMuted, opacity: fadeIn(f, at), transform: `translateY(${rise(f, at)}px)` }}>
      {children}
    </div>
  );
};

const Anchor: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <span
    style={{
      fontFamily: MONO,
      fontSize: '0.8em',
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 6,
      border: `1.5px solid ${dark ? T.codeHlBar : T.line}`,
      color: dark ? T.codeName : T.ink,
      background: dark ? 'transparent' : T.surface,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Chip: React.FC<{ tone: 'info' | 'neutral' | 'warning'; children: React.ReactNode }> = ({ tone, children }) => {
  const map = {
    info: [T.info, T.infoBg, T.infoBorder],
    neutral: [T.neutral, T.neutralBg, '#6b7280'],
    warning: [T.warning, T.warningBg, '#b45309'],
  } as const;
  const [fg, bg, bd] = map[tone];
  return (
    <span style={{ fontSize: 20, fontWeight: 600, color: fg, background: bg, border: `1.5px ${tone === 'neutral' ? 'dashed' : 'solid'} ${bd}`, borderRadius: 999, padding: '4px 14px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
};

/** A real product capture on a card, optionally with a slow pan (for long captures). */
const Shot: React.FC<{
  src: string;
  width: number;
  at?: number;
  height?: number;
  panFrom?: number;
  panTo?: number;
  panStart?: number;
  panLen?: number;
  style?: React.CSSProperties;
}> = ({ src, width, at = 0, height, panFrom = 0, panTo = 0, panStart = 0, panLen = 1, style }) => {
  const f = useCurrentFrame();
  const y = interpolate(f, [panStart, panStart + panLen], [panFrom, panTo], { ...clamp, easing: ease });
  return (
    <div
      style={{
        width,
        height,
        overflow: 'hidden',
        borderRadius: 14,
        border: `1.5px solid ${T.line}`,
        background: T.surface,
        boxShadow: '0 16px 48px rgba(11,28,48,0.12)',
        opacity: fadeIn(f, at, 14),
        transform: `translateY(${rise(f, at, 16, 20)}px)`,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ width: '100%', display: 'block', transform: `translateY(${-y}px)` }} />
    </div>
  );
};

const Footnote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: 60, right: 60, bottom: 38, fontSize: 19, fontWeight: 500, color: T.inkMuted }}>{children}</div>
);

const Wordmark: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.02em', color: T.ink }}>
    Clean-Core<span style={{ color: T.brandStrong }}>.io</span>
  </div>
);

/* ================================================================== */
/*  1 · The scene                                                      */
/* ================================================================== */
const S1: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={150}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 320 }}>
        <Headline size={62}>Somebody asks what this program actually does.</Headline>
        <div style={{ marginTop: 40, opacity: fadeIn(f, 30), fontFamily: MONO, fontSize: 44, fontWeight: 700, color: T.ink }}>Z_MM_PO_APPROVAL</div>
        <div style={{ marginTop: 44 }}>
          <Lead at={62} size={34}>
            Nobody in the room wrote it.
          </Lead>
        </div>
      </div>
      <Footnote>Demo program · fictitious code</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  2 · A line lights up, a step grows out of it (DESIGN.md §5.1)      */
/* ================================================================== */
type Tok = [string, string?];
const CODE: { n: number; t: Tok[] }[] = [
  { n: 225, t: [['FORM', T.codeKeyword], [' '], ['check_vendor', T.codeName], ['.']] },
  { n: 226, t: [['  '], ['DATA', T.codeKeyword], [' lv_lifnr '], ['TYPE', T.codeKeyword], [' lifnr.']] },
  { n: 227, t: [['']] },
  { n: 228, t: [['  '], ['SELECT SINGLE', T.codeKeyword], [' lifnr '], ['FROM', T.codeKeyword], [' zmm_vend_block '], ['INTO', T.codeKeyword], [' lv_lifnr']] },
  { n: 229, t: [['    '], ['WHERE', T.codeKeyword], [' lifnr = gs_eban-flief']] },
  { n: 230, t: [['      '], ['AND', T.codeKeyword], [' blocked = '], ["'X'", T.codeLiteral], ['.']] },
  { n: 231, t: [['  '], ['IF', T.codeKeyword], [' sy-subrc = '], ['0', T.codeLiteral], ['.']] },
  { n: 232, t: [['    '], ['PERFORM', T.codeKeyword], [' '], ['reject', T.codeName], [' '], ['USING', T.codeKeyword], [' '], ["'Vendor is on the block list'", T.codeLiteral], ['.']] },
  { n: 233, t: [['  '], ['ENDIF', T.codeKeyword], ['.']] },
  { n: 234, t: [['ENDFORM', T.codeKeyword], ['.']] },
];

const S2: React.FC = () => {
  const f = useCurrentFrame();
  // phase A: L228-231 light up (the read + the check) -> gateway "Vendor blocked?"
  // phase B: L232 lights up -> task "Reject requisition"
  const hlA = interpolate(f, [60, 72, 170, 182], [0, 1, 1, 0.35], clamp);
  const hlB = interpolate(f, [150, 162], [0, 1], clamp);
  const lineH = 44;
  const codeTop = 250;
  const gw = fadeIn(f, 92, 8);
  const task = fadeIn(f, 182, 8);
  const connA = interpolate(f, [78, 92], [0, 1], clamp);
  const connB = interpolate(f, [166, 180], [0, 1], clamp);
  const hlFor = (n: number) => (n >= 228 && n <= 231 ? hlA : n === 232 ? hlB : 0);
  return (
    <Scene len={300}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
        <Headline size={44}>It reads the ABAP before any model does.</Headline>
        <div style={{ marginTop: 14 }}>
          <Lead at={10} size={26}>
            Every step it draws points to the lines it came from.
          </Lead>
        </div>
      </div>

      {/* code surface — the only dark surface (DESIGN.md §1.1) */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: codeTop,
          width: 960,
          background: T.codeBg,
          borderRadius: 14,
          padding: '22px 0',
          fontFamily: MONO,
          fontSize: 22,
          color: T.codeInk,
          opacity: fadeIn(f, 18),
        }}
      >
        {CODE.map((row) => {
          const h = hlFor(row.n);
          return (
            <div
              key={row.n}
              style={{
                height: lineH,
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'pre',
                background: `rgba(59,130,246,${0.28 * h})`,
                borderLeft: `4px solid rgba(147,197,253,${h})`,
              }}
            >
              <span style={{ width: 74, textAlign: 'right', paddingRight: 20, color: T.codeMuted }}>{row.n}</span>
              {row.t.map(([s, c], i) => (
                <span key={i} style={{ color: c ?? T.codeInk }}>
                  {s}
                </span>
              ))}
            </div>
          );
        })}
      </div>

      {/* process fragment growing out of the lines */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: codeTop + 22 * 2 + lineH * 10 + 40, height: 190 }}>
        {/* connector from code to gateway */}
        <div style={{ position: 'absolute', left: 250, top: -40, width: 3, height: 60 * connA, background: T.codeHlBar }} />
        <div style={{ position: 'absolute', left: 640, top: -40, width: 3, height: 60 * connB, background: T.codeHlBar }} />
        {/* start of fragment: sequence flow */}
        <div style={{ position: 'absolute', left: 60, top: 76, width: 130 * gw, height: 3, background: T.ink }} />
        {/* gateway */}
        <div style={{ position: 'absolute', left: 200, top: 30, opacity: gw, transform: `scale(${0.9 + 0.1 * gw})` }}>
          <div style={{ width: 96, height: 96, transform: 'rotate(45deg)', border: `3px solid ${T.ink}`, background: T.surface, borderRadius: 6 }} />
          <div style={{ position: 'absolute', left: 30, top: 18, fontSize: 44, fontWeight: 800 }}>×</div>
          <div style={{ position: 'absolute', left: -20, top: 120, width: 240, fontSize: 22, fontWeight: 700 }}>
            Vendor blocked? <Anchor>L228–231</Anchor>
          </div>
        </div>
        {/* flow gateway -> task */}
        <div style={{ position: 'absolute', left: 340, top: 76, width: 210 * task, height: 3, background: T.ink }} />
        <div style={{ position: 'absolute', left: 390, top: 44, fontSize: 19, fontWeight: 600, color: T.inkMuted, opacity: task, fontFamily: MONO }}>
          sy-subrc = 0
        </div>
        {/* task */}
        <div
          style={{
            position: 'absolute',
            left: 560,
            top: 22,
            width: 250,
            height: 110,
            border: `3px solid ${T.ink}`,
            borderRadius: 14,
            background: T.surface,
            opacity: task,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          Reject requisition
          <Anchor>L232</Anchor>
        </div>
        <div style={{ position: 'absolute', left: 560, top: 150, opacity: fadeIn(f, 205), display: 'flex', gap: 10 }}>
          <Chip tone="info">Reconstructed</Chip>
        </div>
      </div>
      <Footnote>Lines 225–234 of the demo program Z_MM_PO_APPROVAL · fictitious code</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  3 · Real screen: "This is your process"                            */
/* ================================================================== */
const S3: React.FC = () => (
  <Scene len={210}>
    <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
      <Headline size={46}>Then it tells you what it found — including the rules written into the code.</Headline>
    </div>
    <div style={{ position: 'absolute', left: 60, top: 270 }}>
      <Shot src="screens30/business.png" width={960} height={640} at={12} />
    </div>
    <Footnote>Real screen · demo project, Business view</Footnote>
  </Scene>
);

/* ================================================================== */
/*  4 · The BPMN map                                                   */
/* ================================================================== */
const S4: React.FC = () => (
  <Scene len={270}>
    <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
      <Headline size={46}>Drawn as BPMN. You can edit it.</Headline>
      <div style={{ marginTop: 16 }}>
        <Lead at={20} size={26}>
          It leaves as a BPMN 2.0 XML file for SAP Signavio. Import into Signavio has not been verified yet — no connection, just the file.
        </Lead>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 60, top: 300 }}>
      <Shot src="screens30/map.png" width={960} height={660} at={10} panFrom={0} panTo={40} panStart={60} panLen={180} />
    </div>
    <Footnote>Real screen · process map of the demo project</Footnote>
  </Scene>
);

/* ================================================================== */
/*  5 · Three views                                                    */
/* ================================================================== */
const VIEWS = [
  { name: 'Business', q: 'Do I still need this, and what changes for me?', img: 'screens30/business.png', h: 491 },
  { name: 'IT', q: 'What exactly, where to, and is it right?', img: 'screens30/it-view.png', h: 296 },
  { name: 'Management', q: 'What do I risk, what do I decide?', img: 'screens30/mgmt-top.png', h: 276 },
];
const S5: React.FC = () => {
  const f = useCurrentFrame();
  const slot = 95;
  const start = 30;
  const active = Math.min(2, Math.max(0, Math.floor((f - start) / slot)));
  return (
    <Scene len={330}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
        <Headline size={46}>One case, three views, the same facts.</Headline>
      </div>
      {/* segmented control — selection carries ink, not green (DESIGN.md ADR-007) */}
      <div style={{ position: 'absolute', left: 60, top: 170, display: 'flex', border: `1.5px solid ${T.ink}`, borderRadius: 10, overflow: 'hidden', opacity: fadeIn(f, 10) }}>
        {VIEWS.map((v, i) => (
          <div key={v.name} style={{ padding: '10px 26px', fontSize: 24, fontWeight: 700, background: i === active ? T.ink : T.surface, color: i === active ? '#fff' : T.ink }}>
            {v.name}
          </div>
        ))}
      </div>
      {VIEWS.map((v, i) => {
        const o = interpolate(f, [start + i * slot, start + i * slot + 10, start + (i + 1) * slot, start + (i + 1) * slot + 10], [0, 1, 1, i === 2 ? 1 : 0], clamp);
        return (
          <div key={v.name} style={{ position: 'absolute', left: 60, top: 260, width: 960, opacity: o }}>
            <div style={{ fontSize: 34, fontWeight: 700, marginBottom: 24 }}>{v.q}</div>
            <div style={{ width: 960, borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${T.line}`, background: T.surface, boxShadow: '0 16px 48px rgba(11,28,48,0.12)' }}>
              <Img src={staticFile(v.img)} style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        );
      })}
      <Footnote>A view only orders what you see. It is never stored, and it changes no result.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  6 · Level A-D per SAP object, target platform, four buckets        */
/* ================================================================== */
const S6: React.FC = () => (
  <Scene len={240}>
    <div style={{ position: 'absolute', left: 60, right: 60, top: 64 }}>
      <Headline size={44}>A clean core level, A to D, for every SAP object it touches.</Headline>
      <div style={{ marginTop: 16 }}>
        <Lead at={16} size={26}>
          Private Edition or Public Edition: the target decides what you keep, what you rebuild, and what waits for SAP.
        </Lead>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 60, top: 330 }}>
      <Shot src="screens30/it-levels.png" width={960} at={20} />
    </div>
    <div style={{ position: 'absolute', left: 60, top: 520 }}>
      <Shot src="screens30/mgmt-buckets.png" width={960} height={420} at={70} />
    </div>
    <Footnote>The level is a reading of SAP's published data — an orientation, not part of a signed audit pack. ATC stays the check.</Footnote>
  </Scene>
);

/* ================================================================== */
/*  7 · One chain of evidence: process → design → code draft →        */
/*      tests → handover, each with the mark of where it came from     */
/*      (owner's USP decision, 01.10.2026)                             */
/* ================================================================== */
type ChainTone = 'info' | 'proposal' | 'mock' | 'proven';
const CHAIN: { name: string; mark: string; chip: string; tone: ChainTone; img: string | null; note: string }[] = [
  { name: 'Process', mark: 'line anchor · L87', chip: 'Reconstructed', tone: 'info', img: 'screens30/map.png', note: 'Every element of the process points to the line it came from.' },
  { name: 'Design', mark: 'built on the signed run', chip: 'Model proposal', tone: 'proposal', img: null, note: 'A target design for the route the evidence points to — a proposal until you record the target you accept.' },
  { name: 'Code draft', mark: 'every finding at its line', chip: 'Model proposal', tone: 'proposal', img: 'screens30/st-transformation.png', note: 'The transformed code: a draft you review, not a finished product.' },
  { name: 'Tests', mark: 'isolated runner · test receipt', chip: 'Demonstrated · mock', tone: 'mock', img: 'screens30/st-testing.png', note: 'Test scenarios for the generated code, run in an isolated runner — not in your S/4HANA system.' },
  { name: 'Handover', mark: 'signature · HMAC + Ed25519', chip: 'Proven', tone: 'proven', img: 'screens30/st-delivery.png', note: 'A pack signed over the run, verifiable offline. A signature proves origin, not correctness.' },
];
const ChainChip: React.FC<{ tone: ChainTone; children: React.ReactNode }> = ({ tone, children }) => {
  const map = {
    info: [T.info, T.infoBg, T.infoBorder, 'solid'],
    proposal: [T.warning, T.warningBg, '#b45309', 'dashed'],
    mock: [T.warning, T.warningBg, '#b45309', 'dashed'],
    proven: [T.brandStrong, T.brandSurface, T.brandStrong, 'solid'],
  } as const;
  const [fg, bg, bd, st] = map[tone];
  return (
    <span style={{ fontSize: 15, fontWeight: 600, color: fg, background: bg, border: `1.5px ${st} ${bd}`, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
};
const S7_LEN = 390;
const S7: React.FC = () => {
  const f = useCurrentFrame();
  const slot = 66;
  const start = 36;
  const idx = Math.min(CHAIN.length - 1, Math.max(0, Math.floor((f - start) / slot)));
  return (
    <Scene len={S7_LEN}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 56 }}>
        <Headline size={38}>Then the same evidence carries on — on one chain.</Headline>
        <div style={{ marginTop: 12 }}>
          <Lead at={14} size={24}>
            Each step says where it came from: a line, a model proposal, the run it was built on, a signature.
          </Lead>
        </div>
      </div>
      {/* the chain — selection carries ink, green only on what is backed (DESIGN.md) */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: 252, display: 'flex', gap: 14 }}>
        {CHAIN.map((c, i) => {
          const on = f >= start + i * slot;
          const cur = i === idx && on;
          return (
            <div key={c.name} style={{ position: 'relative', flex: 1, minWidth: 0, opacity: on ? 1 : 0.35 }}>
              {i > 0 && <div style={{ position: 'absolute', left: -14, top: 34, width: 14, textAlign: 'center', fontSize: 20, fontWeight: 800, color: T.inkMuted }}>→</div>}
              <div
                style={{
                  height: 150,
                  borderRadius: 12,
                  border: `1.5px solid ${cur ? T.ink : T.line}`,
                  borderTop: `4px solid ${on ? T.ink : T.line}`,
                  background: cur ? T.surface : T.surfaceMuted,
                  padding: '12px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  boxShadow: cur ? '0 10px 30px rgba(11,28,48,0.12)' : 'none',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {i + 1} · {c.name}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: T.inkMuted, lineHeight: 1.3 }}>{c.mark}</div>
                <div style={{ marginTop: 'auto' }}>
                  <ChainChip tone={c.tone}>{c.chip}</ChainChip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {CHAIN.map((c, i) => {
        const o = interpolate(f, [start + i * slot, start + i * slot + 10, start + (i + 1) * slot, start + (i + 1) * slot + 10], [0, 1, 1, i === CHAIN.length - 1 ? 1 : 0], clamp);
        return (
          <div key={c.name} style={{ position: 'absolute', left: 60, top: 436, width: 960, opacity: o }}>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, lineHeight: 1.3 }}>{c.note}</div>
            {c.img ? (
              <div style={{ width: 960, height: 440, borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${T.line}`, background: T.surface, boxShadow: '0 16px 48px rgba(11,28,48,0.12)' }}>
                <Img src={staticFile(c.img)} style={{ width: '100%', display: 'block' }} />
              </div>
            ) : (
              <div style={{ width: 960, height: 300, borderRadius: 14, border: `1.5px dashed #b45309`, background: T.warningBg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 48px', gap: 18 }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Drawn card, not a screen</div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>Target design</div>
                <div style={{ fontSize: 24, fontWeight: 500, color: T.inkMuted, lineHeight: 1.4 }}>
                  Proposed from the evidence of the signed run. You record which target you accept — a self-declaration, not a mandate.
                </div>
                <div>
                  <ChainChip tone="proposal">Model proposal</ChainChip>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Footnote>Real screens · demo project. The code is a draft for review; the demo signs nothing, and says so.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  8 · What it cannot tell                                            */
/* ================================================================== */
const S8: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={180}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 230 }}>
        <Headline size={56}>And what it cannot tell from the code, it says.</Headline>
        <div style={{ marginTop: 44, display: 'flex', gap: 14, flexWrap: 'wrap', opacity: fadeIn(f, 30) }}>
          <Chip tone="neutral">Not determined</Chip>
          <span style={{ fontSize: 26, fontWeight: 500, color: T.inkMuted }}>dynamic call · include not uploaded · usage unknown</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 60, top: 600 }}>
        <Shot src="screens30/facets.png" width={960} at={50} />
      </div>
    </Scene>
  );
};

/* ================================================================== */
/*  9 · End card                                                       */
/* ================================================================== */
const S9: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={210}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 200 }}>
        <div style={{ opacity: fadeIn(f, 0) }}>
          <Eyebrow>Clean-Core.io 3.0</Eyebrow>
        </div>
        <div style={{ marginTop: 34 }}>
          <Headline size={52} at={8}>
            From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check.
          </Headline>
        </div>
        <div style={{ marginTop: 34 }}>
          <Lead at={30} size={30}>
            Free for the SAP community. No analytics, advertising or tracking cookies. The code is a draft you review.
          </Lead>
        </div>
        <div style={{ marginTop: 60, opacity: fadeIn(f, 55), display: 'flex', alignItems: 'center', gap: 24 }}>
          <Wordmark size={44} />
          <span style={{ fontSize: 30, fontWeight: 600, color: T.brandStrong }}>clean-core.io</span>
        </div>
      </div>
      <Footnote>Independent community project, not affiliated with or endorsed by SAP SE. Demo program: fictitious code.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
export const CleanCore30: React.FC = () => {
  useInter();
  const parts = [S1, S2, S3, S4, S5, S6, S7, S8, S9];
  let from = 0;
  return (
    <AbsoluteFill style={{ background: T.page }}>
      {parts.map((P, i) => {
        const len = SCENES[i].len;
        const el = (
          <Sequence key={SCENES[i].id} from={from} durationInFrames={len} name={SCENES[i].id}>
            <P />
          </Sequence>
        );
        from += len;
        return el;
      })}
    </AbsoluteFill>
  );
};
