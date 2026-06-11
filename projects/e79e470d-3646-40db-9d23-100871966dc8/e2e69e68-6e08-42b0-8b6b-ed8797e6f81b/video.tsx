import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, interpolateColors } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

export const compositionConfig = {
  id: 'AppleIntro',
  durationInSeconds: 5, // 1s in, 3s hold, 1s out
  fps: 30,
  width: 720,
  height: 1280,
};

const AppleIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const { fontFamily } = loadFont("normal", { weights: ["400", "700"], ignoreTooManyRequestsWarning: true });

  // Animation for opacity and scale of the logo
  const logoOpacity = interpolate(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.ease),
    }
  );

  const logoScale = interpolate(
    frame,
    [0, 30],
    [0.8, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.back(1.7)), // A slight bounce for the "pop"
    }
  );

  // Animation for a subtle glow effect (using drop-shadow)
  const glowBlur = interpolate(
    frame,
    [0, 15, 45, durationInFrames - 45, durationInFrames - 15, durationInFrames],
    [0, 10, 5, 5, 10, 0], // Peak blur then settle, then re-peak slightly before fading out
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const glowSpread = interpolate(
    frame,
    [0, 15, 45, durationInFrames - 45, durationInFrames - 15, durationInFrames],
    [0, 0.2, 0.1, 0.1, 0.2, 0], // Smaller spread
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const backgroundColor = interpolateColors(
    frame,
    [0, 30, durationInFrames - 30, durationInFrames],
    ['#000000', '#1A1A1A', '#1A1A1A', '#000000'] // Fade from black, hold dark grey, fade back to black
  )

  return (
    <AbsoluteFill style={{ backgroundColor, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          filter: `drop-shadow(0px 0px ${glowBlur}px rgba(255, 255, 255, ${glowSpread}))`,
          fontFamily, // Included for completeness, though no text is rendered
        }}
      >
        <img
          src="https://thesvg.org/icons/apple/default.svg"
          alt="Apple Logo"
          style={{
            width: 200,
            height: 200,
            // The SVG itself might have a default color, so we ensure it's white
            filter: 'brightness(0) invert(1)', // Makes any SVG white
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export default AppleIntro;