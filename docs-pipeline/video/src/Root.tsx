import { useEffect, useState } from "react";
import { Composition, continueRender, delayRender } from "remotion";
import { Tutorial } from "./Tutorial";
import { totalDuration } from "./timeline";
import { FPS, type TutorialProps } from "./types";

/**
 * Flow's typefaces (Fraunces, Hanken Grotesk, JetBrains Mono). If they can't
 * load (offline render), the composition falls back to system fonts rather
 * than hanging.
 */
function useFonts() {
  const [handle] = useState(() => delayRender("Loading fonts", { timeoutInMilliseconds: 20_000 }));
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500&display=block";
    document.head.append(link);
    const done = () => continueRender(handle);
    const fallback = setTimeout(done, 8_000);
    link.onload = () => {
      Promise.all(["600 40px Fraunces", "500 40px 'Hanken Grotesk'", "500 20px 'JetBrains Mono'"].map((font) => document.fonts.load(font)))
        .finally(() => { clearTimeout(fallback); done(); });
    };
    link.onerror = () => { clearTimeout(fallback); done(); };
  }, [handle]);
}

function FontedTutorial(props: TutorialProps) {
  useFonts();
  return <Tutorial {...props} />;
}

const SAMPLE: TutorialProps = {
  id: "sample",
  title: "Quick add",
  category: "Tasks",
  summary: "Type a sentence and Flow fills in the details.",
  useCases: [
    { title: "Bills", body: "Monthly on the 1st at 9:00, high priority." },
    { title: "Errands", body: "Due tomorrow, tagged errands." },
  ],
  flow: ["Type a sentence", "Preview what Flow understood", "Task created"],
  recording: "sample/recording.mp4",
  recordingStart: 0,
  recordingDuration: 10,
  viewport: { width: 1280, height: 720 },
  steps: [{ t: 0.5, caption: "Open New task and type a sentence." }],
  pointer: [],
  offCamera: [],
  troubleshooting: [{ problem: "A word was taken as a date", solution: "Choose Keep as typed." }],
  outcome: "A fully scheduled task from one line of text.",
};

export function Root() {
  return (
    <Composition
      id="Tutorial"
      component={FontedTutorial}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={Math.round(totalDuration(SAMPLE) * FPS)}
      defaultProps={SAMPLE}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(totalDuration(props) * FPS) })}
    />
  );
}
