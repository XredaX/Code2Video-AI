import { Eye, EyeOff } from 'lucide-react';
import styles from '../../app/page.module.css';

interface ApiKeyModalProps {
  apiKey: string;
  showPassword: boolean;
  onApiKeyChange: (value: string) => void;
  onTogglePassword: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function ApiKeyModal({
  apiKey,
  showPassword,
  onApiKeyChange,
  onTogglePassword,
  onCancel,
  onSave,
}: ApiKeyModalProps) {
  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContentCard}>
        <h3>Gemini API Key</h3>
        <p>Enter your Google Gemini API Key to enable video generation.</p>

        <div className={styles.apiKeyInputContainer}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="AIzaSy..."
            value={apiKey}
            onChange={(event) => onApiKeyChange(event.target.value)}
            className={`${styles.controlSelect} text-input`}
          />
          <button
            type="button"
            className={styles.eyeToggleBtn}
            onClick={onTogglePassword}
            title={showPassword ? 'Hide API Key' : 'Show API Key'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <div className={styles.modalActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={onCancel}>Cancel</button>
          <button className={styles.btn} onClick={onSave}>Save Key</button>
        </div>
      </div>
    </div>
  );
}
