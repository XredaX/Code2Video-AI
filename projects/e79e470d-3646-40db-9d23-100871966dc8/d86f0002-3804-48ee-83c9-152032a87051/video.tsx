import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill } from 'remotion';

// =============================================================================
// COMPOSITION CONFIG (Required for auto-discovery)
// =============================================================================
export const compositionConfig = {
  id: 'SamsungLogoIntro',
  durationInSeconds: 4, // As per requirement, a suitable duration
  fps: 30,
  width: 720,
  height: 1280,
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================
const SamsungLogoIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Color values refined to closely match the reference image
  const primaryDarkBlue = '#000C1E'; // A very deep, dark blue for the background
  const vibrantBlue = '#0077FF';   // A bright, electric blue for the logo glow and light accent

  // Animation for the logo's initial scale-in
  const logoScale = interpolate(
    frame,
    [0, fps * 0.75], // Scales up over the first 0.75 seconds
    [0.7, 1],       // Starts at 70% size, ends at 100%
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  // Overall opacity for the logo and its light accent, fading in and out with a hold
  const containerOpacity = interpolate(
    frame,
    [0, fps * 0.75, durationInFrames - fps * 0.75, durationInFrames], // Fade in, hold steady, then fade out
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.ease,
    }
  );

  // Animation for the rectangular light accent that sweeps across the logo
  const accentLightWidth = width * 0.3; // The visible width of the light rectangle
  // Define start and end positions for the sweep relative to the logo container's center
  const accentLightStart = width * 0.5; // Starts off-screen to the right of the logo container's center
  const accentLightEnd = -width * 0.5;  // Ends off-screen to the left

  const accentLightPositionX = interpolate(
    frame,
    [fps * 0.75, fps * 1.75], // The light sweep animation runs from 0.75s to 1.75s
    [accentLightStart, accentLightEnd], // Moves from right to left across the logo
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.quad),
    }
  );

  // Opacity for the light accent itself, to make it appear and disappear during its sweep
  const accentLightOpacity = interpolate(
    frame,
    [fps * 0.75, fps * 1, fps * 1.5, fps * 1.75], // Fades in, stays solid, then fades out
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: primaryDarkBlue, alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: width * 0.8,  // Container for the logo, proportional to screen width
          height: height * 0.3, // Container height, proportional to screen height
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',   // Crucial to keep the light accent within the logo's visual area
          opacity: containerOpacity, // Controls the overall fade of the logo and its accent
          transform: `scale(${logoScale})`, // Applies the initial scale-in effect
        }}
      >
        {/* Samsung Logo Image */}
        <img
          src="https://thesvg.org/icons/samsung/default.svg"
          alt="Samsung Logo"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            // Apply a strong blue glow matching the vibrant blue from the image
            filter: `drop-shadow(0 0 20px ${vibrantBlue})`,
          }}
        />

        {/* Dynamic Light Accent Effect */}
        <div
          style={{
            position: 'absolute',
            left: accentLightPositionX, // Animated horizontal position
            width: accentLightWidth,
            height: '100%', // Ensures the light covers the full height of the logo
            // Gradient from vibrant blue to transparent, creating the fading right edge, with sharp left edge
            background: `linear-gradient(to right, ${vibrantBlue} 0%, ${vibrantBlue} 70%, rgba(0,0,0,0) 100%)`,
            transform: 'skewX(-20deg)', // Keeps the subtle cinematic angle
            opacity: accentLightOpacity, // Controls the light's fade during its sweep
            mixBlendMode: 'lighten',     // Blends the light with the logo below for a glowing effect
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// CRITICAL: You MUST have a default export for your main component!
// If you do not include this exact default export, the video will fail to render.
export default SamsungLogoIntro;