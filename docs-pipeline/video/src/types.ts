export type Box = { x: number; y: number; width: number; height: number };

/** Everything one tutorial needs; written by docs-pipeline/render.ts from the article and its capture. */
export type TutorialProps = {
  id: string;
  title: string;
  category: string;
  summary: string;
  useCases: { title: string; body: string }[];
  /** Optional "how it works" flowchart, a node per step. */
  flow: string[] | null;
  /** Relative to the bundle's public dir. */
  recording: string;
  /** Seconds trimmed from the start of the recording (the blank page load). */
  recordingStart: number;
  recordingDuration: number;
  /** CSS-pixel size of the recorded viewport. */
  viewport: { width: number; height: number };
  steps: { t: number; caption: string }[];
  pointer: { t: number; kind: "click" | "type" | "drag" | "focus"; box: Box; to?: Box }[];
  offCamera: string[];
  troubleshooting: { problem: string; solution: string }[];
  outcome: string;
};

export const FPS = 30;
export const SCENES = { intro: 4.5, useCases: 5, flow: 5.5, troubleshooting: 6, outcome: 4.5 } as const;
