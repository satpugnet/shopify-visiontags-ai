import { interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import React from "react";

interface AnimatedTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  delay?: number;
  style?: React.CSSProperties;
  animation?: "fade" | "slideUp" | "typewriter" | "scale";
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  fontSize = 48,
  color = "#ffffff",
  delay = 0,
  style = {},
  animation = "fade",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const adjustedFrame = frame - delay;

  const getAnimationStyles = (): React.CSSProperties => {
    if (adjustedFrame < 0) {
      return { opacity: 0 };
    }

    switch (animation) {
      case "slideUp": {
        const opacity = interpolate(adjustedFrame, [0, 20], [0, 1], {
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(adjustedFrame, [0, 20], [30, 0], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          transform: `translateY(${translateY}px)`,
        };
      }
      case "scale": {
        const scale = spring({
          frame: adjustedFrame,
          fps,
          config: { damping: 12 },
        });
        const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
          extrapolateRight: "clamp",
        });
        return {
          opacity,
          transform: `scale(${scale})`,
        };
      }
      case "typewriter": {
        const charsToShow = Math.floor(
          interpolate(adjustedFrame, [0, text.length * 2], [0, text.length], {
            extrapolateRight: "clamp",
          })
        );
        return {
          opacity: 1,
          clipPath: `inset(0 ${100 - (charsToShow / text.length) * 100}% 0 0)`,
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
        fontSize,
        color,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontWeight: 600,
        textShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
        textAlign: "center",
        ...getAnimationStyles(),
        ...style,
      }}
    >
      {text}
    </div>
  );
};
