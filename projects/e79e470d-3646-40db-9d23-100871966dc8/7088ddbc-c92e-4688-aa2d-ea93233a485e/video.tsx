import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  Sequence,
  Audio
} from 'remotion';
import React from 'react';

// Placeholder for the girl character and forest elements
// For simplicity, I'll represent them with colored divs and some basic animations.
// A real implementation might use SVG or Lottie for more complex characters.

const FOREST_GREEN_DARK = '#2E7D32';
const FOREST_GREEN_MEDIUM = '#4CAF50';
const FOREST_GREEN_LIGHT = '#81C784';
const SUN_YELLOW = '#FFEB3B';
const SUN_ORANGE = '#FF9800';
const SKY_BLUE_LIGHT = '#81D4FA';
const SKY_BLUE_DARK = '#03A9F4';
const GIRL_PINK = '#FF4081';
const GIRL_YELLOW = '#FFEE58';

// Define the composition configuration
export const compositionConfig = {
  id: 'ForestRunAnimation',
  durationInSeconds: 5, // Chosen duration: 5 seconds
  fps: 30,
  width: 720,
  height: 1280,
};

const ForestBackground: React.FC<{ frame: number; durationInFrames: number; width: number; height: number }> = ({ frame, durationInFrames, width, height }) => {
  // Simple layered background for depth
  const groundY = height * 0.7;
  const midGroundY = height * 0.5;
  const backGroundY = height * 0.3;

  return (
    <AbsoluteFill style={{ backgroundColor: SKY_BLUE_LIGHT }}>
      {/* Sunlight shafts */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: width * 0.4,
        width: width * 0.3,
        height: height * 0.6,
        background: `radial-gradient(circle, ${SUN_YELLOW}50, ${SUN_YELLOW}00 70%)`,
        opacity: interpolate(frame, [0, durationInFrames * 0.3, durationInFrames * 0.7, durationInFrames], [0, 0.8, 0.8, 0]),
        transform: 'skewX(-10deg)',
        filter: 'blur(20px)',
        zIndex: 0,
      }} />
       <div style={{
        position: 'absolute',
        top: 0,
        left: width * 0.1,
        width: width * 0.3,
        height: height * 0.5,
        background: `radial-gradient(circle, ${SUN_ORANGE}40, ${SUN_ORANGE}00 70%)`,
        opacity: interpolate(frame, [0, durationInFrames * 0.3, durationInFrames * 0.7, durationInFrames], [0, 0.6, 0.6, 0]),
        transform: 'skewX(10deg)',
        filter: 'blur(15px)',
        zIndex: 0,
      }} />

      {/* Far background trees */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: -width * 0.1,
        width: width * 0.6,
        height: height * 0.4,
        backgroundColor: FOREST_GREEN_DARK,
        borderBottomLeftRadius: '50%',
        borderBottomRightRadius: '50%',
        zIndex: 1,
      }} />
       <div style={{
        position: 'absolute',
        bottom: 0,
        left: width * 0.5,
        width: width * 0.6,
        height: height * 0.5,
        backgroundColor: FOREST_GREEN_DARK,
        borderBottomLeftRadius: '50%',
        borderBottomRightRadius: '50%',
        zIndex: 1,
      }} />

      {/* Mid-ground trees/bushes */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: -width * 0.15,
        width: width * 0.5,
        height: height * 0.6,
        backgroundColor: FOREST_GREEN_MEDIUM,
        borderBottomLeftRadius: '60%',
        borderBottomRightRadius: '60%',
        zIndex: 2,
      }} />
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: width * 0.2,
        width: width * 0.7,
        height: height * 0.7,
        backgroundColor: FOREST_GREEN_MEDIUM,
        borderBottomLeftRadius: '70%',
        borderBottomRightRadius: '70%',
        zIndex: 2,
      }} />

      {/* Foreground elements / Ground */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: -width * 0.2,
        width: width * 0.6,
        height: height * 0.7,
        backgroundColor: FOREST_GREEN_LIGHT,
        borderBottomLeftRadius: '80%',
        borderBottomRightRadius: '80%',
        zIndex: 3,
      }} />
       <div style={{
        position: 'absolute',
        bottom: 0,
        left: width * 0.3,
        width: width * 0.6,
        height: height * 0.8,
        backgroundColor: FOREST_GREEN_LIGHT,
        borderBottomLeftRadius: '80%',
        borderBottomRightRadius: '80%',
        zIndex: 3,
      }} />
        <div style={{
        position: 'absolute',
        bottom: -50, // Slight overlap for seamlessness
        left: -width * 0.1,
        width: width * 1.2,
        height: height * 0.75,
        backgroundColor: FOREST_GREEN_MEDIUM,
        zIndex: 4,
      }} />
    </AbsoluteFill>
  );
};

const Girl: React.FC<{ frame: number; durationInFrames: number; width: number; height: number }> = ({ frame, durationInFrames, width, height }) => {
  const girlWidth = width * 0.15;
  const girlHeight = girlWidth * 2; // Approx. proportions
  const runStartY = height * 0.7; // Ground level adjustment

  // Horizontal movement across the screen
  const translateX = interpolate(frame, [0, durationInFrames], [-girlWidth * 1.5, width + girlWidth * 1.5], {
    easing: Easing.linear,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  // Simple bouncing animation for running
  const translateY = interpolate(frame, [0, durationInFrames * 0.25, durationInFrames * 0.5, durationInFrames * 0.75, durationInFrames],
    [0, -20, 0, -20, 0],
    {
      easing: Easing.linear,
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
    });

  // Arm swing animation (simplified)
  const armAngle = interpolate(frame, [0, durationInFrames * 0.5, durationInFrames], [30, -30, 30], {
    easing: Easing.linear,
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: runStartY, // Adjust base position
        left: '50%', // Center horizontally for transformation
        transform: `translateX(${translateX}px) translateY(${translateY}px) translateX(-50%)`, // Center and apply movement
        width: girlWidth,
        height: girlHeight,
        zIndex: 5,
        perspective: 1000, // Needed for 3D transforms if used
      }}
    >
      {/* Body */}
      <div style={{
        position: 'absolute',
        bottom: girlHeight * 0.4, // Position body relative to feet
        left: '50%',
        transform: 'translateX(-50%)',
        width: girlWidth * 0.6,
        height: girlHeight * 0.6,
        backgroundColor: GIRL_PINK,
        borderRadius: '50% 50% 30% 30%', // Slightly rounded shape
        zIndex: 1,
      }} />
      {/* Head */}
      <div style={{
        position: 'absolute',
        bottom: girlHeight * 0.8, // Position head relative to body
        left: '50%',
        transform: 'translateX(-50%)',
        width: girlWidth * 0.6,
        height: girlWidth * 0.6,
        backgroundColor: GIRL_PINK,
        borderRadius: '50%',
        zIndex: 1,
      }} />
      {/* Left Arm */}
      <div style={{
        position: 'absolute',
        bottom: girlHeight * 0.6,
        left: '50%',
        width: girlWidth * 0.3,
        height: girlHeight * 0.4,
        backgroundColor: GIRL_PINK,
        transformOrigin: 'bottom left',
        transform: `translateX(-${girlWidth * 0.2}px) translateY(${girlHeight * 0.1}px) rotate(${armAngle}deg)`, // Position and rotate
        zIndex: 0,
      }} />
       {/* Right Arm */}
       <div style={{
        position: 'absolute',
        bottom: girlHeight * 0.6,
        left: '50%',
        width: girlWidth * 0.3,
        height: girlHeight * 0.4,
        backgroundColor: GIRL_PINK,
        transformOrigin: 'bottom right',
        transform: `translateX(${girlWidth * 0.2}px) translateY(${girlHeight * 0.1}px) rotate(${-armAngle}deg)`, // Position and rotate
        zIndex: 0,
      }} />
      {/* Left Leg */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        width: girlWidth * 0.3,
        height: girlHeight * 0.4,
        backgroundColor: GIRL_YELLOW,
        transformOrigin: 'bottom left',
        transform: `translateX(-${girlWidth * 0.3}px) rotate(10deg)`, // Slight forward leg position
        zIndex: 0,
      }} />
       {/* Right Leg */}
       <div style={{
        position: 'absolute',
        bottom: 0,
        left: '50%',
        width: girlWidth * 0.3,
        height: girlHeight * 0.4,
        backgroundColor: GIRL_YELLOW,
        transformOrigin: 'bottom right',
        transform: `translateX(${girlWidth * 0.3}px) rotate(-10deg)`, // Slight backward leg position
        zIndex: 0,
      }} />
    </div>
  );
};

const ForestRunAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: '#111111' }}> {/* Fallback */}
      <ForestBackground
        frame={frame}
        durationInFrames={durationInFrames}
        width={width}
        height={height}
      />
      <Girl
        frame={frame}
        durationInFrames={durationInFrames}
        width={width}
        height={height}
      />
      {/* Optional: Add background music */}
      {/* <Audio src="URL_TO_CHEERFUL_MUSIC.mp3" volume={0.5} /> */}
    </AbsoluteFill>
  );
};

export default ForestRunAnimation;