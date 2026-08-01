import { RotateCcw, Undo } from 'lucide-react';
import styles from '../../app/page.module.css';
import type { Project } from './editor-utils';

interface WorkspaceHeaderProps {
  projects: Project[];
  activeProjectId: string | null;
  sidebarCollapsed: boolean;
  versionsCount: number;
  selectedVersionIndex: number | null;
  loading: boolean;
  hasHistory: boolean;
  onSelectVersion: (index: number | null) => void;
  onRevert: (index: number) => void;
  onRollback: () => void;
  onRetry: () => void;
}

export function WorkspaceHeader({
  projects,
  activeProjectId,
  sidebarCollapsed,
  versionsCount,
  selectedVersionIndex,
  loading,
  hasHistory,
  onSelectVersion,
  onRevert,
  onRollback,
  onRetry,
}: WorkspaceHeaderProps) {
  const projectName = activeProjectId
    ? projects.find((project) => project.id === activeProjectId)?.name
    : 'Workspace';

  return (
    <div className={styles.topBar}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        paddingLeft: sidebarCollapsed ? '1.5rem' : '0rem',
        transition: 'padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <h2>{projectName}</h2>
      </div>
      {activeProjectId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {versionsCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Version:</span>
              <select
                value={selectedVersionIndex ?? versionsCount - 1}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  onSelectVersion(index === versionsCount - 1 ? null : index);
                }}
                disabled={loading}
                className={styles.controlSelect}
                style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', height: 'auto', cursor: 'pointer' }}
              >
                {Array.from({ length: versionsCount }).map((_, index) => (
                  <option key={index} value={index}>
                    {`v${index + 1}${index === versionsCount - 1 ? ' (latest)' : ''}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          {hasHistory && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {selectedVersionIndex !== null && selectedVersionIndex < versionsCount - 1 ? (
                <button
                  className={styles.btnAction}
                  style={{ backgroundColor: 'var(--accent-primary)', color: '#fff', borderColor: 'transparent' }}
                  onClick={() => onRevert(selectedVersionIndex)}
                  disabled={loading}
                  title={`Make Version ${selectedVersionIndex + 1} the active current version`}
                >
                  <Undo size={12} />
                  <span>Revert to this version</span>
                </button>
              ) : (
                <>
                  <button className={styles.btnAction} onClick={onRollback} disabled={loading} title="Rollback the last changes">
                    <Undo size={12} />
                    <span>Rollback</span>
                  </button>
                  <button className={styles.btnAction} onClick={onRetry} disabled={loading} title="Re-generate the last prompt">
                    <RotateCcw size={12} />
                    <span>Retry</span>
                  </button>
                </>
              )}
            </div>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: loading ? '#f59e0b' : '#10b981', display: 'inline-block' }} />
            {loading ? 'Processing...' : 'Ready'}
          </span>
        </div>
      )}
    </div>
  );
}
