import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { AnimatedText } from "../components/AnimatedText";

const AIProcessingAnimation: React.FC = () => {
  const frame = useCurrentFrame();

  // Create rotating dots animation
  const dots = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + frame * 0.05;
    const radius = 80;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const opacity = interpolate(
      Math.sin(angle + frame * 0.1),
      [-1, 1],
      [0.3, 1]
    );
    const scale = interpolate(
      Math.sin(angle + frame * 0.1),
      [-1, 1],
      [0.6, 1]
    );

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #5C6AC4 0%, #7B68EE 100%)",
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
          opacity,
          boxShadow: "0 0 20px rgba(123, 104, 238, 0.5)",
        }}
      />
    );
  });

  return (
    <div
      style={{
        position: "relative",
        width: 200,
        height: 200,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {dots}
      <div
        style={{
          position: "absolute",
          fontSize: 40,
          color: "#ffffff",
          fontWeight: "bold",
        }}
      >
        AI
      </div>
    </div>
  );
};

const ProcessingItem: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = frame - delay;

  if (adjustedFrame < 0) return null;

  const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        opacity,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "#4CAF50",
          boxShadow: "0 0 10px rgba(76, 175, 80, 0.5)",
        }}
      />
      <AnimatedText
        text={text}
        fontSize={28}
        color="#B8C4E0"
        animation="slideUp"
      />
    </div>
  );
};

export const ProcessingScene: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Main text at top */}
      <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center" }}>
        <AnimatedText
          text="AI examines each image and generates metafields"
          fontSize={40}
          animation="fade"
          delay={20}
        />
      </div>

      {/* Centered content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 50,
        }}
      >
        {/* AI Processing animation circle */}
        <AIProcessingAnimation />

        {/* Processing items */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <ProcessingItem text="Analyzing image composition..." delay={0} />
          <ProcessingItem text="Detecting colors and patterns..." delay={60} />
          <ProcessingItem text="Identifying materials..." delay={120} />
          <ProcessingItem text="Generating SEO tags..." delay={180} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
