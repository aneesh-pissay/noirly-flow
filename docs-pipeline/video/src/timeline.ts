/**
 * Where each scene starts, in seconds. Shared by the Remotion composition and
 * by docs-pipeline/render.ts, which writes the captions (.vtt) and chapters
 * from the same numbers so they always line up with the video.
 * Dependency-free on purpose.
 */
import { SCENES, type TutorialProps } from "./types";

export type Scene = { key: "intro" | "useCases" | "flow" | "walkthrough" | "troubleshooting" | "outcome"; title: string; start: number; duration: number };

export function scenes(props: Pick<TutorialProps, "flow" | "recordingDuration" | "troubleshooting">): Scene[] {
  const list: Omit<Scene, "start">[] = [
    { key: "intro", title: "Introduction", duration: SCENES.intro },
    { key: "useCases", title: "When to use it", duration: SCENES.useCases },
    ...(props.flow?.length ? [{ key: "flow" as const, title: "How it works", duration: SCENES.flow }] : []),
    { key: "walkthrough", title: "Walkthrough", duration: props.recordingDuration },
    ...(props.troubleshooting.length ? [{ key: "troubleshooting" as const, title: "Troubleshooting", duration: SCENES.troubleshooting }] : []),
    { key: "outcome", title: "Result", duration: SCENES.outcome },
  ];
  let start = 0;
  return list.map((scene) => {
    const placed = { ...scene, start };
    start += scene.duration;
    return placed;
  });
}

export function totalDuration(props: Parameters<typeof scenes>[0]) {
  const all = scenes(props);
  const last = all[all.length - 1]!;
  return last.start + last.duration;
}

export type Cue = { start: number; end: number; text: string };

/** Caption cues for the whole video, in order. */
export function cues(props: TutorialProps): Cue[] {
  const out: Cue[] = [];
  for (const scene of scenes(props)) {
    const end = scene.start + scene.duration;
    if (scene.key === "intro") out.push({ start: scene.start, end, text: `${props.title}. ${props.summary}` });
    if (scene.key === "useCases") out.push({ start: scene.start, end, text: `Use it for: ${props.useCases.map((u) => u.title.toLowerCase()).join("; ")}.` });
    if (scene.key === "flow" && props.flow) out.push({ start: scene.start, end, text: props.flow.join(" → ") });
    if (scene.key === "walkthrough") {
      // What happened off camera is said up front, so nothing shown is implied to be more than it is.
      const note = props.offCamera.length ? `(Note: ${props.offCamera.join(" ")}) ` : "";
      props.steps.forEach((step, index) => {
        const next = props.steps[index + 1]?.t ?? props.recordingDuration;
        out.push({ start: scene.start + step.t, end: scene.start + Math.max(next, step.t + 1.5), text: `${index === 0 ? note : ""}${step.caption}` });
      });
    }
    if (scene.key === "troubleshooting") out.push({ start: scene.start, end, text: props.troubleshooting.map((t) => `${t.problem}: ${t.solution}`).join(" ") });
    if (scene.key === "outcome") out.push({ start: scene.start, end, text: props.outcome });
  }
  // Clip overlaps so players never show two captions at once.
  const filtered = out.filter((cue) => cue.text);
  for (let i = 0; i < filtered.length - 1; i++) filtered[i]!.end = Math.min(filtered[i]!.end, filtered[i + 1]!.start);
  return filtered;
}

/** The caption on screen at time `t` within the walkthrough. */
export function captionAt(steps: TutorialProps["steps"], t: number) {
  let current: TutorialProps["steps"][number] | undefined;
  for (const step of steps) if (step.t <= t) current = step;
  return current;
}
