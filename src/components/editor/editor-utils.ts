export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  image?: string;
  code?: string;
}

export function getMessageCode(message: Message | undefined): string {
  if (!message) return '';
  if (message.code) return message.code;
  const match = message.content.match(/```tsx\s*([\s\S]*?)\s*```/);
  return match?.[1]?.trim() ?? '';
}

export interface ConstantVar {
  name: string;
  value: string | number;
  type: 'string' | 'color' | 'number';
  raw: string;
}

export interface AudioTrackInfo {
  src: string;
  volume: number;
}

export interface TimelineClip {
  id: string;
  label: string;
  startFrame: number;
  endFrame: number;
  startVarName: string;
  endVarName: string;
}

export const SOUND_LIBRARY = [
  { id: 'ambient', name: 'Ambient Corporate', sub: 'Smooth backing track', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 'synthwave', name: 'Cyberpunk Synthwave', sub: 'Upbeat neon theme', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'upbeat', name: 'Pop Beat', sub: 'Catchy and energetic', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { id: 'notification', name: 'Bell Chime SFX', sub: 'Simple pop notification', url: 'https://assets.mixkit.co/active_storage/sfx/911/911-84.wav' },
  { id: 'swoosh', name: 'Swoosh SFX', sub: 'Air transition swoosh', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-84.wav' },
] as const;

export function parseConstants(code: string): ConstantVar[] {
  if (!code) return [];
  const variables: ConstantVar[] = [];
  const regex = /const\s+([a-zA-Z0-9_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`|(-?\d+(?:\.\d+)?));?/g;

  let match;
  while ((match = regex.exec(code)) !== null) {
    const name = match[1];
    if (['inter', 'fps', 'durationInFrames', 'width', 'height', 'frame'].includes(name)) continue;

    let value: string | number = '';
    let type: ConstantVar['type'] = 'string';
    if (match[2] !== undefined) value = match[2];
    else if (match[3] !== undefined) value = match[3];
    else if (match[4] !== undefined) value = match[4];
    else if (match[5] !== undefined) {
      value = Number(match[5]);
      type = 'number';
    }

    if (type !== 'number' && typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value)) {
      type = 'color';
    }
    if (!variables.some((variable) => variable.name === name)) {
      variables.push({ name, value, type, raw: match[0] });
    }
  }
  return variables;
}

export function updateConstantInCode(code: string, name: string, newValue: string | number): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(const\\s+${escapedName}\\s*=\\s*)(?:'[^']*'|"[^"]*"|\`[^\`]*\`|-?\\d+(?:\\.\\d+)?)(;?)`);
  const formattedValue = typeof newValue === 'number'
    ? String(newValue)
    : `'${newValue.replace(/'/g, "\\'")}'`;
  return code.replace(regex, `$1${formattedValue}$2`);
}

export function formatLabel(name: string): string {
  const result = name.replace(/([A-Z])/g, ' $1');
  return result.charAt(0).toUpperCase() + result.slice(1);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getDurationInSeconds(code: string): number {
  if (!code) return 5;
  const match = code.match(/durationInSeconds\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 5;
}

export function parseAudioTrack(code: string): AudioTrackInfo | null {
  if (!code) return null;
  const match = code.match(/<Audio\s+src="([^"]*)"\s+volume=\{(\d+(?:\.\d+)?)\}\s*\/?>/);
  return match ? { src: match[1], volume: Number(match[2]) } : null;
}

export function updateAudioInCode(code: string, audioUrl: string, volume = 0.5): string {
  let updated = code;
  const remotionImport = /import\s*\{([^}]*)\}\s*from\s*(['"])remotion\2;?/;
  const importMatch = updated.match(remotionImport);
  if (importMatch) {
    const names = importMatch[1].split(',').map((name) => name.trim()).filter(Boolean);
    if (!names.includes('Audio')) {
      updated = updated.replace(remotionImport, `import { ${[...names, 'Audio'].join(', ')} } from ${importMatch[2]}remotion${importMatch[2]};`);
    }
  }

  const audioElement = /<Audio\s+src="[^"]*"\s+volume=\{(\d+(?:\.\d+)?)\}\s*\/?>/;
  if (audioElement.test(updated)) {
    return updated.replace(audioElement, `<Audio src="${audioUrl}" volume={${volume}} />`);
  }

  const closingFill = '</AbsoluteFill>';
  if (updated.includes(closingFill)) {
    const index = updated.lastIndexOf(closingFill);
    return `${updated.slice(0, index)}  <Audio src="${audioUrl}" volume={${volume}} />\n    ${updated.slice(index)}`;
  }
  return updated;
}

export function removeAudioFromCode(code: string): string {
  return code.replace(/<Audio\s+src="[^"]*"\s+volume=\{(\d+(?:\.\d+)?)\}\s*\/?>\n?/g, '');
}

export function getTimelineClips(constants: ConstantVar[], totalFrames: number): TimelineClip[] {
  const clips: TimelineClip[] = [];
  constants.forEach((constant) => {
    const name = constant.name;
    const value = typeof constant.value === 'number' ? constant.value : 0;
    let prefix = '';
    let edge: 'start' | 'end' | null = null;

    if (name.endsWith('StartFrame')) {
      prefix = name.slice(0, -10);
      edge = 'start';
    } else if (name.endsWith('Start')) {
      prefix = name.slice(0, -5);
      edge = 'start';
    } else if (name.endsWith('EndFrame')) {
      prefix = name.slice(0, -8);
      edge = 'end';
    } else if (name.endsWith('End')) {
      prefix = name.slice(0, -3);
      edge = 'end';
    }
    if (!prefix || !edge) return;

    let clip = clips.find((candidate) => candidate.id === prefix);
    if (!clip) {
      clip = {
        id: prefix,
        label: formatLabel(prefix),
        startFrame: 0,
        endFrame: totalFrames,
        startVarName: '',
        endVarName: '',
      };
      clips.push(clip);
    }
    if (edge === 'start') {
      clip.startFrame = value;
      clip.startVarName = name;
    } else {
      clip.endFrame = value;
      clip.endVarName = name;
    }
  });
  return clips.filter((clip) => clip.startVarName && clip.endVarName);
}

export function getClipColor(id: string): string {
  const value = id.toLowerCase();
  if (/(text|title|subtitle|caption|header|heading)/.test(value)) return '#8b5cf6';
  if (/(image|video|bg|background|media|photo|pic)/.test(value)) return '#ec4899';
  if (/(logo|icon|animation|effect|particle)/.test(value)) return '#06b6d4';
  if (/(transition|scene|slide|card)/.test(value)) return '#f59e0b';
  return '#3b82f6';
}
