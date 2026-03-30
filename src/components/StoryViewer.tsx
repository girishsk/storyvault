'use client';

import { useEffect, useState, useRef } from 'react';
import { Story } from '@/types/story';
import MermaidDiagram from './MermaidDiagram';
import DiagramViewer from './DiagramViewer';
import StoryCard from './StoryCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RefreshCw, X, Loader2, BookOpen, FileText, GitBranch, Link2, Sparkles, Maximize2, Pencil, Check, Trash2, Expand } from 'lucide-react';
import ImageViewer from './ImageViewer';

interface RelatedEntry {
  story: Story;
  sharedTopics: string[];
  score: number;
}

interface DiagramEntry {
  type: string;
  label: string;
  code: string;
}

type Tab = 'story' | 'mindmap' | 'related';

interface Props {
  story: Story;
  onClose?: () => void;
  onDeleted?: () => void;
  onStorySelect?: (story: Story) => void;
  onTopicClick?: (topic: string) => void;
}

export default function StoryViewer({ story, onClose, onDeleted, onStorySelect, onTopicClick }: Props) {
  const [tab, setTab] = useState<Tab>('story');
  const [related, setRelated] = useState<RelatedEntry[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [diagrams, setDiagrams] = useState<DiagramEntry[]>([]);
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);
  const [loadingDiagram, setLoadingDiagram] = useState(false);
  const [fullscreen, setFullscreen] = useState<DiagramEntry | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ bookTitle: '', author: '' });
  const [savingMeta, setSavingMeta] = useState(false);
  const [currentStory, setCurrentStory] = useState(story);
  const [topicStories, setTopicStories] = useState<{ topic: string; stories: Story[] } | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imgHovered, setImgHovered] = useState(false);
  const thumbContainerRef = useRef<HTMLDivElement>(null);
  const [thumbW, setThumbW] = useState(0);

  useEffect(() => {
    const el = thumbContainerRef.current;
    if (!el) return;
    setThumbW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setThumbW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentStory.sourceImagePath]);

  useEffect(() => {
    setCurrentStory(story);
    setTab('story');
    setTopicStories(null);
    setDiagrams([]);
    setLoadingRelated(true);
    fetch(`/api/stories/${story.id}/related`)
      .then(r => r.json())
      .then(data => setRelated(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingRelated(false));
  }, [story.id]);

  // Lazy-load diagrams when mindmap tab is opened
  useEffect(() => {
    if (tab !== 'mindmap' || diagrams.length > 0 || loadingDiagrams) return;
    setLoadingDiagrams(true);
    fetch(`/api/stories/${currentStory.id}/diagrams`)
      .then(r => r.json())
      .then(data => setDiagrams(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingDiagrams(false));
  }, [tab, currentStory.id, diagrams.length, loadingDiagrams]);

  function startEditMeta() {
    setMetaForm({ bookTitle: currentStory.bookTitle, author: currentStory.author });
    setEditingMeta(true);
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      const res = await fetch(`/api/stories/${currentStory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookTitle: metaForm.bookTitle, author: metaForm.author }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentStory(updated);
      }
    } finally {
      setSavingMeta(false);
      setEditingMeta(false);
    }
  }

  async function regenerateDiagrams() {
    setLoadingDiagram(true);
    setDiagrams([]);
    try {
      const res = await fetch(`/api/stories/${currentStory.id}/diagrams`, { method: 'POST' });
      const data = await res.json();
      setDiagrams(Array.isArray(data) ? data : []);
    } finally {
      setLoadingDiagram(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await fetch(`/api/stories/${currentStory.id}`, { method: 'DELETE' });
      onDeleted?.();
      onClose?.();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function saveImageRotation(rotation: number) {
    const res = await fetch(`/api/stories/${currentStory.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceImageRotation: rotation }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCurrentStory(updated);
    }
  }

  function imageUrl(path: string | null): string | null {
    if (!path) return null;
    // Proxy private Vercel Blob URLs through the server
    if (path.startsWith('https://') && path.includes('blob.vercel-storage.com')) {
      return `/api/blob-proxy?url=${encodeURIComponent(path)}`;
    }
    return path;
  }

  async function handleTopicClick(topic: string) {
    if (topicStories?.topic === topic) {
      setTopicStories(null);
      onTopicClick?.('');
      return;
    }
    setLoadingTopic(true);
    onTopicClick?.(topic);
    try {
      const res = await fetch(`/api/stories?topic=${encodeURIComponent(topic)}`);
      const data: Story[] = await res.json();
      setTopicStories({ topic, stories: data.filter(s => s.id !== currentStory.id) });
    } finally {
      setLoadingTopic(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'story', label: 'Story', icon: <FileText size={13} /> },
    { id: 'mindmap', label: 'Mindmap', icon: <GitBranch size={13} /> },
    { id: 'related', label: `Related${related.length ? ` (${related.length})` : ''}`, icon: <Link2 size={13} /> },
  ];

  return (
    <>
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 18,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--surface) 60%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              margin: 0, fontSize: 20, fontWeight: 700,
              color: 'var(--text)', lineHeight: 1.3,
            }}>
              {currentStory.title}
            </h2>
            {editingMeta ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <BookOpen size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <input
                  autoFocus
                  placeholder="Book title"
                  value={metaForm.bookTitle}
                  onChange={e => setMetaForm(f => ({ ...f, bookTitle: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') setEditingMeta(false); }}
                  style={{
                    fontSize: 13, color: 'var(--text)',
                    background: 'var(--surface-2)', border: '1px solid var(--accent)',
                    borderRadius: 6, padding: '3px 8px', outline: 'none',
                    width: 160,
                  }}
                />
                <input
                  placeholder="Author"
                  value={metaForm.author}
                  onChange={e => setMetaForm(f => ({ ...f, author: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveMeta(); if (e.key === 'Escape') setEditingMeta(false); }}
                  style={{
                    fontSize: 13, color: 'var(--text)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '3px 8px', outline: 'none',
                    width: 130,
                  }}
                />
                <button
                  onClick={saveMeta}
                  disabled={savingMeta}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 6, padding: '4px 10px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {savingMeta ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Save
                </button>
                <button
                  onClick={() => setEditingMeta(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, padding: '4px 6px' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                <BookOpen size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                {currentStory.bookTitle ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentStory.bookTitle}
                    {currentStory.author && <span style={{ color: 'var(--text-3)' }}> · {currentStory.author}</span>}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>No book or author</p>
                )}
                <button
                  onClick={startEditMeta}
                  title="Edit book & author"
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: '2px 4px', borderRadius: 4,
                    transition: 'color 0.15s', flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {confirmDelete ? (
              <>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: '#dc3030', color: '#fff',
                    border: 'none', borderRadius: 8,
                    padding: '6px 12px', fontSize: 12, fontWeight: 600,
                    cursor: deleting ? 'default' : 'pointer',
                  }}
                >
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: 'var(--surface-2)', color: 'var(--text-3)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete story"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-3)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  width: 32, height: 32, cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc3030'; e.currentTarget.style.borderColor = '#dc3030'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <Trash2 size={14} />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-3)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  width: 32, height: 32, cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-3)'; }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Topic badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {currentStory.topics.map(t => {
            const active = topicStories?.topic === t;
            return (
              <button
                key={t}
                onClick={() => handleTopicClick(t)}
                style={{
                  fontSize: 12, fontWeight: 500,
                  padding: '4px 11px', borderRadius: 999,
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  color: active ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; } }}
              >
                {t}{active ? ' ×' : ''}
              </button>
            );
          })}
        </div>

        {/* Topic expansion panel */}
        {(topicStories || loadingTopic) && (
          <div style={{
            marginTop: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: '12px 14px',
          }}>
            {loadingTopic ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)' }}>
                <Loader2 size={14} className="animate-spin" /> Finding stories with this topic…
              </div>
            ) : topicStories && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Stories about "{topicStories.topic}"
                </p>
                {topicStories.stories.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>No other stories with this topic yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {topicStories.stories.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { onStorySelect?.(s); setTopicStories(null); }}
                        style={{
                          textAlign: 'left',
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderRadius: 9, padding: '8px 12px',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                        {s.bookTitle && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--accent)' }}>{s.bookTitle}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex',
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '11px 20px', fontSize: 13, fontWeight: 500,
              background: tab === t.id ? 'var(--surface)' : 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ padding: '24px' }}>
        {tab === 'story' && (
          <div>
            {imageUrl(currentStory.sourceImagePath) && (() => {
              // Parse as number — Neon may return rotation as a string
              const rot = parseInt(String(currentStory.sourceImageRotation ?? 0), 10);
              const transposed = rot === 90 || rot === 270;
              // Visual height for the thumbnail when rotated (width becomes the visual width after rotation)
              const THUMB_VIS_H = 200;
              return (
                <div
                  ref={thumbContainerRef}
                  onClick={() => setShowImageViewer(true)}
                  onMouseEnter={() => setImgHovered(true)}
                  onMouseLeave={() => setImgHovered(false)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                    marginBottom: 20,
                    cursor: 'pointer',
                    background: 'var(--surface-2)',
                    ...(transposed ? { height: THUMB_VIS_H } : { maxHeight: 280 }),
                  }}
                >
                  <img
                    src={imageUrl(currentStory.sourceImagePath)!}
                    alt="Source"
                    style={transposed ? {
                      // For 90°/270°: CSS dimensions are swapped so after rotation:
                      //   visual width  = CSS height = thumbW (= container width) ✓
                      //   visual height = CSS width  = THUMB_VIS_H               ✓
                      // Centering via absolute + translate so image fills the container exactly.
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: THUMB_VIS_H,
                      height: thumbW || '100%',
                      objectFit: 'cover',
                      transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    } : {
                      display: 'block',
                      width: '100%',
                      maxHeight: 280,
                      objectFit: 'cover',
                    }}
                  />
                  {/* Hover overlay */}
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: imgHovered ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0)',
                    transition: 'background 0.2s',
                    pointerEvents: 'none',
                  }}>
                    <Expand size={28} style={{
                      color: '#fff',
                      opacity: imgHovered ? 1 : 0,
                      transition: 'opacity 0.2s',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                    }} />
                  </div>
                </div>
              );
            })()}
            <div className="story-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {currentStory.content}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {tab === 'mindmap' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
                Claude selects the most insightful diagram types for this story
              </p>
              <button
                onClick={regenerateDiagrams}
                disabled={loadingDiagram || loadingDiagrams}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--text-2)',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: '5px 11px',
                  cursor: (loadingDiagram || loadingDiagrams) ? 'default' : 'pointer',
                  opacity: (loadingDiagram || loadingDiagrams) ? 0.6 : 1, transition: 'all 0.15s',
                }}
              >
                {(loadingDiagram || loadingDiagrams)
                  ? <Loader2 size={12} className="animate-spin" />
                  : <RefreshCw size={12} />}
                Regenerate
              </button>
            </div>

            {loadingDiagrams ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 10, padding: '48px 0', color: 'var(--text-3)',
              }}>
                <Sparkles size={28} style={{ opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: 13 }}>Claude is selecting the best diagrams…</p>
                <p style={{ margin: 0, fontSize: 11 }}>This may take a few seconds</p>
              </div>
            ) : diagrams.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 8, padding: '40px 0', color: 'var(--text-3)',
              }}>
                <GitBranch size={28} style={{ opacity: 0.3 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>No diagrams yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {diagrams.map((d) => (
                  <div key={d.type}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: 'var(--accent)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 6, padding: '3px 9px',
                      }}>
                        {d.label}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.type}</span>
                      <button
                        onClick={() => setFullscreen(d)}
                        title="Full screen"
                        style={{
                          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                          fontSize: 11, color: 'var(--text-3)',
                          background: 'var(--surface-2)', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '3px 9px', cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        <Maximize2 size={11} /> Full screen
                      </button>
                    </div>
                    <MermaidDiagram code={d.code} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'related' && (
          <div>
            {loadingRelated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-3)', padding: '16px 0' }}>
                <Loader2 size={16} className="animate-spin" /> Finding related stories…
              </div>
            ) : related.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
                <Link2 size={32} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>No related stories yet.</p>
                <p style={{ margin: '4px 0 0', fontSize: 12 }}>Add more stories and run "Link stories" to connect them.</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}>
                {related.map(({ story: s, sharedTopics }) => (
                  <div key={s.id}>
                    <StoryCard story={s} compact onClick={() => onStorySelect?.(s)} />
                    {sharedTopics.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5, paddingLeft: 2 }}>
                        {sharedTopics.slice(0, 3).map(t => (
                          <span key={t} style={{
                            fontSize: 10, color: 'var(--accent)',
                            background: 'var(--surface-2)',
                            border: '1px solid var(--border)',
                            borderRadius: 999, padding: '1px 7px',
                          }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {fullscreen && (
      <DiagramViewer
        code={fullscreen.code}
        label={fullscreen.label}
        type={fullscreen.type}
        onClose={() => setFullscreen(null)}
      />
    )}

    {showImageViewer && imageUrl(currentStory.sourceImagePath) && (
      <ImageViewer
        src={imageUrl(currentStory.sourceImagePath)!}
        initialRotation={currentStory.sourceImageRotation ?? 0}
        onClose={() => setShowImageViewer(false)}
        onSaveRotation={saveImageRotation}
      />
    )}
  </>
  );
}
