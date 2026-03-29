'use client';

import { useEffect, useState } from 'react';
import { X, Key, Sheet, Eye, EyeOff, CheckCircle, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 9,
  padding: '10px 13px', fontSize: 13, outline: 'none',
  fontFamily: 'monospace', transition: 'border 0.15s',
};

function focusAccent(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'var(--accent)';
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = 'var(--border)';
}

export default function SettingsModal({ onClose }: Props) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [googleCreds, setGoogleCreds] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasGoogleCreds, setHasGoogleCreds] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setHasAnthropicKey(data.hasAnthropicKey);
        setHasGoogleCreds(data.hasGoogleCreds);
        setSpreadsheetId(data.SPREADSHEET_ID || '');
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const body: Record<string, string> = {};
      if (anthropicKey.trim()) body.ANTHROPIC_API_KEY = anthropicKey.trim();
      if (spreadsheetId.trim()) body.SPREADSHEET_ID = spreadsheetId.trim();
      if (googleCreds.trim()) body.GOOGLE_CREDENTIALS_JSON = googleCreds.trim();

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      if (anthropicKey.trim()) setHasAnthropicKey(true);
      if (googleCreds.trim()) setHasGoogleCreds(true);
      setAnthropicKey('');
      setGoogleCreds('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18, width: '100%', maxWidth: 520,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Anthropic */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Key size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Anthropic API Key</span>
              {hasAnthropicKey && (
                <span style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--forest, #1a4a2a)',
                  background: '#e8f5e9', border: '1px solid #a5d6a7',
                  borderRadius: 999, padding: '2px 8px',
                }}>
                  <CheckCircle size={11} /> Configured
                </span>
              )}
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-3)' }}>
              Used for extracting stories, generating diagrams, and linking topics.
              Get yours at <span style={{ color: 'var(--accent)' }}>console.anthropic.com</span>
            </p>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={hasAnthropicKey ? '••••••••• (leave blank to keep current)' : 'sk-ant-…'}
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                onFocus={focusAccent} onBlur={blurBorder}
                style={{ ...inputStyle, paddingRight: 40 }}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey(v => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                  display: 'flex',
                }}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </section>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Google Sheets */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Sheet size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Google Sheets Sync</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>Optional</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-2)', display: 'block', marginBottom: 5 }}>
                  Spreadsheet ID
                </label>
                <input
                  type="text"
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value)}
                  onFocus={focusAccent} onBlur={blurBorder}
                  style={inputStyle}
                  spellCheck={false}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                  The long ID in your Google Sheets URL: docs.google.com/spreadsheets/d/<strong>ID</strong>/edit
                </p>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-2)' }}>
                    Service Account JSON
                  </label>
                  {hasGoogleCreds && (
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: 'var(--forest, #1a4a2a)',
                      background: '#e8f5e9', border: '1px solid #a5d6a7',
                      borderRadius: 999, padding: '1px 7px',
                    }}>
                      <CheckCircle size={10} /> Configured
                    </span>
                  )}
                </div>
                <textarea
                  placeholder={hasGoogleCreds ? '{ … } (leave blank to keep current)' : '{ "type": "service_account", … }'}
                  value={googleCreds}
                  onChange={e => setGoogleCreds(e.target.value)}
                  onFocus={focusAccent} onBlur={blurBorder}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }}
                  spellCheck={false}
                />
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                  Paste the full JSON from your Google Cloud service account credentials file.
                </p>
              </div>
            </div>
          </section>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--accent-2)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: saved ? '#1a4a2a' : 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 9, padding: '11px 0',
              fontSize: 14, fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              opacity: saving ? 0.7 : 1, transition: 'all 0.2s',
            }}
          >
            {saving
              ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
              : saved
              ? <><CheckCircle size={16} /> Saved</>
              : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
