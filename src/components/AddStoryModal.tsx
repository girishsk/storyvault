'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Plus, Loader2, Clipboard } from 'lucide-react';

interface Props {
  onClose: () => void;
  onAdded: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--surface-2)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 9,
  padding: '10px 13px', fontSize: 14, outline: 'none',
  transition: 'border 0.15s',
};

// Compress image client-side to stay under Vercel's 4.5MB body limit
async function compressImage(file: File, maxMB = 3.5): Promise<File> {
  if (file.size <= maxMB * 1024 * 1024) return file;
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    // If anything fails, fall back to the original file
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const MAX_DIM = 2000;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const r = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        const tryCompress = () => canvas.toBlob(blob => {
          if (!blob) { resolve(file); return; }
          if (blob.size <= maxMB * 1024 * 1024 || quality <= 0.4) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          } else { quality -= 0.1; tryCompress(); }
        }, 'image/jpeg', quality);
        tryCompress();
      } catch { resolve(file); }
    };
    img.src = url;
  });
}

async function parseError(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) {
    const body = await res.json().catch(() => ({}));
    return body.error || `Error ${res.status}`;
  }
  if (res.status === 413) return 'Image too large — try a smaller photo';
  return `Error ${res.status}: ${await res.text().catch(() => res.statusText)}`;
}

export default function AddStoryModal({ onClose, onAdded }: Props) {
  const [mode, setMode] = useState<'manual' | 'scan'>('manual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '', content: '', bookTitle: '', author: '',
  });

  // Global paste listener — works anywhere while modal is open
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    setMode('scan');
    setPastedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  }, []);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [handlePaste, previewUrl]);

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        (e.target.style.borderColor = 'var(--accent)'),
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        (e.target.style.borderColor = 'var(--border)'),
    };
  }

  function clearImage() {
    setPastedFile(null);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    if (fileRef.current) fileRef.current.value = '';
  }

  function getActiveFile(): File | null {
    return pastedFile ?? fileRef.current?.files?.[0] ?? null;
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.content) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await parseError(res));
      onAdded(); onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleScanSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = getActiveFile();
    if (!raw) return;
    setLoading(true); setError('');
    try {
      const file = await compressImage(raw);
      const formData = new FormData();
      formData.append('image', file);
      if (form.bookTitle.trim()) formData.append('bookTitle', form.bookTitle.trim());
      if (form.author.trim()) formData.append('author', form.author.trim());
      const res = await fetch('/api/scan', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await parseError(res));
      onAdded(); onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const hasImage = pastedFile !== null || (fileRef.current?.files?.length ?? 0) > 0;
  const displayName = pastedFile ? 'Pasted from clipboard' : fileRef.current?.files?.[0]?.name ?? '';

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
        borderRadius: 18, width: '100%', maxWidth: 500,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Add Story</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['manual', 'scan'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 500,
                background: 'none',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: `2px solid ${mode === m ? 'var(--accent)' : 'transparent'}`,
                color: mode === m ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {m === 'manual' ? 'Type manually' : 'Scan from image'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: 22 }}>
          {mode === 'manual' ? (
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input required placeholder="Story title *" style={inputStyle} {...field('title')} />
              <textarea
                required
                placeholder="Story content *"
                rows={5}
                style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
                {...field('content')}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input placeholder="Book title" style={inputStyle} {...field('bookTitle')} />
                <input placeholder="Author" style={inputStyle} {...field('author')} />
              </div>
              {error && <p style={{ margin: 0, fontSize: 13, color: '#dc3030' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 9, padding: '11px 0',
                  fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
                }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {loading ? 'Processing with Claude…' : 'Add Story'}
              </button>
              {loading && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                  Generating topics and diagram…
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={handleScanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Preview if image already loaded */}
              {previewUrl ? (
                <div style={{ position: 'relative' }}>
                  <img
                    src={previewUrl}
                    alt="Pasted image"
                    style={{
                      width: '100%', maxHeight: 220, objectFit: 'contain',
                      borderRadius: 12, border: '1px solid var(--border)',
                      background: 'var(--surface-2)', display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.55)', color: '#fff',
                      border: 'none', borderRadius: 999,
                      width: 26, height: 26, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <X size={13} />
                  </button>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                    <Clipboard size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    {displayName}
                  </p>
                </div>
              ) : (
                /* Drop zone — using <label> so iOS opens file picker reliably */
                <label
                  style={{
                    display: 'block',
                    border: `2px dashed ${hasImage ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 14, padding: '32px 20px',
                    textAlign: 'center', cursor: 'pointer',
                    background: hasImage ? 'var(--surface-2)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = hasImage ? 'var(--accent)' : 'var(--border)')}
                >
                  <Upload style={{ margin: '0 auto 10px', display: 'block', color: 'var(--text-3)' }} size={26} />
                  <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-2)' }}>
                    {displayName || 'Tap to choose a photo'}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                    JPG, PNG, HEIC — or press <kbd style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)',
                      borderRadius: 4, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace',
                    }}>⌘V</kbd> to paste
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,image/heic,image/heif"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setPastedFile(null);
                        setPreviewUrl(URL.createObjectURL(f));
                      }
                    }}
                  />
                </label>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  placeholder="Book title (optional)"
                  style={inputStyle}
                  {...field('bookTitle')}
                />
                <input
                  placeholder="Author (optional)"
                  style={inputStyle}
                  {...field('author')}
                />
              </div>
              <p style={{ margin: '-4px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
                Leave blank to let Claude detect from the image
              </p>

              {error && <p style={{ margin: 0, fontSize: 13, color: '#dc3030' }}>{error}</p>}
              <button
                type="submit"
                disabled={loading || !previewUrl}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 9, padding: '11px 0',
                  fontSize: 14, fontWeight: 600,
                  cursor: (loading || !previewUrl) ? 'default' : 'pointer',
                  opacity: (loading || !previewUrl) ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {loading ? 'Scanning with Claude…' : 'Scan & Extract Story'}
              </button>
              {loading && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
                  Claude is reading the image and generating topics & diagram…
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
