import type { RefObject } from 'react';
import { ChevronLeft, ChevronRight, Key, Plus, Trash2, Video } from 'lucide-react';
import styles from '../../app/page.module.css';
import type { Project } from './editor-utils';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  collapsed: boolean;
  renamingProjectId: string | null;
  renameValue: string;
  renameInputRef: RefObject<HTMLInputElement | null>;
  hasApiKey: boolean;
  onCreate: () => void;
  onSelect: (projectId: string) => void;
  onBeginRename: (project: Project) => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: (projectId: string, name: string) => void;
  onCancelRename: () => void;
  onDelete: (projectId: string) => void;
  onOpenSettings: () => void;
  onToggle: () => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  collapsed,
  renamingProjectId,
  renameValue,
  renameInputRef,
  hasApiKey,
  onCreate,
  onSelect,
  onBeginRename,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onDelete,
  onOpenSettings,
  onToggle,
}: ProjectSidebarProps) {
  return (
    <>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.sidebarContent}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onCreate} style={{ width: '100%' }}>
            <Plus size={14} /> New Project
          </button>

          <div className={styles.sidebarSection}>
            <div className={styles.sidebarSectionTitle}>Projects</div>
            <div className={styles.projectList}>
              {projects.length === 0 ? (
                <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  No projects yet.
                </div>
              ) : projects.map((project) => (
                <div
                  key={project.id}
                  className={`${styles.projectItem} ${activeProjectId === project.id ? styles.active : ''}`}
                  onClick={() => { if (renamingProjectId !== project.id) onSelect(project.id); }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onBeginRename(project);
                  }}
                  style={{ position: 'relative' }}
                >
                  <Video size={14} className={styles.projectIcon} style={{ flexShrink: 0 }} />
                  {renamingProjectId === project.id ? (
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(event) => onRenameValueChange(event.target.value)}
                      onBlur={() => onCommitRename(project.id, renameValue)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') onCommitRename(project.id, renameValue);
                        if (event.key === 'Escape') onCancelRename();
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className={styles.projectRenameInput}
                      autoFocus
                    />
                  ) : (
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                      {project.name}
                    </span>
                  )}
                  <button
                    className={styles.projectDeleteBtn}
                    title="Delete project"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(project.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sidebar-footer" style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <button
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={onOpenSettings}
            style={{ width: '100%', fontSize: '0.8rem', gap: '0.4rem', padding: '0.4rem' }}
            title="Configure Gemini API Key"
          >
            <Key size={14} />
            <span>{hasApiKey ? '✓ API Key Set' : 'Set API Key'}</span>
          </button>
        </div>
      </aside>

      <button
        className={`${styles.sidebarToggleBtn} ${collapsed ? styles.collapsed : ''}`}
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </>
  );
}
