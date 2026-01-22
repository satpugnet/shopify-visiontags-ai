import { AbsoluteFill, Series } from "remotion";
import { OpeningScene } from "./scenes/OpeningScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { ProcessingScene } from "./scenes/ProcessingScene";
import { ResultsScene } from "./scenes/ResultsScene";
import { SyncScene } from "./scenes/SyncScene";
import { ClosingScene } from "./scenes/ClosingScene";

export const DemoVideo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f1a 100%)",
      }}
    >
      <Series>
        {/* Scene 1: Opening Hook (0-5s = 150 frames) */}
        <Series.Sequence durationInFrames={150}>
          <OpeningScene />
        </Series.Sequence>

        {/* Scene 2: Dashboard Overview (5-15s = 300 frames) */}
        <Series.Sequence durationInFrames={300}>
          <DashboardScene />
        </Series.Sequence>

        {/* Scene 3: AI Processing (15-25s = 300 frames) */}
        <Series.Sequence durationInFrames={300}>
          <ProcessingScene />
        </Series.Sequence>

        {/* Scene 4: Results Preview (25-40s = 450 frames) */}
        <Series.Sequence durationInFrames={450}>
          <ResultsScene />
        </Series.Sequence>

        {/* Scene 5: Sync Action (40-50s = 300 frames) */}
        <Series.Sequence durationInFrames={300}>
          <SyncScene />
        </Series.Sequence>

        {/* Scene 6: Closing CTA (50-60s = 300 frames) */}
        <Series.Sequence durationInFrames={300}>
          <ClosingScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
