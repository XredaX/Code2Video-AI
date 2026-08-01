import type { MouseEvent, RefObject } from 'react';
import { Fragment } from 'react';
import { HelpCircle, Play } from 'lucide-react';
import styles from '../../app/page.module.css';
import {
  getClipColor,
  getDurationInSeconds,
  getTimelineClips,
  parseAudioTrack,
  parseConstants,
} from './editor-utils';

type DragType = 'move' | 'resize-left' | 'resize-right' | 'scrub';

interface StudioTimelineProps {
  editorCode: string;
  currentFrame: number;
  isPlaying: boolean;
  zoomScale: number;
  timelineTracksRef: RefObject<HTMLDivElement | null>;
  videoUrl: string | null;
  isEditorRendering: boolean;
  onTogglePlay: () => void;
  onZoomChange: (zoom: number) => void;
  onMouseDown: (
    event: MouseEvent,
    type: DragType,
    clipId?: string,
    startFrame?: number,
    endFrame?: number,
    startVarName?: string,
    endVarName?: string,
  ) => void;
}

export function StudioTimeline({
  editorCode,
  currentFrame,
  isPlaying,
  zoomScale,
  timelineTracksRef,
  videoUrl,
  isEditorRendering,
  onTogglePlay,
  onZoomChange,
  onMouseDown,
}: StudioTimelineProps) {
  const totalSeconds = getDurationInSeconds(editorCode);
  const totalFrames = Math.round(totalSeconds * 30);
  const clips = getTimelineClips(parseConstants(editorCode), totalFrames);
  const activeAudio = parseAudioTrack(editorCode);
  const tickStep = zoomScale <= 0.7 ? 60 : zoomScale <= 1.2 ? 30 : 15;

  return (
    <div className={styles.timelinePanel}>
      <div className={styles.timelineToolbar}>
        <div className={styles.timelineControls}>
          <button
            onClick={onTogglePlay}
            className={styles.btnIcon}
            disabled={!videoUrl || isEditorRendering}
            style={{ width: '28px', height: '28px' }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <span style={{ fontSize: '10px' }}>❚❚</span> : <Play size={10} />}
          </button>
          <div className={styles.timelineTimeDisplay}>
            {currentFrame}f / {totalFrames}f ({totalSeconds}s)
          </div>
        </div>

        <div className={styles.timelineZoomControls}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Zoom</span>
          <button
            onClick={() => onZoomChange(Math.max(0.5, zoomScale - 0.25))}
            className={styles.btnIcon}
            style={{ width: '18px', height: '18px', border: 'none', padding: 0 }}
            disabled={isEditorRendering}
          >
            -
          </button>
          <input
            type="range"
            min="0.5"
            max="4.0"
            step="0.1"
            value={zoomScale}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            style={{ width: '70px', height: '4px', cursor: 'pointer' }}
            disabled={isEditorRendering}
          />
          <button
            onClick={() => onZoomChange(Math.min(4, zoomScale + 0.25))}
            className={styles.btnIcon}
            style={{ width: '18px', height: '18px', border: 'none', padding: 0 }}
            disabled={isEditorRendering}
          >
            +
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {zoomScale.toFixed(1)}x
          </span>
        </div>

        <div className={styles.timelineHelpContainer}>
          <HelpCircle size={14} className={styles.timelineHelpIcon} />
          <div className={styles.timelineHelpTooltip}>
            <strong>Keyboard Shortcuts</strong>
            <ul>
              <li><span>Play / Pause</span> <kbd>Space</kbd></li>
              <li><span>Step frame back</span> <kbd>←</kbd></li>
              <li><span>Step frame forward</span> <kbd>→</kbd></li>
              <li><span>Jump 10 frames back</span> <kbd>Shift+←</kbd></li>
              <li><span>Jump 10 frames forward</span> <kbd>Shift+→</kbd></li>
            </ul>
            <strong style={{ marginTop: '0.5rem' }}>Timeline Actions</strong>
            <ul>
              <li><span>Slide layer timing</span> Drag clip block</li>
              <li><span>Trim layer duration</span> Drag block edge</li>
              <li><span>Seek playback time</span> Drag ruler scrubber</li>
            </ul>
          </div>
        </div>
      </div>

      <div className={styles.timelineWorkspace}>
        <div className={styles.timelineTrackLabels}>
          {clips.map((clip) => (
            <div key={clip.id} className={styles.timelineTrackLabelRow}>{clip.label}</div>
          ))}
          {activeAudio && (
            <div className={styles.timelineTrackLabelRow} style={{ color: '#10b981' }}>♫ Audio Sound</div>
          )}
        </div>

        <div className={styles.timelineTracksArea} ref={timelineTracksRef}>
          <div className={styles.timelineTracksInner} style={{ width: `${zoomScale * 100}%` }}>
            <div className={styles.timelineRuler} onMouseDown={(event) => onMouseDown(event, 'scrub')}>
              {Array.from({ length: Math.ceil(totalFrames / tickStep) + 1 }).map((_, index) => {
                const frame = index * tickStep;
                const percent = (frame / totalFrames) * 100;
                if (percent > 100) return null;
                const major = frame % (tickStep * 2) === 0;
                return (
                  <Fragment key={frame}>
                    <div
                      className={styles.timelineRulerTick}
                      style={{ left: `${percent}%`, height: major ? '12px' : '6px', top: major ? '12px' : '18px' }}
                    />
                    {major && <div className={styles.timelineRulerLabel} style={{ left: `${percent}%` }}>{frame}f</div>}
                  </Fragment>
                );
              })}
            </div>

            {clips.map((clip) => {
              const left = (clip.startFrame / totalFrames) * 100;
              const width = ((clip.endFrame - clip.startFrame) / totalFrames) * 100;
              return (
                <div key={clip.id} className={styles.timelineTrackRow}>
                  <div
                    className={styles.timelineClip}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: getClipColor(clip.id),
                      borderColor: 'rgba(255, 255, 255, 0.15)',
                    }}
                    onMouseDown={(event) => onMouseDown(
                      event,
                      'move',
                      clip.id,
                      clip.startFrame,
                      clip.endFrame,
                      clip.startVarName,
                      clip.endVarName,
                    )}
                  >
                    <div
                      className={`${styles.timelineClipHandle} ${styles.timelineClipHandleLeft}`}
                      onMouseDown={(event) => onMouseDown(
                        event,
                        'resize-left',
                        clip.id,
                        clip.startFrame,
                        clip.endFrame,
                        clip.startVarName,
                        clip.endVarName,
                      )}
                    />
                    <span className={styles.timelineClipLabel}>{clip.label}</span>
                    <div
                      className={`${styles.timelineClipHandle} ${styles.timelineClipHandleRight}`}
                      onMouseDown={(event) => onMouseDown(
                        event,
                        'resize-right',
                        clip.id,
                        clip.startFrame,
                        clip.endFrame,
                        clip.startVarName,
                        clip.endVarName,
                      )}
                    />
                  </div>
                </div>
              );
            })}

            {activeAudio && (
              <div className={styles.timelineTrackRow}>
                <div
                  className={`${styles.timelineClip} audio`}
                  style={{
                    left: '0%',
                    width: '100%',
                    cursor: 'default',
                    backgroundColor: '#0f766e',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '0 12px',
                  }}
                >
                  <span className={styles.timelineClipLabel} style={{ flex: 'none', maxWidth: '30%' }}>
                    ♫ {activeAudio.src.split('/').pop() || 'Soundtrack'}
                  </span>
                  <div style={{ flex: 1, height: '18px', display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
                      {Array.from({ length: 100 }).map((_, index) => {
                        const height = Math.abs(Math.sin(index * 0.18) * 0.4 + Math.cos(index * 0.35) * 0.25) * 70 + 15;
                        return (
                          <div
                            key={index}
                            style={{
                              flex: 1,
                              height: `${height}%`,
                              backgroundColor: 'rgba(255, 255, 255, 0.35)',
                              margin: '0 1px',
                              borderRadius: '1px',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.timelinePlayhead} style={{ left: `${(currentFrame / totalFrames) * 100}%` }}>
              <div className={styles.timelinePlayheadHandle} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
