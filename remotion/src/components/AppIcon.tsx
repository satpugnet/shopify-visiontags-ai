import { interpolate, useCurrentFrame, spring, useVideoConfig, Img, staticFile } from "remotion";
import React from "react";

interface AppIconProps {
  size?: number;
  delay?: number;
  animation?: "bounce" | "pulse" | "fade";
}

export const AppIcon: React.FC<AppIconProps> = ({
  size = 200,
  delay = 0,
  animation = "bounce",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  const getAnimationStyles = (): React.CSSProperties => {
    if (adjustedFrame < 0) {
      return { opacity: 0, transform: "scale(0)" };
    }

    switch (animation) {
      case "bounce": {
        const scale = spring({
          frame: adjustedFrame,
          fps,
          config: { damping: 8, mass: 0.5, stiffness: 100 },
        });
        const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          transform: `scale(${scale})`,
        };
      }
      case "pulse": {
        const opacity = interpolate(adjustedFrame, [0, 15], [0, 1], {
          extrapolateRight: "clamp",
        });
        const pulseScale = 1 + Math.sin(adjustedFrame * 0.1) * 0.05;
        return {
          opacity,
          transform: `scale(${pulseScale})`,
        };
      }
      case "fade":
      default: {
        const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
          extrapolateRight: "clamp",
        });
        return { opacity, transform: "scale(1)" };
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        ...getAnimationStyles(),
      }}
    >
      <div
        style={{
          borderRadius: size * 0.2,
          overflow: "hidden",
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.4)",
        }}
      >
        <Img
          src={staticFile("visiontags-icon-1200x1200.png")}
          style={{
            width: size,
            height: size,
          }}
        />
      </div>
    </div>
  );
};
