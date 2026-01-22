import { AbsoluteFill } from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import { AppIcon } from "../components/AppIcon";

export const OpeningScene: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      {/* Centered content container */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 40,
        }}
      >
        {/* App Icon with bounce animation */}
        <AppIcon size={180} animation="bounce" />

        {/* First text line - delay handled by AnimatedText */}
        <AnimatedText
          text="Tired of manually tagging products?"
          fontSize={52}
          animation="slideUp"
          delay={30}
        />

        {/* Second text line */}
        <AnimatedText
          text="VisionTags does it automatically with AI."
          fontSize={44}
          color="#8B9DC3"
          animation="slideUp"
          delay={70}
        />
      </div>
    </AbsoluteFill>
  );
};
