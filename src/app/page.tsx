'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Plus, MessageSquare, Loader2, Code2, Video, Sparkles, Copy, Check, Menu, Undo, RotateCcw, Key, Eye, EyeOff, Pencil, Image, X } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  createdAt: number;
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

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

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )gemini_api_key=([^;]*)/);
    if (match) {
      setApiKey(decodeURIComponent(match[1]));
    }
    fetchProjects();
    fetchModels();
    window.scrollTo(0, 0);
  }, []);

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
    } catch (e) {
      console.error('Failed to fetch Gemini models');
    }
  };

  const handleSaveApiKey = (val: string) => {
    const cleanVal = val.trim();
    setApiKey(cleanVal);
    if (cleanVal) {
      document.cookie = `gemini_api_key=${encodeURIComponent(cleanVal)}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
    } else {
      document.cookie = `gemini_api_key=; path=/; max-age=0; SameSite=Lax`;
    }
    setTimeout(() => {
      fetchModels();
    }, 100);
  };

  useEffect(() => {
    if (activeProjectId) {
      loadProjectData(activeProjectId);
    } else {
      setMessages([]);
      setVideoUrl(null);
      setCode('');
      setLastPrompt('');
    }
  }, [activeProjectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      videoRef.current.load();
      videoRef.current.play().catch(e => console.log('Auto-play blocked'));
    }
  }, [videoUrl]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data.sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch (e) {
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
    } catch (e) {
      console.error('Failed to create project');
    }
  };

  const loadProjectData = async (id: string) => {
    try {
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
      const userMsgs = (data.history || []).filter((m: any) => m.role === 'user');
      setLastPrompt(userMsgs[userMsgs.length - 1]?.content || '');
    } catch (e) {
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
    } catch (e) {}
    return err;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(reader.result as string);
      setSelectedImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setSelectedImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (overridePrompt?: any, bypassLoadingCheck = false) => {
    const isOverrideString = typeof overridePrompt === 'string';
    const promptToSubmit = (isOverrideString ? overridePrompt : input).trim();
    const shouldBypass = isOverrideString ? bypassLoadingCheck : false;

    if (!promptToSubmit || !activeProjectId || (loading && !shouldBypass)) return;

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
    
    const newUserMsg: any = { role: 'user', content: promptToSubmit };
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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId: activeProjectId, 
          message: promptToSubmit, 
          image: imgPayload, 
          options: opts 
        })
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
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', content: 'An unexpected error occurred.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!activeProjectId || loading) return;
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
        const userMsgs = (data.history || []).filter((m: any) => m.role === 'user');
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

  const handleStartEditMessage = (index: number) => {
    setEditingMessageIndex(index);
    setEditingMessageText(messages[index].content);
  };

  const handleSaveEditedMessage = async (index: number, newPromptText: string) => {
    if (!activeProjectId || loading || !newPromptText.trim()) return;
    
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
        const userMsgs = (data.history || []).filter((m: any) => m.role === 'user');
        setLastPrompt(userMsgs[userMsgs.length - 1]?.content || '');
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

  const modelMessages = messages.filter(m => m.role === 'model');
  const versionsCount = modelMessages.length;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>

        <div className="sidebar-content">
          <button className="btn btn-outline" onClick={createProject} style={{ width: '100%' }}>
            <Plus size={14} /> New Project
          </button>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Projects</div>
            <div className="project-list">
              {projects.length === 0 ? (
                <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No projects yet.
                </div>
              ) : (
                projects.map(p => (
                  <div 
                    key={p.id} 
                    className={`project-item ${activeProjectId === p.id ? 'active' : ''}`}
                    onClick={() => setActiveProjectId(p.id)}
                  >
                    <Video size={14} className="project-icon" />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Footer (API Key settings) */}
        <div className="sidebar-footer" style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <button 
            className="btn btn-outline" 
            onClick={() => { setTempApiKey(apiKey); setShowPassword(false); setShowApiKeyModal(true); }}
            style={{ width: '100%', fontSize: '0.8rem', gap: '0.4rem', padding: '0.4rem' }}
            title="Configure Gemini API Key"
          >
            <Key size={14} />
            <span>Set API Key</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              className="btn-icon" 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu size={16} />
            </button>
            <h2>{activeProjectId ? projects.find(p => p.id === activeProjectId)?.name : 'Workspace'}</h2>
          </div>
          {activeProjectId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {versionsCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Version:</span>
                  <select
                    value={versionsCount - 1}
                    onChange={e => handleRevertToVersion(Number(e.target.value))}
                    disabled={loading}
                    className="control-select"
                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', height: 'auto', cursor: 'pointer' }}
                  >
                    {modelMessages.map((_, idx) => (
                      <option key={idx} value={idx}>
                        {`v${idx + 1}${idx === versionsCount - 1 ? ' (latest)' : ''}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {messages.length >= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    className="btn-action"
                    onClick={handleRollback}
                    disabled={loading}
                    title="Rollback the last changes"
                  >
                    <Undo size={12} />
                    <span>Rollback</span>
                  </button>
                  <button
                    className="btn-action"
                    onClick={handleRetry}
                    disabled={loading}
                    title="Re-generate the last prompt"
                  >
                    <RotateCcw size={12} />
                    <span>Retry</span>
                  </button>
                </div>
              )}
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: loading ? '#f59e0b' : '#10b981', display: 'inline-block' }}></span>
                {loading ? 'Processing...' : 'Ready'}
              </span>
            </div>
          )}
        </div>

        <div className="content-area">
          {/* Left Panel: Chat Stream */}
          <div className="chat-section">
            <div className="chat-messages">
              {messages.length === 0 && !loading && (
                <div className="chat-placeholder">
                  <MessageSquare size={32} style={{ opacity: 0.3 }} />
                  <p>Describe what kind of Remotion video you want to generate. For example: <i>"a particle animation with text overlay"</i>.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`message-wrapper ${m.role}`} style={{ width: '100%' }}>
                  <div className="message-header" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="message-role">
                      {m.role === 'model' ? 'AI Assistant' : 'User'}
                    </span>
                    {m.role === 'user' && !loading && editingMessageIndex !== i && (
                      <button 
                        onClick={() => handleStartEditMessage(i)}
                        className="msg-edit-btn"
                        title="Edit this prompt"
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                  <div className="message-content" style={m.role === 'user' && editingMessageIndex === i ? { width: '100%' } : undefined}>
                    {m.role === 'model' ? (
                      <p>{m.content.replace(/```tsx[\s\S]*?```/, '[Code generated. Click the "Code" tab on the right to view it.]')}</p>
                    ) : (
                      editingMessageIndex === i ? (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <textarea
                            value={editingMessageText}
                            onChange={e => setEditingMessageText(e.target.value)}
                            className="control-select"
                            style={{ width: '100%', minHeight: '60px', background: 'var(--bg-card)', border: '1px solid var(--border-focus)', color: 'var(--text-primary)', borderRadius: '6px', padding: '0.5rem', fontFamily: 'var(--font-sans)', fontSize: '0.9rem', resize: 'vertical', outline: 'none' }}
                          />
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setEditingMessageIndex(null)}
                              className="btn btn-outline"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleSaveEditedMessage(i, editingMessageText)}
                              className="btn"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', borderRadius: '4px' }}
                            >
                              Save & Re-generate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p>{m.content}</p>
                          {(m as any).image && (
                            <div className="message-image-container" style={{ marginTop: '0.6rem', maxWidth: '240px' }}>
                              <img 
                                src={(m as any).image} 
                                alt="Reference attachment" 
                                style={{ width: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)', display: 'block', cursor: 'zoom-in' }} 
                                onClick={() => window.open((m as any).image, '_blank')}
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
                        className="btn-action btn-xs"
                        onClick={handleRollback}
                        disabled={loading}
                        title="Rollback the last changes"
                      >
                        <Undo size={10} />
                        <span>Rollback</span>
                      </button>
                      <button
                        className="btn-action btn-xs"
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
                <div className="loading-pulse">
                  <Loader2 size={14} className="animate-spin" />
                  Generating Remotion code and rendering locally...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            
            <div className="chat-input-wrapper">
              {/* Image Preview Thumbnail */}
              {selectedImage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                  <div style={{ position: 'relative', width: '48px', height: '48px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={selectedImage} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

              <textarea 
                className="chat-input-textarea"
                placeholder={activeProjectId ? "Describe the video you want to generate..." : "Select or create a project to start"}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={!activeProjectId || loading}
                rows={2}
              />
              
              <div className="chat-input-controls">
                <div className="controls-left">
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
                    disabled={!activeProjectId || loading}
                    className="control-select"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.35rem 0.5rem' }}
                    title="Upload reference image"
                  >
                    <Image size={14} />
                  </button>

                  {/* Model Select */}
                  <select
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    disabled={!activeProjectId || loading}
                    className="control-select"
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
                    disabled={!activeProjectId || loading}
                    className="control-select"
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
                      disabled={!activeProjectId || loading}
                      className="control-select"
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
                        className="custom-duration-input"
                        placeholder="sec"
                        min={1}
                        max={30}
                        value={customDuration}
                        onChange={e => setCustomDuration(e.target.value)}
                        disabled={!activeProjectId || loading}
                      />
                    )}
                  </div>

                  {/* Resolution Select */}
                  <select
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    disabled={!activeProjectId || loading}
                    className="control-select"
                    title="Video Resolution"
                  >
                    <option value="720p">720p</option>
                    <option value="1080p">1080p</option>
                  </select>
                </div>

                <button 
                  className="btn"
                  onClick={handleSend}
                  disabled={!activeProjectId || loading || !input.trim()}
                >
                  {loading ? 'Generating...' : 'Send'}
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel: Tabs for Preview & Code */}
          <div className="video-section">
            <div className="tabs-header">
              <button 
                className={`tab-btn ${!showCode ? 'active' : ''}`}
                onClick={() => setShowCode(false)}
              >
                <Play size={12} /> Preview
              </button>
              <button 
                className={`tab-btn ${showCode ? 'active' : ''}`}
                onClick={() => setShowCode(true)}
              >
                <Code2 size={12} /> Code
              </button>
            </div>

            {showCode ? (
              <div className="code-viewer-container">
                <div className="code-toolbar">
                  <span className="code-filename">video.tsx</span>
                  {code && (
                    <button className="copy-btn" onClick={copyCode}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copied' : 'Copy Code'}
                    </button>
                  )}
                </div>
                <pre className="code-pre">
                  <code>{code || '// No code generated yet. Prompt the AI.'}</code>
                </pre>
              </div>
            ) : (
              <div className="video-container">
                {videoUrl ? (
                  <div className="video-viewport">
                    <video ref={videoRef} controls src={videoUrl} autoPlay loop playsInline />
                  </div>
                ) : (
                  <div className="video-placeholder">
                    <Play size={32} style={{ opacity: 0.3 }} />
                    <p>No video generated yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showApiKeyModal && (
        <div className="modal-backdrop">
          <div className="modal-content-card">
            <h3>Gemini API Key</h3>
            <p>Enter your Google Gemini API Key to enable video generation.</p>
            
            <div className="api-key-input-container">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="AIzaSy..."
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
                className="control-select text-input"
              />
              <button 
                type="button" 
                className="eye-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide API Key" : "Show API Key"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowApiKeyModal(false)}>
                Cancel
              </button>
              <button className="btn" onClick={() => { handleSaveApiKey(tempApiKey); setShowApiKeyModal(false); }}>
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
