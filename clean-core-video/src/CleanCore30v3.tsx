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
 *  Clean-Core.io 3.0 — launch clip, version 3 (DRAFT for review)
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
const ease = Easing.bezier(0.33, 0, 0.2, 1);

const fadeIn = (f: number, start: number, len = 12) => interpolate(f, [start, start + len], [0, 1], { ...clamp, easing: ease });
const rise = (f: number, start: number, len = 14, px = 16) => interpolate(f, [start, start + len], [px, 0], { ...clamp, easing: ease });

/* ---------- timing (frames @ 30 fps) ---------- */
const SCENES = [
  { id: 'hook', len: 120 },
  { id: 'process', len: 210 },
  { id: 'business', len: 210 },
  { id: 'editor', len: 210 },
  { id: 'exchange', len: 150 },
  { id: 'it', len: 240 },
  { id: 'management', len: 210 },
  { id: 'look', len: 300 },
  { id: 'turn', len: 105 },
  { id: 'chain', len: 530 },
  { id: 'end', len: 240 },
] as const;
export const CC30V3_DURATION = SCENES.reduce((s, x) => s + x.len, 0);

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
  const o = interpolate(f, [0, 10, len - 10, len], [0, 1, 1, 0], clamp);
  return <AbsoluteFill style={{ background: T.page, opacity: o, fontFamily: SANS, color: T.ink }}>{children}</AbsoluteFill>;
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
  const pick = (sel: (k: Key) => number) => (keys.length === 1 ? sel(keys[0]) : interpolate(f, fr, keys.map(sel), { ...clamp, easing: ease }));
  const cx = pick((k) => k.cx);
  const cy = pick((k) => k.cy);
  const vw = pick((k) => k.vw);
  const s = w / vw;
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
        transform: `translateY(${rise(f, at, 16, 22)}px)`,
        ...style,
      }}
    >
      <Img src={staticFile(src)} style={{ position: 'absolute', left: w / 2 - cx * s, top: h / 2 - cy * s, width: iw * s, height: ih * s, maxWidth: 'none' }} />
      {hl.map((b, i) => {
        const o = b.to ? interpolate(f, [b.from, b.from + 10, b.to, b.to + 10], [0, 1, 1, 0], clamp) : fadeIn(f, b.from, 10);
        const pad = 8;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: w / 2 + (b.x - cx) * s - pad,
              top: h / 2 + (b.y - cy) * s - pad,
              width: b.w * s + pad * 2,
              height: b.h * s + pad * 2,
              border: `4px solid ${T.hl}`,
              borderRadius: 12,
              boxShadow: '0 0 0 6px rgba(37,99,235,0.16)',
              opacity: o,
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

/* ================================================================== */
/*  1 · Hook                                                           */
/* ================================================================== */
const S1: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={120}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 250 }}>
        <div style={{ opacity: fadeIn(f, 0) }}>
          <NewChip plain>Clean-Core.io 3.0 · what's new</NewChip>
        </div>
        <div style={{ marginTop: 40 }}>
          <Headline size={68} at={6}>
            A Z-program nobody understands.
          </Headline>
        </div>
        <div style={{ marginTop: 34, opacity: fadeIn(f, 26), fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 42, fontWeight: 700 }}>Z_MM_PO_APPROVAL</div>
        <div style={{ marginTop: 44 }}>
          <Headline size={68} at={50} color={T.brandStrong}>
            Can it go?
          </Headline>
        </div>
      </div>
      <Footnote>Demo program · fictitious code · real screens</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  2 · Code first, process from code                                  */
/* ================================================================== */
const S2: React.FC = () => (
  <Scene len={210}>
    <Top>
      <NewChip>Process map from code</NewChip>
      <Headline size={50} at={4}>
        It reads the ABAP before any model does — and draws the process.
      </Headline>
      <Lead at={20}>Every step points to the line it came from.</Lead>
    </Top>
    <div style={{ position: 'absolute', left: 60, top: 380 }}>
      <Cam
        src="screens30/v3-landing-panel.png"
        iw={2400}
        ih={1400}
        w={960}
        h={580}
        at={8}
        keys={[
          { f: 0, cx: 1200, cy: 700, vw: 2400 },
          { f: 60, cx: 1200, cy: 700, vw: 2400 },
          { f: 170, cx: 1150, cy: 880, vw: 2200 },
        ]}
        hl={[
          { x: 40, y: 700, w: 1000, h: 46, from: 80 },
          { x: 1320, y: 1215, w: 260, h: 90, from: 110 },
        ]}
      />
    </div>
    <Footnote at={30}>Real screen · demo project · line 78 and the decision it became</Footnote>
  </Scene>
);

/* ================================================================== */
/*  3 · Business view                                                  */
/* ================================================================== */
const S3: React.FC = () => (
  <Scene len={210}>
    <Top>
      <NewChip>Business view</NewChip>
      <Headline size={50} at={4}>
        This is your process — and the rules hidden in it.
      </Headline>
      <Lead at={20}>Hard-coded tolerances, plants and limits, each with its line.</Lead>
    </Top>
    <div style={{ position: 'absolute', left: 60, top: 380 }}>
      <Cam
        src="screens30/v3-business-process.png"
        iw={2432}
        ih={1192}
        w={960}
        h={560}
        at={8}
        keys={[
          { f: 0, cx: 1216, cy: 596, vw: 2150 },
          { f: 50, cx: 1216, cy: 596, vw: 2150 },
          { f: 150, cx: 830, cy: 470, vw: 1650 },
        ]}
        hl={[
          { x: 34, y: 255, w: 1390, h: 220, from: 60 },
          { x: 34, y: 605, w: 1580, h: 75, from: 125 },
        ]}
      />
    </div>
    <Footnote at={30}>Real screen · demo project, Business view: "Do I still need this, and what changes for me?"</Footnote>
  </Scene>
);

/* ================================================================== */
/*  4 · BPMN editor                                                    */
/* ================================================================== */
const S4: React.FC = () => (
  <Scene len={210}>
    <Top>
      <NewChip>BPMN editor</NewChip>
      <Headline size={50} at={4}>
        Edit it like a process modeller.
      </Headline>
      <Lead at={20}>Rename a step for the business — the line anchor stays.</Lead>
    </Top>
    <div style={{ position: 'absolute', left: 60, top: 330 }}>
      <Cam
        src="screens30/v3-editor.png"
        iw={2816}
        ih={1536}
        w={960}
        h={630}
        at={8}
        keys={[
          { f: 0, cx: 1408, cy: 900, vw: 2816 },
          { f: 70, cx: 1408, cy: 900, vw: 2816 },
          { f: 170, cx: 2180, cy: 1090, vw: 1250 },
        ]}
        hl={[
          { x: 532, y: 963, w: 176, h: 147, from: 30, to: 95 },
          { x: 2197, y: 560, w: 600, h: 74, from: 105, to: 150 },
          { x: 2190, y: 1305, w: 610, h: 150, from: 150 },
        ]}
      />
    </div>
    <Footnote at={30}>Real screen · the modeller (bpmn-js) on the demo process · palette, canvas, properties</Footnote>
  </Scene>
);

/* ================================================================== */
/*  5 · Revisions and the BPMN 2.0 file                                */
/* ================================================================== */
const S5: React.FC = () => (
  <Scene len={150}>
    <Top>
      <NewChip>BPMN editor</NewChip>
      <Headline size={50} at={4}>
        Every save is a revision. The model leaves as BPMN 2.0 XML.
      </Headline>
      <Lead at={18}>Bring a file back in: it becomes a proposal for the next revision, and Clean-Core.io says which line anchors survived.</Lead>
    </Top>
    <div style={{ position: 'absolute', left: 60, top: 470 }}>
      <Cam
        src="screens30/v3-editor-import.png"
        iw={1532}
        ih={598}
        w={960}
        h={375}
        at={10}
        keys={[{ f: 0, cx: 766, cy: 299, vw: 1532 }]}
        hl={[
          { x: 30, y: 70, w: 700, h: 50, from: 45 },
          { x: 1212, y: 495, w: 300, h: 80, from: 85 },
        ]}
      />
    </div>
    <Footnote at={30}>Exchange with SAP Signavio is by file, no connection. Import on the Signavio side has not been verified yet.</Footnote>
  </Scene>
);

/* ================================================================== */
/*  6 · IT view                                                        */
/* ================================================================== */
const S6: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [100, 115], [1, 0], clamp);
  const b = interpolate(f, [100, 115], [0, 1], clamp);
  return (
    <Scene len={240}>
      <Top>
        <NewChip>IT view</NewChip>
        <Headline size={50} at={4}>
          A clean core level, A to D, for every SAP object it touches.
        </Headline>
        <Lead at={20}>With the successor SAP names, and the target that follows.</Lead>
      </Top>
      <div style={{ position: 'absolute', left: 60, top: 380, opacity: a }}>
        <Cam
          src="screens30/v3-it-top.png"
          iw={2432}
          ih={720}
          w={960}
          h={520}
          at={8}
          keys={[
            { f: 0, cx: 1216, cy: 360, vw: 2432 },
            { f: 30, cx: 1216, cy: 360, vw: 2432 },
            { f: 100, cx: 690, cy: 400, vw: 1380 },
          ]}
          hl={[{ x: 584, y: 340, w: 580, h: 120, from: 50 }]}
        />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 380, opacity: b }}>
        <Cam
          src="screens30/v3-it-levels.png"
          iw={1680}
          ih={1090}
          w={960}
          h={520}
          keys={[
            { f: 100, cx: 840, cy: 460, vw: 1680 },
            { f: 230, cx: 840, cy: 620, vw: 1680 },
          ]}
          hl={[{ x: 650, y: 250, w: 95, h: 55, from: 135 }]}
        />
      </div>
      <Footnote at={30}>
        Levels from SAP's Cloudification Repository and object classification — 33,864 objects, synced <span style={{ whiteSpace: 'nowrap' }}>2026-09-15</span>. An orientation, never part of the signed
        audit pack; ATC stays the check.
      </Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  7 · Management view                                                */
/* ================================================================== */
const S7: React.FC = () => (
  <Scene len={210}>
    <Top>
      <NewChip>Management view</NewChip>
      <Headline size={50} at={4}>
        What do I risk, and what do I decide?
      </Headline>
      <Lead at={20}>Where the objects stand, and how much of the case is backed by evidence.</Lead>
    </Top>
    <div style={{ position: 'absolute', left: 60, top: 300 }}>
      <Cam
        src="screens30/v3-mgmt-charts.png"
        iw={1536}
        ih={1048}
        w={960}
        h={640}
        at={8}
        keys={[
          { f: 0, cx: 768, cy: 512, vw: 1536 },
          { f: 40, cx: 768, cy: 512, vw: 1536 },
          { f: 140, cx: 768, cy: 530, vw: 1536 },
        ]}
        hl={[
          { x: 10, y: 470, w: 730, h: 545, from: 70, to: 130 },
          { x: 770, y: 470, w: 725, h: 545, from: 135 },
        ]}
      />
    </div>
    <Footnote at={30}>Real screen · demo project, target platform Private Edition. Business, IT and Management are views on the same facts — none changes a result.</Footnote>
  </Scene>
);

/* ================================================================== */
/*  8 · The new look of the tools                                      */
/* ================================================================== */
const Tag: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <div
    style={{
      fontSize: 22,
      fontWeight: 800,
      color: dark ? '#fff' : T.inkMuted,
      background: dark ? T.brandStrong : T.line,
      borderRadius: 8,
      padding: '4px 12px',
      display: 'inline-block',
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);
const S8: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [150, 165], [1, 0], clamp);
  const b = interpolate(f, [150, 165], [0, 1], clamp);
  return (
    <Scene len={300}>
      <Top>
        <NewChip>Rebuilt tools</NewChip>
        <Headline size={50} at={4}>
          A new look, closer to the SAP screens you work in every day.
        </Headline>
      </Top>
      <div style={{ position: 'absolute', left: 60, top: 262, opacity: a }}>
        <div style={{ opacity: fadeIn(f, 10) }}>
          <Tag>2.x</Tag>
        </div>
        <Cam src="screens30/st-testing.png" iw={1248} ih={560} w={960} h={290} at={10} keys={[{ f: 0, cx: 624, cy: 190, vw: 1248 }]} style={{ filter: 'saturate(0.6)' }} />
        <div style={{ height: 24 }} />
        <div style={{ opacity: fadeIn(f, 50) }}>
          <Tag dark>3.0</Tag>
        </div>
        <Cam src="screens30/v3-testing-head.png" iw={2240} ih={760} w={960} h={326} at={50} keys={[{ f: 0, cx: 1120, cy: 380, vw: 2240 }]} />
      </div>
      <div style={{ position: 'absolute', left: 60, top: 262, opacity: b }}>
        <Tag dark>3.0 · Analyze</Tag>
        <Cam src="screens30/v3-analyze-head.png" iw={2240} ih={590} w={960} h={253} keys={[{ f: 0, cx: 1120, cy: 295, vw: 2240 }]} />
        <div style={{ height: 24 }} />
        <Tag dark>3.0 · Transformation</Tag>
        <Cam src="screens30/v3-transf-head.png" iw={2240} ih={760} w={960} h={326} keys={[{ f: 0, cx: 1120, cy: 380, vw: 2240 }]} />
      </div>
      <Footnote at={30}>
        Seven tools rebuilt as object pages: key figures on top, status line, tabs below — familiar if you know SAP Fiori. An independent design, not
        affiliated with SAP.
      </Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  9 · The turn                                                       */
/* ================================================================== */
const S9: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={105}>
      <div style={{ position: 'absolute', left: 90, right: 90, top: 300 }}>
        <Headline size={58} at={0}>
          Other tools explain code, or rewrite it.
        </Headline>
        <div style={{ marginTop: 40 }}>
          <Headline size={58} at={34} color={T.brandStrong}>
            Clean-Core.io does both on one chain of evidence — and says what it could not determine.
          </Headline>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 90, top: 200, opacity: fadeIn(f, 0) }}>
        <NewChip>One chain of evidence</NewChip>
      </div>
    </Scene>
  );
};

/* ================================================================== */
/*  10 · The chain of evidence                                         */
/* ================================================================== */
type ChainTone = 'info' | 'proposal' | 'mock' | 'proven';
const ChainChip: React.FC<{ tone: ChainTone; children: React.ReactNode; size?: number }> = ({ tone, children, size = 16 }) => {
  const map = {
    info: [T.info, T.infoBg, T.infoBorder, 'solid'],
    proposal: [T.warning, T.warningBg, '#b45309', 'dashed'],
    mock: [T.warning, T.warningBg, '#b45309', 'dashed'],
    proven: [T.brandStrong, T.brandSurface, T.brandStrong, 'solid'],
  } as const;
  const [fg, bg, bd, st] = map[tone];
  return (
    <span style={{ fontSize: size, fontWeight: 650, color: fg, background: bg, border: `1.5px ${st} ${bd}`, borderRadius: 999, padding: '3px 11px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
};
type Step = {
  name: string;
  mark: string;
  chip: string;
  tone: ChainTone;
  note: string;
  cam?: { src: string; iw: number; ih: number; keys: (s: number) => Key[]; hl?: (s: number) => HL[] };
};
const SLOT = 96;
const CSTART = 40;
const BOX_W = 960;
const BOX_H = 470;
const CHAIN: Step[] = [
  {
    name: 'Process',
    mark: 'line anchor',
    chip: 'Reconstructed',
    tone: 'info',
    note: 'Every element of the process points to the line it came from.',
    cam: {
      src: 'screens30/v3-editor-props.png',
      iw: 638,
      ih: 1286,
      keys: (s) => [
        { f: s, cx: 319, cy: 600, vw: 1000 },
        { f: s + 70, cx: 319, cy: 1030, vw: 1000 },
      ],
      hl: (s) => [{ x: 10, y: 1055, w: 618, h: 150, from: s + 55 }],
    },
  },
  {
    name: 'Design',
    mark: 'built on the signed run',
    chip: 'Model proposal',
    tone: 'proposal',
    note: 'A target design for the route the evidence points to — a proposal until you record the target you accept.',
  },
  {
    name: 'Code draft',
    mark: 'every finding at its line',
    chip: 'Model proposal',
    tone: 'proposal',
    note: 'The code draft follows the design, finding by finding. A draft you review — not a finished product.',
    cam: {
      src: 'screens30/v3-transf-sankey.png',
      iw: 2208,
      ih: 890,
      keys: (s) => [
        { f: s, cx: 1104, cy: 445, vw: 2208 },
      ],
    },
  },
  {
    name: 'Tests',
    mark: 'isolated runner · test receipt',
    chip: 'Demonstrated · mock',
    tone: 'mock',
    note: 'Test scenarios for the code draft, run in an isolated runner against mocks — not in your S/4HANA system.',
    cam: {
      src: 'screens30/v3-testing-what.png',
      iw: 750,
      ih: 400,
      keys: (s) => [{ f: s, cx: 375, cy: 200, vw: 900 }],
      hl: (s) => [{ x: 40, y: 95, w: 670, h: 190, from: s + 30 }],
    },
  },
  {
    name: 'Handover',
    mark: 'signature',
    chip: 'Proven',
    tone: 'proven',
    note: 'An audit pack the server signs over the run, verifiable offline. A signature proves origin, not correctness.',
    cam: {
      src: 'screens30/v3-delivery-pack.png',
      iw: 750,
      ih: 1160,
      keys: (s) => [
        { f: s, cx: 375, cy: 290, vw: 1000 },
        { f: s + 55, cx: 375, cy: 290, vw: 1000 },
        { f: s + 100, cx: 375, cy: 600, vw: 1000 },
      ],
      hl: (s) => [{ x: 40, y: 390, w: 670, h: 105, from: s + 15, to: s + 50 }],
    },
  },
];
const S10: React.FC = () => {
  const f = useCurrentFrame();
  const idx = Math.min(CHAIN.length - 1, Math.max(0, Math.floor((f - CSTART) / SLOT)));
  return (
    <Scene len={530}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 50 }}>
        <NewChip>One chain of evidence</NewChip>
        <div style={{ marginTop: 16 }}>
          <Headline size={42} at={4}>
            Then the same evidence carries on — all the way to a reviewed, tested rebuild.
          </Headline>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 232, display: 'flex', gap: 14 }}>
        {CHAIN.map((c, i) => {
          const on = f >= CSTART + i * SLOT;
          const cur = i === idx && on;
          return (
            <div key={c.name} style={{ position: 'relative', flex: 1, minWidth: 0, opacity: on ? 1 : 0.35 }}>
              {i > 0 && <div style={{ position: 'absolute', left: -14, top: 30, width: 14, textAlign: 'center', fontSize: 22, fontWeight: 800, color: T.inkMuted }}>→</div>}
              <div
                style={{
                  height: 140,
                  borderRadius: 12,
                  border: `1.5px solid ${cur ? T.ink : T.line}`,
                  borderTop: `5px solid ${on ? T.ink : T.line}`,
                  background: cur ? T.surface : T.surfaceMuted,
                  padding: '12px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  boxShadow: cur ? '0 10px 30px rgba(11,28,48,0.12)' : 'none',
                }}
              >
                <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.01em' }}>
                  {i + 1} · {c.name}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: T.inkMuted, lineHeight: 1.25 }}>{c.mark}</div>
                <div style={{ marginTop: 'auto' }}>
                  <ChainChip tone={c.tone} size={15}>
                    {c.chip}
                  </ChainChip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {CHAIN.map((c, i) => {
        const s = CSTART + i * SLOT;
        const o = interpolate(f, [s, s + 10, s + SLOT, s + SLOT + 10], [0, 1, 1, i === CHAIN.length - 1 ? 1 : 0], clamp);
        return (
          <div key={c.name} style={{ position: 'absolute', left: 60, top: 396, width: BOX_W, opacity: o }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 18, lineHeight: 1.3, minHeight: 74 }}>{c.note}</div>
            {c.cam ? (
              <Cam src={c.cam.src} iw={c.cam.iw} ih={c.cam.ih} w={BOX_W} h={BOX_H} keys={c.cam.keys(s)} hl={c.cam.hl ? c.cam.hl(s) : []} />
            ) : (
              <div
                style={{
                  width: BOX_W,
                  height: BOX_H,
                  borderRadius: 16,
                  border: '2px dashed #b45309',
                  background: T.warningBg,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '0 56px',
                  gap: 22,
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontSize: 19, fontWeight: 650, color: T.inkMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Drawn card, not a screen</div>
                <div style={{ fontSize: 36, fontWeight: 800 }}>Target design</div>
                <div style={{ fontSize: 27, fontWeight: 500, color: T.inkMuted, lineHeight: 1.4 }}>
                  Proposed from the evidence of the signed run, with why the alternatives were rejected. You record the target you accept — a self-declaration,
                  not a mandate.
                </div>
                <div>
                  <ChainChip tone="proposal" size={20}>
                    Model proposal
                  </ChainChip>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Footnote at={30}>Real screens · demo project. The demo stops where the model begins, so it shows no code draft and runs no test; in your own project both are there.</Footnote>
    </Scene>
  );
};

/* ================================================================== */
/*  11 · End card                                                      */
/* ================================================================== */
const S11: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene len={240}>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 150 }}>
        <div style={{ opacity: fadeIn(f, 0) }}>
          <NewChip plain>Clean-Core.io 3.0</NewChip>
        </div>
        <div style={{ marginTop: 30 }}>
          <Headline size={56} at={6}>
            From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check.
          </Headline>
        </div>
        <div style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 14, opacity: fadeIn(f, 34) }}>
          {['Free', 'No SAP licence needed', 'No analytics, advertising or tracking cookies'].map((t) => (
            <span key={t} style={{ fontSize: 27, fontWeight: 700, color: T.brandStrong, background: T.brandSurface, border: `2px solid ${T.brandStrong}`, borderRadius: 999, padding: '8px 20px' }}>
              {t}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 64, opacity: fadeIn(f, 56), display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <Wordmark size={56} />
          <span style={{ fontSize: 36, fontWeight: 650, color: T.brandStrong }}>clean-core.io</span>
        </div>
      </div>
      <Footnote at={60}>
        The code is a draft for review; tests run in an isolated runner against mocks. Independent community project, not affiliated with or endorsed by SAP SE.
        Demo program: fictitious code.
      </Footnote>
    </Scene>
  );
};

/* ================================================================== */
const PARTS = [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11];

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

export const CleanCore30v3: React.FC = () => {
  useInter();
  const { width, height } = useVideoConfig();
  if (width === height) {
    return (
      <AbsoluteFill style={{ background: T.page }}>
        <Track />
      </AbsoluteFill>
    );
  }
  // Wide variant: the same 1080 stage, centred, on the page colour.
  return (
    <AbsoluteFill style={{ background: T.page }}>
      <div style={{ position: 'absolute', left: (width - 1080) / 2, top: (height - 1080) / 2, width: 1080, height: 1080, overflow: 'hidden' }}>
        <Track />
      </div>
    </AbsoluteFill>
  );
};
