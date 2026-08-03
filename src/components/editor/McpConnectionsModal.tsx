'use client';

import { useEffect, useState } from 'react';
import { Pencil, PlugZap, Plus, Server, ShieldCheck, TestTube2, Trash2, X } from 'lucide-react';
import styles from '../../app/page.module.css';

type Transport = 'streamable-http' | 'sse' | 'stdio';
type ApprovalPolicy = 'always' | 'read-only';

export interface PublicMcpConnection {
  id: string;
  name: string;
  transport: Transport;
  enabled: boolean;
  approvalPolicy: ApprovalPolicy;
  url?: string;
  command?: string;
  args?: string[];
  headerNames: string[];
  envNames: string[];
}

interface FormState {
  id?: string;
  name: string;
  transport: Transport;
  url: string;
  command: string;
  args: string;
  secrets: string;
  approvalPolicy: ApprovalPolicy;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  transport: 'streamable-http',
  url: '',
  command: '',
  args: '',
  secrets: '{}',
  approvalPolicy: 'always',
  enabled: true,
};

function secretTemplate(connection: PublicMcpConnection): string {
  const names = connection.transport === 'stdio' ? connection.envNames : connection.headerNames;
  return JSON.stringify(Object.fromEntries(names.map(name => [name, ''])), null, 2);
}

function parseSecretMap(source: string): Record<string, string> {
  const parsed = JSON.parse(source || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(value => typeof value !== 'string')) {
    throw new Error('Headers/environment must be a JSON object of string values.');
  }
  return parsed as Record<string, string>;
}

export function McpConnectionsModal({
  onClose,
  onCountChange,
}: {
  onClose: () => void;
  onCountChange: (count: number) => void;
}) {
  const [connections, setConnections] = useState<PublicMcpConnection[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetch('/api/mcp-connections');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load MCP connections.');
    setConnections(data.connections || []);
    onCountChange((data.connections || []).filter((connection: PublicMcpConnection) => connection.enabled).length);
  };

  useEffect(() => {
    load().catch(cause => setError(cause.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setError('');
    setNotice('');
    setBusy('save');
    try {
      const secretMap = parseSecretMap(form.secrets);
      const payload = {
        name: form.name,
        transport: form.transport,
        approvalPolicy: form.approvalPolicy,
        enabled: form.enabled,
        ...(form.transport === 'stdio'
          ? { command: form.command, args: form.args.split(/\r?\n/).map(value => value.trim()).filter(Boolean), env: secretMap }
          : { url: form.url, headers: secretMap }),
      };
      const response = await fetch(form.id ? `/api/mcp-connections/${form.id}` : '/api/mcp-connections', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save connection.');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
      setNotice('Connection saved. Test it before asking the agent to use it.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save connection.');
    } finally {
      setBusy(null);
    }
  };

  const patchConnection = async (connection: PublicMcpConnection, payload: Record<string, unknown>) => {
    setBusy(connection.id);
    setError('');
    try {
      const response = await fetch(`/api/mcp-connections/${connection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update connection.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update connection.');
    } finally {
      setBusy(null);
    }
  };

  const probe = async (connection: PublicMcpConnection) => {
    setBusy(connection.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/mcp-connections/${connection.id}/probe`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connection test failed.');
      const names = (data.tools || []).slice(0, 5).map((tool: { name: string }) => tool.name).join(', ');
      setNotice(`${connection.name} connected: ${data.tools.length} tool${data.tools.length === 1 ? '' : 's'}${names ? ` — ${names}${data.tools.length > 5 ? ', …' : ''}` : ''}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connection test failed.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (connection: PublicMcpConnection) => {
    if (!confirm(`Delete MCP connection “${connection.name}”?`)) return;
    setBusy(connection.id);
    try {
      const response = await fetch(`/api/mcp-connections/${connection.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete connection.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete connection.');
    } finally {
      setBusy(null);
    }
  };

  const edit = (connection: PublicMcpConnection) => {
    setForm({
      id: connection.id,
      name: connection.name,
      transport: connection.transport,
      url: connection.url ?? '',
      command: connection.command ?? '',
      args: (connection.args ?? []).join('\n'),
      secrets: secretTemplate(connection),
      approvalPolicy: connection.approvalPolicy,
      enabled: connection.enabled,
    });
    setShowForm(true);
    setNotice('Secret values stay hidden. Leave existing keys blank to preserve their saved values.');
  };

  return (
    <div className={styles.modalBackdrop} role="presentation">
      <section className={`${styles.modalContentCard} ${styles.mcpModal}`} role="dialog" aria-modal="true" aria-labelledby="mcp-title">
        <header className={styles.mcpModalHeader}>
          <div>
            <div className={styles.mcpEyebrow}><PlugZap size={12} /> Agent tools</div>
            <h3 id="mcp-title">MCP connections</h3>
            <p>Connect remote or local tool servers. External actions always pause for approval.</p>
          </div>
          <button className={styles.mcpIconButton} onClick={onClose} aria-label="Close MCP settings"><X size={16} /></button>
        </header>

        <div className={styles.mcpSecurityNote}>
          <ShieldCheck size={16} />
          <span>MCP servers can access data or run actions. Add only servers you trust. Stdio commands run locally.</span>
        </div>

        {error && <div className={styles.mcpError}>{error}</div>}
        {notice && <div className={styles.mcpNotice}>{notice}</div>}

        <div className={styles.mcpConnectionList}>
          {connections.length === 0 && !showForm && (
            <div className={styles.mcpEmpty}><Server size={22} /><span>No MCP servers connected.</span></div>
          )}
          {connections.map(connection => (
            <article className={styles.mcpConnectionCard} key={connection.id}>
              <div className={styles.mcpConnectionMain}>
                <div className={styles.mcpConnectionIcon}><Server size={15} /></div>
                <div className={styles.mcpConnectionCopy}>
                  <strong>{connection.name}</strong>
                  <span>{connection.transport === 'stdio' ? connection.command : connection.url}</span>
                  <small>{connection.approvalPolicy === 'read-only' ? 'Server-annotated read-only tools may auto-run' : 'Ask before every tool call'}</small>
                </div>
                <label className={styles.mcpSwitch} title={connection.enabled ? 'Disable connection' : 'Enable connection'}>
                  <input
                    type="checkbox"
                    checked={connection.enabled}
                    disabled={busy === connection.id}
                    onChange={() => patchConnection(connection, { enabled: !connection.enabled })}
                  />
                  <span />
                </label>
              </div>
              <div className={styles.mcpCardActions}>
                <button onClick={() => probe(connection)} disabled={busy === connection.id}><TestTube2 size={13} /> Test</button>
                <button onClick={() => edit(connection)} disabled={busy === connection.id}><Pencil size={13} /> Edit</button>
                <button onClick={() => remove(connection)} disabled={busy === connection.id} className={styles.mcpDanger}><Trash2 size={13} /> Delete</button>
              </div>
            </article>
          ))}
        </div>

        {showForm ? (
          <div className={styles.mcpForm}>
            <div className={styles.mcpFormGrid}>
              <label>Name<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Design assets" /></label>
              <label>Transport<select value={form.transport} onChange={event => setForm(current => ({ ...current, transport: event.target.value as Transport, secrets: '{}' }))}>
                <option value="streamable-http">Streamable HTTP</option>
                <option value="sse">SSE (legacy)</option>
                <option value="stdio">Local stdio</option>
              </select></label>
            </div>
            {form.transport === 'stdio' ? (
              <>
                <label>Command<input value={form.command} onChange={event => setForm(current => ({ ...current, command: event.target.value }))} placeholder="npx" /></label>
                <label>Arguments, one per line<textarea value={form.args} onChange={event => setForm(current => ({ ...current, args: event.target.value }))} placeholder={'-y\n@company/mcp-server'} /></label>
                <label>Environment JSON<textarea value={form.secrets} onChange={event => setForm(current => ({ ...current, secrets: event.target.value }))} placeholder={'{"API_KEY":"..."}'} /></label>
              </>
            ) : (
              <>
                <label>Server URL<input value={form.url} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} placeholder="https://example.com/mcp" /></label>
                <label>Headers JSON<textarea value={form.secrets} onChange={event => setForm(current => ({ ...current, secrets: event.target.value }))} placeholder={'{"Authorization":"Bearer ..."}'} /></label>
              </>
            )}
            <label>Approval policy<select value={form.approvalPolicy} onChange={event => setForm(current => ({ ...current, approvalPolicy: event.target.value as ApprovalPolicy }))}>
              <option value="always">Ask before every call</option>
              <option value="read-only">Auto-run server-annotated read-only tools</option>
            </select></label>
            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancel</button>
              <button className={styles.btn} onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save connection'}</button>
            </div>
          </div>
        ) : (
          <button className={`${styles.btn} ${styles.mcpAddButton}`} onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}><Plus size={14} /> Add MCP server</button>
        )}
      </section>
    </div>
  );
}
