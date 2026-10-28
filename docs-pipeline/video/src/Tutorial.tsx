import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { captionAt, scenes } from "./timeline";
import { FPS, type Box, type TutorialProps } from "./types";

/** Flow's default "gold" palette, dark scheme (from @noirly-dev/ui). */
const C = {
  bg: "#0a0a08",
  surface: "#121210",
  surface2: "#1a1a17",
  text: "#f5f3ea",
  muted: "#a8a597",
  accent: "#ffe66d",
  accentInk: "#222222",
  hairline: "rgba(245, 243, 234, 0.10)",
};
const DISPLAY = "'Fraunces', Georgia, serif";
const SANS = "'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Consolas, monospace";

/** The recording sits in a frame this wide, centred near the top. */
const FRAME = { x: 178, y: 62, width: 1564, height: 880 };

const ease = Easing.bezier(0.22, 1, 0.36, 1);

function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, margin: 0, ...style }}>{children}</p>;
}

/** Fades a scene in and out at its edges. */
function SceneFade({ duration, children }: { duration: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const total = Math.round(duration * FPS);
  const opacity = interpolate(frame, [0, 10, total - 10, total], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}

function Backdrop() {
  return (
    <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 85% -10%, rgba(255,230,109,0.10), transparent 60%), ${C.bg}` }}>
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.hairline} 1px, transparent 1px)`, backgroundSize: "36px 36px", opacity: 0.5 }} />
    </AbsoluteFill>
  );
}

function rise(frame: number, fps: number, delay = 0) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return { opacity: s, transform: `translateY(${(1 - s) * 40}px)` };
}

function Intro({ props }: { props: TutorialProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rule = interpolate(frame, [12, 40], [0, 220], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <AbsoluteFill style={{ padding: "0 180px", justifyContent: "center" }}>
      <Eyebrow style={rise(frame, fps)}>{props.category} — Noirly Flow tutorial</Eyebrow>
      <h1 style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 132, lineHeight: 1.02, letterSpacing: "-0.02em", color: C.text, margin: "28px 0 0", ...rise(frame, fps, 4) }}>{props.title}</h1>
      <div style={{ height: 4, width: rule, background: C.accent, borderRadius: 2, marginTop: 36 }} />
      <p style={{ fontFamily: SANS, fontSize: 40, lineHeight: 1.4, color: C.muted, maxWidth: 1300, margin: "36px 0 0", ...rise(frame, fps, 10) }}>{props.summary}</p>
    </AbsoluteFill>
  );
}

function UseCases({ props }: { props: TutorialProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = props.useCases.slice(0, 3);
  return (
    <AbsoluteFill style={{ padding: "0 160px", justifyContent: "center" }}>
      <Eyebrow style={rise(frame, fps)}>When to use it</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 32, marginTop: 40 }}>
        {items.map((item, index) => (
          <div key={item.title} style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 24, padding: 40, ...rise(frame, fps, 8 + index * 7) }}>
            <p style={{ fontFamily: MONO, fontSize: 20, color: C.accent, margin: 0 }}>{String(index + 1).padStart(2, "0")}</p>
            <p style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, color: C.text, margin: "18px 0 0", lineHeight: 1.1 }}>{item.title}</p>
            <p style={{ fontFamily: SANS, fontSize: 28, color: C.muted, margin: "18px 0 0", lineHeight: 1.45 }}>{item.body}</p>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/** "How it works": nodes appear one by one, joined by arrows that draw themselves. */
function Flow({ nodes }: { nodes: string[] }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const width = 1600;
  const gap = 70;
  const nodeWidth = (width - gap * (nodes.length - 1)) / nodes.length;
  return (
    <AbsoluteFill style={{ padding: "0 160px", justifyContent: "center" }}>
      <Eyebrow style={rise(frame, fps)}>How it works</Eyebrow>
      <div style={{ position: "relative", height: 260, marginTop: 60 }}>
        {nodes.map((node, index) => {
          const delay = 8 + index * 14;
          const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120 } });
          const arrow = interpolate(frame, [delay + 6, delay + 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const left = index * (nodeWidth + gap);
          return (
            <div key={node}>
              <div style={{ position: "absolute", left, top: 0, width: nodeWidth, height: 260, borderRadius: 28, background: index === nodes.length - 1 ? C.accent : C.surface, border: `1px solid ${C.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 28, boxSizing: "border-box", opacity: s, transform: `scale(${0.85 + s * 0.15})` }}>
                <p style={{ fontFamily: SANS, fontSize: nodes.length > 3 ? 32 : 38, fontWeight: 600, textAlign: "center", lineHeight: 1.25, margin: 0, color: index === nodes.length - 1 ? C.accentInk : C.text }}>{node}</p>
              </div>
              {index < nodes.length - 1 ? (
                <svg style={{ position: "absolute", left: left + nodeWidth + 6, top: 110, overflow: "visible" }} width={gap - 12} height={40}>
                  <line x1={0} y1={20} x2={(gap - 24) * arrow} y2={20} stroke={C.accent} strokeWidth={5} strokeLinecap="round" />
                  {arrow > 0.95 ? <path d={`M ${gap - 30} 8 L ${gap - 14} 20 L ${gap - 30} 32`} fill="none" stroke={C.accent} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /> : null}
                </svg>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

type Point = { x: number; y: number };
const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Where the (drawn) cursor is at time t, gliding between the recorded targets. */
function cursorAt(pointer: TutorialProps["pointer"], t: number, start: Point): Point {
  let at = start;
  for (const event of pointer) {
    if (event.t > t) break;
    const target = centre(event.box);
    const p = interpolate(t, [event.t, event.t + 0.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
    at = { x: at.x + (target.x - at.x) * p, y: at.y + (target.y - at.y) * p };
    if (event.kind === "drag" && event.to) {
      const to = centre(event.to);
      const d = interpolate(t, [event.t + 0.45, event.t + 1.45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
      at = { x: at.x + (to.x - at.x) * d, y: at.y + (to.y - at.y) * d };
    }
  }
  return at;
}

function Walkthrough({ props }: { props: TutorialProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const k = FRAME.width / props.viewport.width;
  const toFrame = (p: Point) => ({ x: FRAME.x + p.x * k, y: FRAME.y + p.y * k });
  const cursor = toFrame(cursorAt(props.pointer, t, { x: props.viewport.width * 0.6, y: props.viewport.height * 0.55 }));
  const step = captionAt(props.steps, t);
  const stepIndex = step ? props.steps.indexOf(step) : -1;
  const captionIn = step ? interpolate(t - step.t, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 0;
  const noteOpacity = interpolate(t, [0.2, 0.7, 5.5, 6.2], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: FRAME.x, top: 18, right: FRAME.x, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Eyebrow style={{ fontSize: 18 }}>Walkthrough · {props.title}</Eyebrow>
        {stepIndex >= 0 ? <Eyebrow style={{ fontSize: 18, color: C.accent }}>Step {stepIndex + 1} of {props.steps.length}</Eyebrow> : null}
      </div>
      <div style={{ position: "absolute", left: FRAME.x, top: FRAME.y, width: FRAME.width, height: FRAME.height, borderRadius: 20, overflow: "hidden", border: `1px solid ${C.hairline}`, boxShadow: "0 40px 120px rgba(0,0,0,0.55)", background: C.surface }}>
        <OffthreadVideo src={staticFile(props.recording)} startFrom={Math.round(props.recordingStart * FPS)} style={{ width: "100%", height: "100%" }} muted />
      </div>

      {/* Highlights around what was clicked or typed into. */}
      {props.pointer.map((event, index) => {
        const life = interpolate(t, [event.t + 0.25, event.t + 0.55, event.t + 1.6, event.t + 2.0], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (life <= 0) return null;
        const box = event.kind === "drag" && event.to ? event.to : event.box;
        const pad = 6;
        const tl = toFrame({ x: box.x - pad, y: box.y - pad });
        const ring = interpolate(t, [event.t + 0.45, event.t + 1.05], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const click = toFrame(centre(event.box));
        return (
          <div key={index}>
            {event.kind !== "drag" ? (
              <div style={{ position: "absolute", left: tl.x, top: tl.y, width: (box.width + pad * 2) * k, height: (box.height + pad * 2) * k, border: `3px solid ${C.accent}`, borderRadius: 12, boxShadow: `0 0 0 6px rgba(255,230,109,0.18)`, opacity: life }} />
            ) : null}
            {event.kind === "click" && ring > 0 && ring < 1 ? (
              <div style={{ position: "absolute", left: click.x - 40 * ring, top: click.y - 40 * ring, width: 80 * ring, height: 80 * ring, borderRadius: "50%", border: `4px solid ${C.accent}`, opacity: 1 - ring }} />
            ) : null}
          </div>
        );
      })}

      {/* The drawn cursor (headless recordings have none). */}
      <svg style={{ position: "absolute", left: cursor.x - 4, top: cursor.y - 2, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.6))" }} width={34} height={44} viewBox="0 0 17 22">
        <path d="M1 1 L1 17 L5.5 13 L8.5 20 L11.5 18.6 L8.6 11.8 L14.5 11.8 Z" fill="#ffffff" stroke="#111" strokeWidth={1.2} strokeLinejoin="round" />
      </svg>

      {props.offCamera.length ? (
        <div style={{ position: "absolute", right: FRAME.x + 24, top: FRAME.y + 24, maxWidth: 640, background: "rgba(10,10,8,0.88)", border: `1px solid ${C.hairline}`, borderRadius: 16, padding: "16px 22px", opacity: noteOpacity }}>
          <p style={{ fontFamily: MONO, fontSize: 16, letterSpacing: "0.14em", textTransform: "uppercase", color: C.accent, margin: 0 }}>Note</p>
          <p style={{ fontFamily: SANS, fontSize: 22, lineHeight: 1.4, color: C.text, margin: "6px 0 0" }}>{props.offCamera.join(" ")}</p>
        </div>
      ) : null}

      <div style={{ position: "absolute", left: 0, right: 0, top: FRAME.y + FRAME.height + 16, display: "flex", justifyContent: "center" }}>
        {step ? (
          <div style={{ maxWidth: 1560, background: C.surface2, border: `1px solid ${C.hairline}`, borderRadius: 28, padding: "12px 34px", opacity: captionIn, transform: `translateY(${(1 - captionIn) * 10}px)` }}>
            <p style={{ fontFamily: SANS, fontSize: step.caption.length > 80 ? 28 : 34, lineHeight: 1.3, fontWeight: 500, color: C.text, margin: 0, textAlign: "center" }}>{step.caption}</p>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function Troubleshooting({ props }: { props: TutorialProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = props.troubleshooting.slice(0, 2);
  return (
    <AbsoluteFill style={{ padding: "0 180px", justifyContent: "center" }}>
      <Eyebrow style={rise(frame, fps)}>If something's off</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, marginTop: 40 }}>
        {items.map((item, index) => (
          <div key={item.problem} style={{ background: C.surface, border: `1px solid ${C.hairline}`, borderRadius: 24, padding: "34px 40px", ...rise(frame, fps, 8 + index * 8) }}>
            <p style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 42, color: C.text, margin: 0 }}>{item.problem}</p>
            <p style={{ fontFamily: SANS, fontSize: 30, lineHeight: 1.45, color: C.muted, margin: "14px 0 0" }}>{item.solution.replace(/`/g, "")}</p>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Outcome({ props }: { props: TutorialProps }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 2, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 220px", textAlign: "center" }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${s})` }}>
        <svg width={60} height={60} viewBox="0 0 24 24"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke={C.accentInk} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <p style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 64, lineHeight: 1.15, color: C.text, margin: "48px 0 0", ...rise(frame, fps, 6) }}>{props.outcome}</p>
      <Eyebrow style={{ marginTop: 40, ...rise(frame, fps, 12) }}>More in Flow Docs → {props.category}</Eyebrow>
    </AbsoluteFill>
  );
}

export function Tutorial(props: TutorialProps) {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      {scenes(props).map((scene) => (
        <Sequence key={scene.key} from={Math.round(scene.start * FPS)} durationInFrames={Math.round(scene.duration * FPS)} name={scene.title}>
          <SceneFade duration={scene.duration}>
            {scene.key === "intro" ? <Intro props={props} /> : null}
            {scene.key === "useCases" ? <UseCases props={props} /> : null}
            {scene.key === "flow" && props.flow ? <Flow nodes={props.flow} /> : null}
            {scene.key === "walkthrough" ? <Walkthrough props={props} /> : null}
            {scene.key === "troubleshooting" ? <Troubleshooting props={props} /> : null}
            {scene.key === "outcome" ? <Outcome props={props} /> : null}
          </SceneFade>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
