import { interpolate, useCurrentFrame, spring, useVideoConfig, Img, staticFile } from "remotion";
import React from "react";

interface ScreenshotFrameProps {
  src: string;
  delay?: number;
  animation?: "fade" | "slideIn" | "zoom" | "panZoom";
  width?: number;
  height?: number;
}

export const ScreenshotFrame: React.FC<ScreenshotFrameProps> = ({
  src,
  delay = 0,
  animation = "fade",
  width = 1400,
  height = 800,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  const getContainerStyles = (): React.CSSProperties => {
    if (adjustedFrame < 0) {
      return { opacity: 0 };
    }

    switch (animation) {
      case "slideIn": {
        const progress = spring({
          frame: adjustedFrame,
          fps,
          config: { damping: 15, mass: 1 },
        });
        return {
          opacity: progress,
          transform: `translateY(${(1 - progress) * 50}px)`,
        };
      }
      case "zoom": {
        const scale = spring({
          frame: adjustedFrame,
          fps,
          config: { damping: 12 },
        });
        const opacity = interpolate(adjustedFrame, [0, 15], [0, 1], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          transform: `scale(${0.8 + scale * 0.2})`,
        };
      }
      case "panZoom": {
        const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
          extrapolateRight: "clamp",
        });
        const scale = interpolate(adjustedFrame, [0, 300], [1, 1.15], {
          extrapolateRight: "clamp",
        });
        const translateX = interpolate(adjustedFrame, [0, 300], [0, -30], {
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(adjustedFrame, [0, 300], [0, -20], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        };
      }
      case "fade":
      default: {
        const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
          extrapolateRight: "clamp",
        });
        return { opacity };
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        ...getContainerStyles(),
      }}
    >
      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{
            width,
            height,
            objectFit: "cover",
          }}
        />
      </div>
    </div>
  );
};
