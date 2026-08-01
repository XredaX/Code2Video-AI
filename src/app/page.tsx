'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Play, MessageSquare, Loader2, Code2, Sparkles, Copy, Check, Undo, RotateCcw, Pencil, Image as ImageIcon, X, Sliders, Square } from 'lucide-react';
import styles from './page.module.css';
import { ApiKeyModal } from '@/components/editor/ApiKeyModal';
import { ProjectSidebar } from '@/components/editor/ProjectSidebar';
import { StudioTimeline } from '@/components/editor/StudioTimeline';
import { WorkspaceHeader } from '@/components/editor/WorkspaceHeader';
import {
  SOUND_LIBRARY,
  clamp,
  formatLabel,
  getDurationInSeconds,
  parseAudioTrack,
  parseConstants,
  removeAudioFromCode,
  updateAudioInCode,
  updateConstantInCode,
  type Message,
  type Project,
} from '@/components/editor/editor-utils';


export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'editor' | 'code'>('preview');
  const [code, setCode] = useState<string>('');
  const [editorCode, setEditorCode] = useState<string>('');
  const [isEditorRendering, setIsEditorRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Timeline Visual Studio States & Refs
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoomScale, setZoomScale] = useState(1.5);
  const timelineTracksRef = useRef<HTMLDivElement>(null);
  const studioVideoRef = useRef<HTMLVideoElement>(null);
  const dragStateRef = useRef<{
    type: 'move' | 'resize-left' | 'resize-right' | 'scrub';
    clipId: string;
    startX: number;
    initialStartFrame: number;
    initialEndFrame: number;
    startVarName: string;
    endVarName: string;
  } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // We cannot read the HttpOnly gemini_api_key cookie from JS.
  // Instead the server sets a non-HttpOnly `has_api_key=1` signal we can read.
  const [hasApiKey, setHasApiKey] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.cookie.includes('has_api_key=1');
    }
    return false;
  });
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState<number | null>(null);
  
  // Resizable split panel layout states
  const [splitPercent, setSplitPercent] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const editorAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isResizing) return;

    document.body.classList.add('resizing-global');

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      
      const relativeX = e.clientX - containerRect.left;
      let percentage = (relativeX / containerRect.width) * 100;
      
      // Boundaries to prevent panels from becoming too small
      // Chat min-width: 280px, Video min-width: 320px
      const minChatPercent = (280 / containerRect.width) * 100;
      const minVideoPercent = (320 / containerRect.width) * 100;
      const maxChatPercent = 100 - minVideoPercent;
      
      if (percentage < minChatPercent) percentage = minChatPercent;
      if (percentage > maxChatPercent) percentage = maxChatPercent;
      
      setSplitPercent(percentage);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove('resizing-global');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.classList.remove('resizing-global');
    };
  }, [isResizing]);

  // Layout and Gemini models options states
  const [models, setModels] = useState<Array<{ id: string; displayName: string }>>([
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
    { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
  ]);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState('auto');
  const [customDuration, setCustomDuration] = useState('5');
  const [resolution, setResolution] = useState('720p');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);


  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setModels(data);
        const defaultModel = data.find(m => m.id.includes('2.5-flash-lite'))?.id || 
                             data.find(m => m.id.includes('2.5-flash'))?.id || 
                             data[0].id;
        setSelectedModel(defaultModel);
      }
    } catch {
      console.error('Failed to fetch Gemini models');
    }
  };

  const handleSaveApiKey = async (val: string) => {
    const cleanVal = val.trim();
    try {
      if (cleanVal) {
        await fetch('/api/set-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: cleanVal }),
        });
        setHasApiKey(true);
      } else {
        await fetch('/api/set-api-key', { method: 'DELETE' });
        setHasApiKey(false);
      }
    } catch {
      console.error('Failed to save API key');
    }
    setTimeout(() => { fetchModels(); }, 100);
  };



  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data.sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch {
      console.error('Failed to fetch projects');
    }
  };

  const createProject = async () => {
    const name = prompt('Enter project name:');
    if (!name) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const newProj = await res.json();
      setProjects([newProj, ...projects]);
      setActiveProjectId(newProj.id);
    } catch {
      console.error('Failed to create project');
    }
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    setRenamingProjectId(null);
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });
      const updated = await res.json();
      if (updated.id) {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name: updated.name } : p));
      }
    } catch {
      console.error('Failed to rename project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Delete this project? This cannot be undone.')) return;
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        setActiveProjectId(null);
        setMessages([]);
        setCode('');
        setVideoUrl(null);
      }
    } catch {
      console.error('Failed to delete project');
    }
  };

  const loadProjectData = async (id: string) => {
    try {
      setSelectedVersionIdx(null);
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      setMessages(data.history || []);
      setCode(data.code || '');
      // Append a timestamp to bypass browser caching of the video
      if (data.videoUrl) {
        setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
      } else {
        setVideoUrl(null);
      }
      const userMsgs = ((data.history || []) as Message[]).filter(m => m.role === 'user');
      setLastPrompt(userMsgs[userMsgs.length - 1]?.content || '');
    } catch {
      console.error('Failed to load project data');
    }
  };

  const cleanErrorMessage = (err: string) => {
    if (!err) return '';
    if (err.includes('quota') || err.includes('Quota') || err.includes('429') || err.includes('limit')) {
      return 'Gemini API quota exceeded. Please wait a moment or check your API key / billing settings.';
    }
    try {
      const startIndex = err.indexOf('{');
      if (startIndex !== -1) {
        const jsonStr = err.substring(startIndex);
        const parsed = JSON.parse(jsonStr);
        if (parsed.error && parsed.error.message) {
          return parsed.error.message;
        }
        if (parsed.message) {
          return parsed.message;
        }
      }
    } catch {}
    return err;
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setSelectedImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setSelectedImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCopyMessage = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgIndex(index);
    setTimeout(() => setCopiedMsgIndex(null), 2000);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeProjectId || loading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!activeProjectId || loading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!activeProjectId || loading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          processImageFile(file);
          e.preventDefault();
          break;
        }
      }
    }
  };

  const handleEnhancePrompt = async () => {
    const currentInput = input.trim();
    if (!currentInput || isEnhancing || loading) return;

    setIsEnhancing(true);
    try {
      const res = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput, model: selectedModel })
      });
      const data = await res.json();
      if (data.enhancedPrompt) {
        setInput(data.enhancedPrompt);
      } else if (data.error) {
        alert('Failed to enhance prompt: ' + data.error);
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while enhancing the prompt.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleSend = async (overridePrompt?: string | undefined, bypassLoadingCheck = false) => {
    const isOverrideString = typeof overridePrompt === 'string';
    const promptToSubmit = (isOverrideString ? overridePrompt : input).trim();
    const shouldBypass = isOverrideString ? bypassLoadingCheck : false;

    if (!promptToSubmit || !activeProjectId || (loading && !shouldBypass)) return;

    setSelectedVersionIdx(null);

    let imgPayload = null;
    if (selectedImage) {
      const mimeType = selectedImage.match(/data:(image\/[^;]+);base64,/)?.[1];
      const data = selectedImage.split(',')[1];
      if (mimeType && data) {
        imgPayload = { mimeType, data };
      }
    }

    if (!isOverrideString) {
      setInput('');
    }
    setLastPrompt(promptToSubmit);
    
    const newUserMsg: Message = { role: 'user', content: promptToSubmit };
    if (selectedImage) {
      newUserMsg.image = selectedImage;
    }
    setMessages(prev => [...prev, newUserMsg]);
    setLoading(true);

    setSelectedImage(null);
    setSelectedImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const opts = {
      model: selectedModel,
      aspectRatio,
      duration: duration === 'other' ? (customDuration || '5') : duration,
      resolution
    };

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId: activeProjectId, 
          message: promptToSubmit, 
          image: imgPayload, 
          options: opts 
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      
      if (data.error) {
        setMessages(prev => [...prev, { role: 'model', content: `Error: ${cleanErrorMessage(data.error)}` }]);
      } else {
        await loadProjectData(activeProjectId);
        if (data.code) setCode(data.code);
        if (data.videoUrl) {
          setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'model', content: 'Render cancelled.' }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', content: 'An unexpected error occurred.' }]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeProjectId) return;
    // Abort the fetch request
    abortControllerRef.current?.abort();
    // Tell the server to kill the render process
    try {
      await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
    } catch { /* server may already be done */ }
  };

  const handleRollback = async () => {
    if (!activeProjectId || loading) return;
    setSelectedVersionIdx(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/rollback`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setMessages(data.history || []);
        setCode(data.code || '');
        if (data.videoUrl) {
          setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
        } else {
          setVideoUrl(null);
        }
        const userMsgs = ((data.history || []) as Message[]).filter(m => m.role === 'user');
        setLastPrompt(userMsgs[userMsgs.length - 1]?.content || '');
      } else {
        alert(data.error || 'Failed to rollback');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred during rollback');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!activeProjectId || loading || !lastPrompt) return;
    setSelectedVersionIdx(null);

    // Check if the last model response was an error
    const lastMsg = messages[messages.length - 1];
    const isError = lastMsg && lastMsg.role === 'model' && lastMsg.content.startsWith('Error:');

    if (isError) {
      // The last generation failed, so it was not saved to backend history.
      // We can just clean up the last two messages from local state and re-send.
      setMessages(prev => prev.slice(0, -2));
      handleSend(lastPrompt);
    } else {
      // The last generation was successful, so it was saved to backend history.
      // We must rollback first to remove it from the backend and frontend states.
      setLoading(true);
      try {
        const res = await fetch(`/api/projects/${activeProjectId}/rollback`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success) {
          // Update local state with the rolled back history/code/video
          setMessages(data.history || []);
          setCode(data.code || '');
          if (data.videoUrl) {
            setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
          } else {
            setVideoUrl(null);
          }
          
          // Re-send the prompt using handleSend and bypass check because loading is true
          handleSend(lastPrompt, true);
        } else {
          alert(data.error || 'Failed to rollback for retry');
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        alert('An error occurred during retry');
        setLoading(false);
      }
    }
  };

  const handleEditorRender = async () => {
    if (!activeProjectId || isEditorRendering || loading) return;
    setIsEditorRendering(true);

    const controller = new AbortController();
    editorAbortRef.current = controller;

    try {
      const res = await fetch(`/api/projects/${activeProjectId}/editor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorCode }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.error) {
        if (data.error === 'Render cancelled by user.') {
          alert('Render cancelled.');
        } else {
          alert('Render failed:\n' + (data.details || data.error));
        }
      } else {
        setCode(data.code);
        setEditorCode(data.code);
        setMessages(data.history || []);
        if (data.videoUrl) {
          setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
        }
        setActiveTab('preview');
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        alert('Render cancelled.');
      } else {
        console.error(e);
        alert('An error occurred while rendering edited code.');
      }
    } finally {
      editorAbortRef.current = null;
      setIsEditorRendering(false);
    }
  };

  const handleEditorCancel = async () => {
    if (!activeProjectId) return;
    editorAbortRef.current?.abort();
    try {
      await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProjectId }),
      });
    } catch { /* server may already be done */ }
  };

  const handleConstantChange = (name: string, value: string | number) => {
    setEditorCode(prev => updateConstantInCode(prev, name, value));
  };

  const handleAddAudio = (url: string) => {
    setEditorCode(prev => updateAudioInCode(prev, url));
  };

  const handleRemoveAudio = () => {
    setEditorCode(prev => removeAudioFromCode(prev));
  };

  const handleAudioVolumeChange = (vol: number) => {
    const activeAudio = parseAudioTrack(editorCode);
    if (activeAudio) {
      setEditorCode(prev => updateAudioInCode(prev, activeAudio.src, vol));
    }
  };

  const toggleStudioPlay = useCallback(() => {
    if (!studioVideoRef.current) return;
    if (isPlaying) {
      studioVideoRef.current.pause();
    } else {
      studioVideoRef.current.play().catch(e => console.error(e));
    }
  }, [isPlaying]);

  const handleTimelineMouseDown = (
    e: React.MouseEvent,
    type: 'move' | 'resize-left' | 'resize-right' | 'scrub',
    clipId = '',
    clipStart = 0,
    clipEnd = 0,
    startVarName = '',
    endVarName = ''
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (controlsDisabled || isEditorRendering) return;

    const startX = e.clientX;
    dragStateRef.current = {
      type,
      clipId,
      startX,
      initialStartFrame: clipStart,
      initialEndFrame: clipEnd,
      startVarName,
      endVarName
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) return;

      const trackArea = timelineTracksRef.current;
      if (!trackArea) return;

      const trackRect = trackArea.getBoundingClientRect();
      const trackInner = trackArea.querySelector('.timeline-tracks-inner') as HTMLElement;
      const timelineWidth = trackInner ? trackInner.scrollWidth : trackRect.width;
      const totalFrames = Math.round(getDurationInSeconds(editorCode) * 30);

      // Compute frame delta
      const deltaX = moveEvent.clientX - state.startX;
      const deltaFrames = Math.round((deltaX / timelineWidth) * totalFrames);

      if (state.type === 'scrub') {
        const relativeX = moveEvent.clientX - trackRect.left + trackArea.scrollLeft;
        const targetFrame = clamp(Math.round((relativeX / timelineWidth) * totalFrames), 0, totalFrames);
        setCurrentFrame(targetFrame);
        if (studioVideoRef.current) {
          studioVideoRef.current.currentTime = targetFrame / 30;
        }
      } else if (state.type === 'move') {
        const duration = state.initialEndFrame - state.initialStartFrame;
        const newStart = clamp(state.initialStartFrame + deltaFrames, 0, totalFrames - duration);
        const newEnd = newStart + duration;

        setEditorCode(prev => {
          let updated = updateConstantInCode(prev, state.startVarName, newStart);
          updated = updateConstantInCode(updated, state.endVarName, newEnd);
          return updated;
        });
      } else if (state.type === 'resize-left') {
        const newStart = clamp(state.initialStartFrame + deltaFrames, 0, state.initialEndFrame - 5);
        setEditorCode(prev => updateConstantInCode(prev, state.startVarName, newStart));
      } else if (state.type === 'resize-right') {
        const newEnd = clamp(state.initialEndFrame + deltaFrames, state.initialStartFrame + 5, totalFrames);
        setEditorCode(prev => updateConstantInCode(prev, state.endVarName, newEnd));
      }
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleStartEditMessage = (index: number) => {
    setEditingMessageIndex(index);
    setEditingMessageText(messages[index].content);
  };

  const handleSaveEditedMessage = async (index: number, newPromptText: string) => {
    if (!activeProjectId || loading || !newPromptText.trim()) return;
    
    setSelectedVersionIdx(null);
    setLoading(true);
    setEditingMessageIndex(null);
    setEditingMessageText('');
    
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIndex: index })
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages(data.history || []);
        setCode(data.code || '');
        if (data.videoUrl) {
          setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
        } else {
          setVideoUrl(null);
        }
        handleSend(newPromptText, true);
      } else {
        alert(data.error || 'Failed to roll back for message edit');
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred while saving message edit');
      setLoading(false);
    }
  };

  const handleRevertToVersion = async (versionIdx: number) => {
    if (!activeProjectId || loading) return;
    
    const targetIdx = 2 * (versionIdx + 1);
    const confirmRevert = confirm(`Are you sure you want to revert to Version ${versionIdx + 1}? This will permanently delete all subsequent versions.`);
    if (!confirmRevert) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${activeProjectId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetIndex: targetIdx })
      });
      const data = await res.json();
      
      if (data.success) {
        setMessages(data.history || []);
        setCode(data.code || '');
        if (data.videoUrl) {
          setVideoUrl(`${data.videoUrl}?t=${Date.now()}`);
        } else {
          setVideoUrl(null);
        }
        const userMsgs = ((data.history || []) as Message[]).filter(m => m.role === 'user');
        setLastPrompt(userMsgs[userMsgs.length - 1]?.content || '');
        setSelectedVersionIdx(null);
      } else {
        alert(data.error || 'Failed to revert to selected version');
      }
    } catch (e) {
      console.error(e);
      alert('An error occurred during version reversion');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const modelMessages = useMemo(() => messages.filter((message) => message.role === 'model'), [messages]);
  const versionsCount = modelMessages.length;

  const getCodeForVersion = useCallback((versionIdx: number): string => {
    const msg = modelMessages[versionIdx];
    if (!msg) return '';
    const tsxMatch = msg.content.match(/```tsx\s*([\s\S]*?)\s*```/);
    return tsxMatch && tsxMatch[1] ? tsxMatch[1] : '';
  }, [modelMessages]);

  let displayedMessages = messages;
  if (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1) {
    const targetModelMsg = modelMessages[selectedVersionIdx];
    const targetFullIdx = messages.indexOf(targetModelMsg);
    if (targetFullIdx !== -1) {
      displayedMessages = messages.slice(0, targetFullIdx + 1);
    }
  }

  const controlsDisabled = !activeProjectId || loading || (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1);

  useEffect(() => {
    setTimeout(() => {
      fetchProjects();
      fetchModels();
    }, 0);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      setTimeout(() => {
        loadProjectData(activeProjectId);
      }, 0);
      setActiveTab('preview');
    } else {
      setTimeout(() => {
        setMessages([]);
        setVideoUrl(null);
        setCode('');
        setLastPrompt('');
        setEditorCode('');
      }, 0);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1) {
      setEditorCode(getCodeForVersion(selectedVersionIdx));
    } else {
      setEditorCode(code);
    }
  }, [selectedVersionIdx, code, versionsCount, getCodeForVersion]);

  // Synchronize playhead state with the studio preview video playback
  useEffect(() => {
    const video = studioVideoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const current = Math.round(video.currentTime * 30);
      setCurrentFrame(current);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [activeTab, videoUrl]);

  // Global keyboard shortcuts for timeline playback & scrubbing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.hasAttribute('contenteditable'))) {
        return;
      }

      const totalFrames = Math.round(getDurationInSeconds(editorCode) * 30);

      if (e.key === ' ') {
        e.preventDefault();
        toggleStudioPlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const targetFrame = Math.max(0, currentFrame - step);
        setCurrentFrame(targetFrame);
        if (studioVideoRef.current) {
          studioVideoRef.current.currentTime = targetFrame / 30;
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const targetFrame = Math.min(totalFrames, currentFrame + step);
        setCurrentFrame(targetFrame);
        if (studioVideoRef.current) {
          studioVideoRef.current.currentTime = targetFrame / 30;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrame, editorCode, activeTab, toggleStudioPlay]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(() => console.log('Auto-play blocked'));
    }
  }, [videoUrl]);

  return (
    <div className={styles.appContainer}>
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        collapsed={sidebarCollapsed}
        renamingProjectId={renamingProjectId}
        renameValue={renameValue}
        renameInputRef={renameInputRef}
        hasApiKey={hasApiKey}
        onCreate={createProject}
        onSelect={setActiveProjectId}
        onBeginRename={(project) => {
          setRenamingProjectId(project.id);
          setRenameValue(project.name);
          setTimeout(() => renameInputRef.current?.select(), 30);
        }}
        onRenameValueChange={setRenameValue}
        onCommitRename={handleRenameProject}
        onCancelRename={() => setRenamingProjectId(null)}
        onDelete={handleDeleteProject}
        onOpenSettings={() => {
          setTempApiKey('');
          setShowPassword(false);
          setShowApiKeyModal(true);
        }}
        onToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        <WorkspaceHeader
          projects={projects}
          activeProjectId={activeProjectId}
          sidebarCollapsed={sidebarCollapsed}
          versionsCount={versionsCount}
          selectedVersionIndex={selectedVersionIdx}
          loading={loading}
          hasHistory={messages.length >= 2}
          onSelectVersion={setSelectedVersionIdx}
          onRevert={handleRevertToVersion}
          onRollback={handleRollback}
          onRetry={handleRetry}
        />

        <div className={styles.contentArea} ref={containerRef}>
          {/* Left Panel: Chat Stream */}
          <div 
            className={`${styles.chatSection} ${isDragging ? 'dragging' : ''}`}
            style={{ width: `${splitPercent}%`, flex: 'none' }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className={styles.dragDropOverlay}>
                <div className={styles.dragDropOverlayContent}>
                  <Sparkles size={32} className="animate-pulse" style={{ color: 'var(--accent-primary)' }} />
                  <p>Drop image to attach</p>
                </div>
              </div>
            )}
            <div className={styles.chatMessages}>
              {displayedMessages.length === 0 && !loading && (
                <div className={styles.chatPlaceholder}>
                  <MessageSquare size={32} style={{ opacity: 0.3 }} />
                  <p>Describe what kind of Remotion video you want to generate. For example: <i>&quot;a particle animation with text overlay&quot;</i>.</p>
                </div>
              )}
              {displayedMessages.map((m, i) => (
                <div key={i} className={`${styles.messageWrapper} ${m.role}`} style={{ width: '100%' }}>
                  <div className={styles.messageHeader} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className={styles.messageRole}>
                      {m.role === 'model' ? 'AI Assistant' : 'User'}
                    </span>
                    {m.role === 'user' && !loading && editingMessageIndex !== i && (
                      <button 
                        onClick={() => handleStartEditMessage(i)}
                        className={styles.msgEditBtn}
                        title="Edit this prompt"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                    <button 
                      onClick={() => handleCopyMessage(m.content, i)}
                      className={styles.msgCopyBtn}
                      title="Copy message"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', transition: 'color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      {copiedMsgIndex === i ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  </div>
                  <div className={styles.messageContent} style={m.role === 'user' && editingMessageIndex === i ? { width: '100%' } : undefined}>
                    {m.role === 'model' ? (() => {
                      const contentStr = m.content.replace(/```(?:tsx|typescript)?\s*[\s\S]*?```/gi, '');
                      const thinkMatch = contentStr.match(/<think>([\s\S]*?)<\/think>/);
                      const suggestionMatch = contentStr.match(/<suggestions>([\s\S]*?)<\/suggestions>/);
                      
                      const finalContent = contentStr
                        .replace(/<think>[\s\S]*?<\/think>/, '')
                        .replace(/<suggestions>[\s\S]*?<\/suggestions>/, '')
                        .trim();

                      const suggestions = suggestionMatch ? suggestionMatch[1].split('|').map(s => s.trim()).filter(Boolean) : [];

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                          {thinkMatch && (
                            <details style={{ opacity: 0.6, fontSize: '0.85rem', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px', borderLeft: '2px solid var(--accent-primary)' }}>
                              <summary style={{ cursor: 'pointer', outline: 'none', userSelect: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                <Sparkles size={12} /> AI Thought Process
                              </summary>
                              <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap', paddingLeft: '1rem' }}>{thinkMatch[1].trim()}</div>
                            </details>
                          )}
                          {finalContent && <p style={{ whiteSpace: 'pre-wrap' }}>{finalContent}</p>}
                          
                          {suggestions.length > 0 && i === displayedMessages.length - 1 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                              {suggestions.map((sug, idx) => (
                                <button 
                                  key={idx}
                                  onClick={() => handleSend(sug)}
                                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-focus)', color: 'var(--text-secondary)', padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      editingMessageIndex === i ? (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <textarea
                            value={editingMessageText}
                            onChange={e => setEditingMessageText(e.target.value)}
                            className={styles.controlSelect}
                            style={{ width: '100%', minHeight: '60px', background: 'var(--bg-card)', border: '1px solid var(--border-focus)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical', outline: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setEditingMessageIndex(null)}
                              className={`${styles.btn} ${styles.btnOutline}`}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEditedMessage(i, editingMessageText)}
                              className={styles.btn}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
                            >
                              Save & Re-generate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p>{m.content}</p>
                          {m.image && (
                            <div className="message-image-container" style={{ marginTop: '0.6rem', maxWidth: '240px' }}>
                              <Image
                                src={m.image}
                                alt="Reference attachment" 
                                width={240}
                                height={240}
                                unoptimized
                                style={{ width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', display: 'block', cursor: 'zoom-in' }} 
                                onClick={() => window.open(m.image, '_blank')}
                              />
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>
                  {m.role === 'model' && i === messages.length - 1 && (
                    <div className="message-actions" style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <button
                        className={`${styles.btnAction} ${styles.btnXs}`}
                        onClick={handleRollback}
                        disabled={loading}
                        title="Rollback the last changes"
                      >
                        <Undo size={10} />
                        <span>Rollback</span>
                      </button>
                      <button
                        className={`${styles.btnAction} ${styles.btnXs}`}
                        onClick={handleRetry}
                        disabled={loading}
                        title="Re-generate the last prompt"
                      >
                        <RotateCcw size={10} />
                        <span>Retry / Re-generate</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className={styles.loadingPulse}>
                  <Loader2 size={14} className="animate-spin" />
                  Generating Remotion code and rendering locally...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            
            <div className={styles.chatInputWrapper}>
              {/* Image Preview Thumbnail */}
              {selectedImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <Image src={selectedImage} alt="Preview" width={48} height={48} unoptimized style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={handleRemoveImage}
                      style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', padding: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remove image"
                    >
                      <X size={10} style={{ color: '#fff' }} />
                    </button>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                    {selectedImageName}
                  </span>
                </div>
              )}

              <div style={{ position: 'relative' }}>
                <textarea 
                  className={styles.chatInputTextarea}
                  placeholder={
                    (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1)
                      ? "Revert to this version to make further edits..."
                      : (activeProjectId ? "Describe the video you want to generate..." : "Select or create a project to start")
                  }
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={handlePaste}
                  disabled={controlsDisabled}
                  rows={2}
                  style={{ paddingRight: '40px' }}
                />
                <button
                  type="button"
                  onClick={() => handleEnhancePrompt()}
                  disabled={controlsDisabled || !input.trim() || isEnhancing}
                  title="Enhance prompt with AI"
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: isEnhancing ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    cursor: (controlsDisabled || !input.trim() || isEnhancing) ? 'not-allowed' : 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (!(controlsDisabled || !input.trim() || isEnhancing)) {
                      e.currentTarget.style.color = 'var(--accent-primary)';
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!(controlsDisabled || !input.trim() || isEnhancing)) {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  {isEnhancing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                </button>
              </div>
              
              <div className={styles.chatInputControls}>
                <div className={styles.controlsLeft}>
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleImageSelect}
                    style={{ display: 'none' }}
                  />
                  
                  {/* Attachment Icon Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={controlsDisabled}
                    className={styles.controlSelect}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.35rem 0.5rem' }}
                    title="Upload reference image"
                  >
                    <ImageIcon size={14} />
                  </button>

                  {/* Model Select */}
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    disabled={controlsDisabled}
                    className={styles.controlSelect}
                    title="AI Model"
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>

                  {/* Aspect Ratio Select */}
                  <select
                    value={aspectRatio}
                    onChange={e => setAspectRatio(e.target.value)}
                    disabled={controlsDisabled}
                    className={styles.controlSelect}
                    title="Aspect Ratio"
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="4:3">4:3</option>
                    <option value="3:4">3:4</option>
                    <option value="1:1">1:1</option>
                  </select>

                  {/* Duration Select */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <select
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      disabled={controlsDisabled}
                      className={styles.controlSelect}
                      title="Video Duration"
                    >
                      <option value="auto">Auto Duration</option>
                      {Array.from({ length: 14 }).map((_, i) => {
                        const sec = i + 2; // 2s to 15s
                        return <option key={sec} value={sec.toString()}>{sec}s</option>;
                      })}
                      <option value="other">Other...</option>
                    </select>
                    
                    {duration === 'other' && (
                      <input 
                        type="number"
                        className={styles.customDurationInput}
                        placeholder="sec"
                        min={1}
                        max={30}
                        value={customDuration}
                        onChange={e => setCustomDuration(e.target.value)}
                        disabled={controlsDisabled}
                      />
                    )}
                  </div>

                  {/* Resolution Select */}
                  <select
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    disabled={controlsDisabled}
                    className={styles.controlSelect}
                    title="Video Resolution"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>

                <button 
                  className={`${styles.btn} ${loading ? styles.btnCancel : ''}`}
                  onClick={loading ? () => handleCancel() : () => handleSend()}
                  disabled={(!loading && (controlsDisabled || !input.trim() || isEnhancing))}
                >
                  {loading ? (
                    <>
                      <Square size={12} />
                      Cancel
                    </>
                  ) : 'Send'}
                </button>
              </div>
            </div>
          </div>

          {/* Draggable Resizer Handle */}
          <div className={`${styles.resizeHandle} ${isResizing ? styles.active : ''}`}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />

          {/* Right Panel: Tabs for Preview, Editor & Code */}
          <div className={styles.videoSection} style={{ width: `${100 - splitPercent}%`, flex: 'none' }}>
            <div className={styles.tabsHeader}>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'preview' ? styles.active : ''}`}
                onClick={() => setActiveTab('preview')}
              >
                <Play size={12} /> Preview
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'editor' ? styles.active : ''}`}
                onClick={() => setActiveTab('editor')}
              >
                <Sliders size={12} /> Editor
                <span className={styles.maintenanceBadge}>Under Maintenance</span>
              </button>
              <button 
                className={`${styles.tabBtn} ${activeTab === 'code' ? styles.active : ''}`}
                onClick={() => setActiveTab('code')}
              >
                <Code2 size={12} /> Code
              </button>
            </div>

            {activeTab === 'code' && (
              <div className={styles.codeViewerContainer}>
                <div className={styles.codeToolbar}>
                  <span className={styles.codeFilename}>video.tsx</span>
                  {code && (
                    <button className={styles.copyBtn} onClick={copyCode}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy Code'}
                    </button>
                  )}
                </div>
                <pre className={styles.codePre}>
                  <code>{
                    (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1)
                      ? getCodeForVersion(selectedVersionIdx)
                      : (code || '// No code generated yet. Prompt the AI.')
                  }</code>
                </pre>
              </div>
            )}

            {activeTab === 'preview' && (
              <div className={styles.videoContainer}>
                {(() => {
                  const currentVideoUrl = (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1)
                    ? `/api/video/${activeProjectId}?v=${selectedVersionIdx + 1}`
                    : videoUrl;

                  return currentVideoUrl ? (
                    <div className={styles.videoViewport}>
                      <video 
                        ref={videoRef} 
                        key={currentVideoUrl}
                        controls 
                        src={currentVideoUrl} 
                        autoPlay 
                        loop 
                        playsInline 
                      />
                    </div>
                  ) : (
                    <div className={styles.videoPlaceholder}>
                      <Play size={32} style={{ opacity: 0.3 }} />
                      <p>No video generated yet</p>
                    </div>
                  );
                })()}
              </div>
            )}

            {activeTab === 'editor' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Visual Layout: Top Player/Sidebar, Bottom Timeline */}
                <div className={styles.studioLayoutMain}>
                  {/* Left Sidebar: Assets, Audio, Parameters */}
                  <div className={styles.studioSidebar}>
                    <div className={styles.studioSidebarHeader}>
                      <h3>Studio Controls</h3>
                    </div>
                    
                    <div className={styles.studioSidebarContent}>
                      {/* Audio / Soundtrack selector */}
                      <div className={styles.sidebarSection}>
                        <div className={styles.sidebarSectionTitle} style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>Audio & SFX</div>
                        {(() => {
                          const activeAudio = parseAudioTrack(editorCode);
                          return activeAudio ? (
                            <div className={styles.audioTrackItem}>
                              <div className={styles.audioTrackInfo}>
                                <span className={styles.audioTrackName}>Soundtrack Active</span>
                                <span className={styles.audioTrackSub} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                  {activeAudio.src.split('/').pop()}
                                </span>
                              </div>
                              <div className={styles.audioTrackActions}>
                                <input 
                                  type="range" 
                                  min="0" 
                                  max="1" 
                                  step="0.1" 
                                  value={activeAudio.volume}
                                  onChange={(e) => handleAudioVolumeChange(parseFloat(e.target.value))}
                                  style={{ width: '40px' }}
                                  title="Volume"
                                />
                                <button 
                                  onClick={handleRemoveAudio}
                                  className={styles.btnIcon}
                                  style={{ width: '22px', height: '22px' }}
                                  title="Remove soundtrack"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {SOUND_LIBRARY.map(sound => (
                                <div key={sound.id} className={styles.audioTrackItem}>
                                  <div className={styles.audioTrackInfo}>
                                    <span className={styles.audioTrackName}>{sound.name}</span>
                                    <span className={styles.audioTrackSub}>{sound.sub}</span>
                                  </div>
                                  <button
                                    onClick={() => handleAddAudio(sound.url)}
                                    className={`${styles.btnAction} ${styles.btnXs}`}
                                    style={{ color: '#fff', backgroundColor: 'var(--accent-primary)', borderColor: 'transparent' }}
                                  >
                                    Add
                                  </button>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Text & Color Constants */}
                      <div className={styles.sidebarSection} style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <div className={styles.sidebarSectionTitle} style={{ paddingLeft: 0, marginBottom: '0.5rem' }}>Variables</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {parseConstants(editorCode).filter(c => !c.name.endsWith('StartFrame') && !c.name.endsWith('Start') && !c.name.endsWith('EndFrame') && !c.name.endsWith('End')).length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No configurable constants.</span>
                          ) : (
                            parseConstants(editorCode)
                              .filter(c => !c.name.endsWith('StartFrame') && !c.name.endsWith('Start') && !c.name.endsWith('EndFrame') && !c.name.endsWith('End'))
                              .map((cVar) => {
                                const label = formatLabel(cVar.name);
                                return (
                                  <div key={cVar.name} className={styles.studioFormGroup}>
                                    <label className={styles.studioLabel}>{label}</label>
                                    {cVar.type === 'color' ? (
                                      <div className={styles.studioColorRow}>
                                        <input
                                          type="color"
                                          value={String(cVar.value)}
                                          onChange={(e) => handleConstantChange(cVar.name, e.target.value)}
                                          disabled={controlsDisabled || isEditorRendering}
                                          className={styles.studioColorPicker}
                                        />
                                        <input
                                          type="text"
                                          value={String(cVar.value)}
                                          onChange={(e) => handleConstantChange(cVar.name, e.target.value)}
                                          disabled={controlsDisabled || isEditorRendering}
                                          className={`${styles.studioInput} ${styles.studioColorInput}`}
                                          style={{ height: '30px', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                                        />
                                      </div>
                                    ) : cVar.type === 'number' ? (
                                      <input
                                        type="number"
                                        step={cVar.name.toLowerCase().includes('opacity') || cVar.name.toLowerCase().includes('volume') || cVar.name.toLowerCase().includes('scale') ? '0.1' : '1'}
                                        value={cVar.value}
                                        onChange={(e) => {
                                          const parsedVal = e.target.value === '' ? 0 : Number(e.target.value);
                                          handleConstantChange(cVar.name, parsedVal);
                                        }}
                                        disabled={controlsDisabled || isEditorRendering}
                                        className={styles.studioInput}
                                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                                      />
                                    ) : (
                                      <input
                                        type="text"
                                        value={String(cVar.value)}
                                        onChange={(e) => handleConstantChange(cVar.name, e.target.value)}
                                        disabled={controlsDisabled || isEditorRendering}
                                        className={styles.studioInput}
                                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
                                      />
                                    )}
                                  </div>
                                );
                              })
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.studioFooter}>
                      {isEditorRendering ? (
                        <button
                          className={`${styles.btn} ${styles.btnCancel} ${styles.studioRenderBtn}`}
                          onClick={handleEditorCancel}
                        >
                          <Square size={14} />
                          <span>Cancel Render</span>
                        </button>
                      ) : (
                        <button
                          className={`${styles.btn} ${styles.studioRenderBtn}`}
                          onClick={handleEditorRender}
                          disabled={controlsDisabled || !editorCode || !activeProjectId}
                        >
                          <Play size={14} />
                          <span>Save & Render Video</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Main Center Video viewport */}
                  <div className={styles.studioMainViewport}>
                    <div className={styles.studioPlayerContainer}>
                      {(() => {
                        const currentVideoUrl = (selectedVersionIdx !== null && selectedVersionIdx < versionsCount - 1)
                          ? `/api/video/${activeProjectId}?v=${selectedVersionIdx + 1}`
                          : videoUrl;
                        return currentVideoUrl ? (
                          <div className={styles.videoViewport} style={{ maxHeight: '100%' }}>
                            <video 
                              ref={studioVideoRef} 
                              key={currentVideoUrl}
                              src={currentVideoUrl} 
                              playsInline 
                              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
                            />
                          </div>
                        ) : (
                          <div className={styles.videoPlaceholder}>
                            <Play size={32} style={{ opacity: 0.3 }} />
                            <p>Generate a video to activate studio</p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <StudioTimeline
                  editorCode={editorCode}
                  currentFrame={currentFrame}
                  isPlaying={isPlaying}
                  zoomScale={zoomScale}
                  timelineTracksRef={timelineTracksRef}
                  videoUrl={videoUrl}
                  isEditorRendering={isEditorRendering}
                  onTogglePlay={toggleStudioPlay}
                  onZoomChange={setZoomScale}
                  onMouseDown={handleTimelineMouseDown}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {showApiKeyModal && (
        <ApiKeyModal
          apiKey={tempApiKey}
          showPassword={showPassword}
          onApiKeyChange={setTempApiKey}
          onTogglePassword={() => setShowPassword((visible) => !visible)}
          onCancel={() => setShowApiKeyModal(false)}
          onSave={() => {
            handleSaveApiKey(tempApiKey);
            setShowApiKeyModal(false);
          }}
        />
      )}
    </div>
  );
}
