import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill } from 'remotion';
import { loadFont } from '@remotion/google-fonts/Inter';

// Preload the Inter font
const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600", "700"], ignoreTooManyRequestsWarning: true });

// =============================================================================
// COMPOSITION CONFIG (Required for auto-discovery)
// =============================================================================
export const compositionConfig = {
  id: 'UnifiedDarkNotificationsOnLightBackground',
  durationInSeconds: 7, // Duration of 7 seconds for two staggered notifications
  fps: 30,
  width: 720, // System Requirement
  height: 1280, // System Requirement
};

// Common styles for dark mode notifications
const darkNotificationStyles = {
  backgroundColor: 'rgba(44, 44, 46, 0.95)', // Dark background for notification bubbles
  borderRadius: 18,
  padding: 16,
  boxShadow: '0px 8px 25px rgba(0, 0, 0, 0.15)', // Subtle shadow on light background
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};

// =============================================================================
// WHATSAPP NOTIFICATION COMPONENT (Dark Mode)
// =============================================================================
const WhatsAppNotificationComponent: React.FC<{
  frame: number;
  width: number;
  notificationHeight: number;
  notificationTopPosition: number; // Final Y position when visible
  fadeInStart: number;
  fadeInEnd: number;
  fadeOutStart: number;
  fadeOutEnd: number;
  fontFamily: string;
}> = ({
  frame,
  width,
  notificationHeight,
  notificationTopPosition,
  fadeInStart,
  fadeInEnd,
  fadeOutStart,
  fadeOutEnd,
  fontFamily,
}) => {
  const notificationWidth = width * 0.9;
  const initialHiddenY = -(notificationHeight + notificationTopPosition); // Start position above screen

  const translateY = interpolate(
    frame,
    [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd],
    [initialHiddenY, notificationTopPosition, notificationTopPosition, initialHiddenY],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const opacity = interpolate(
    frame,
    [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.ease,
    }
  );

  return (
    <div
      style={{
        ...darkNotificationStyles, // Apply dark mode styles
        position: 'absolute',
        top: 0,
        left: (width - notificationWidth) / 2,
        width: notificationWidth,
        minHeight: notificationHeight,
        transform: `translateY(${translateY}px)`,
        opacity: opacity,
        fontFamily,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="https://thesvg.org/icons/whatsapp/default.svg"
            style={{ width: 18, height: 18, marginRight: 8 }}
            alt="WhatsApp Logo"
          />
          <span style={{ fontSize: 13, fontWeight: '600', color: '#07C27F' }}>WhatsApp</span>
        </div>
        <span style={{ fontSize: 11, color: '#999999', fontWeight: '400' }}>Just now</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            backgroundColor: '#555555', // Dark neutral background for avatar
            marginRight: 12,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '500' }}>J</span>
        </div>

        <div style={{ flexGrow: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            Jane Doe
          </span>
          <p style={{ fontSize: 14, margin: 0, color: '#CCCCCC', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            Hey, just wanted to check in! How are you doing?
          </p>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// TIKTOK NOTIFICATION COMPONENT (Dark Mode)
// =============================================================================
const TikTokNotificationComponent: React.FC<{
  frame: number;
  width: number;
  notificationHeight: number;
  notificationTopPosition: number; // Final Y position when visible
  fadeInStart: number;
  fadeInEnd: number;
  fadeOutStart: number;
  fadeOutEnd: number;
  fontFamily: string;
}> = ({
  frame,
  width,
  notificationHeight,
  notificationTopPosition,
  fadeInStart,
  fadeInEnd,
  fadeOutStart,
  fadeOutEnd,
  fontFamily,
}) => {
  const notificationWidth = width * 0.9;
  const initialHiddenY = -(notificationHeight + notificationTopPosition); // Start position above screen

  const translateY = interpolate(
    frame,
    [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd],
    [initialHiddenY, notificationTopPosition, notificationTopPosition, initialHiddenY],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }
  );

  const opacity = interpolate(
    frame,
    [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd],
    [0, 1, 1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.ease,
    }
  );

  return (
    <div
      style={{
        ...darkNotificationStyles, // Apply dark mode styles
        position: 'absolute',
        top: 0,
        left: (width - notificationWidth) / 2,
        width: notificationWidth,
        minHeight: notificationHeight,
        transform: `translateY(${translateY}px)`,
        opacity: opacity,
        fontFamily,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src="https://thesvg.org/icons/tiktok/default.svg"
            style={{ width: 18, height: 18, marginRight: 8 }}
            alt="TikTok Logo"
          />
          <span style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>TikTok</span>
        </div>
        <span style={{ fontSize: 11, color: '#999999', fontWeight: '400' }}>2m ago</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            backgroundColor: '#555555', // Dark neutral background for avatar
            marginRight: 12,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '500' }}>S</span>
        </div>

        <div style={{ flexGrow: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            @SarahVideos
          </span>
          <p style={{ fontSize: 14, margin: 0, color: '#CCCCCC', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            Liked your video "My Amazing Dance"!
          </p>
        </div>
      </div>
    </div>
  );
};


// =============================================================================
// MAIN COMPONENT
// =============================================================================
const UnifiedDarkNotificationsOnLightBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const notificationActualHeight = 120;
  const notificationTopMargin = 50;
  const notificationSpacing = 15;

  // WhatsApp Notification Timeline
  const waFadeInStart = 0;
  const waFadeInEnd = 20;
  const waFadeOutStart = 180;
  const waFadeOutEnd = durationInFrames; // Using durationInFrames (210)

  // TikTok Notification Timeline (staggered)
  const ttFadeInStart = 30;
  const ttFadeInEnd = 50;
  const ttFadeOutStart = 190;
  const ttFadeOutEnd = durationInFrames; // Using durationInFrames (210)

  return (
    <AbsoluteFill style={{ backgroundColor: '#F5F7F9', fontFamily }}> {/* Light background */}
      {/* WhatsApp Notification */}
      <WhatsAppNotificationComponent
        frame={frame}
        width={width}
        notificationHeight={notificationActualHeight}
        notificationTopPosition={notificationTopMargin}
        fadeInStart={waFadeInStart}
        fadeInEnd={waFadeInEnd}
        fadeOutStart={waFadeOutStart}
        fadeOutEnd={waFadeOutEnd}
        fontFamily={fontFamily}
      />

      {/* TikTok Notification */}
      <TikTokNotificationComponent
        frame={frame}
        width={width}
        notificationHeight={notificationActualHeight}
        notificationTopPosition={notificationTopMargin + notificationActualHeight + notificationSpacing}
        fadeInStart={ttFadeInStart}
        fadeInEnd={ttFadeInEnd}
        fadeOutStart={ttFadeOutStart}
        fadeOutEnd={ttFadeOutEnd}
        fontFamily={fontFamily}
      />
    </AbsoluteFill>
  );
};

// CRITICAL: You MUST have a default export for your main component!
export default UnifiedDarkNotificationsOnLightBackground;