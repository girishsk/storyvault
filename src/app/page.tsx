'use client';

import { useEffect, useState, useCallback } from 'react';
import { Story } from '@/types/story';
import StoryCard from '@/components/StoryCard';
import StoryViewer from '@/components/StoryViewer';
import AddStoryModal from '@/components/AddStoryModal';
import { Plus, Shuffle, RefreshCw, Network, BookOpen, Loader2, Moon, Sun, Settings, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import SettingsModal from '@/components/SettingsModal';

const StoryGraph = dynamic(() => import('@/components/StoryGraph'), { ssr: false });

type Tab = 'stories' | 'graph';

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const initial = stored ?? system;
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  return { theme, toggle };
}

export default function Home() {
  const [stories, setStories] = useState<Story[]>([]);
  const [selected, setSelected] = useState<Story | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<Tab>('stories');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const { theme, toggle } = useTheme();
  const router = useRouter();

  async function signOut() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  }

  const loadStories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stories');
      const data = await res.json();
      setStories(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStories(); }, [loadStories]);

  async function getRandomStory() {
    const res = await fetch('/api/stories/random');
    if (res.ok) {
      const story = await res.json();
      setSelected(story);
      setTab('stories');
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      await fetch('/api/analyze', { method: 'POST' });
      await loadStories();
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSync() {
    // Check if Sheets is configured before attempting
    const cfg = await fetch('/api/settings').then(r => r.json()).catch(() => ({}));
    if (!cfg.status?.SPREADSHEET_ID) {
      setShowSettings(true);
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'bidirectional' }),
      });
      const data = await res.json();
      if (data.success) {
        await loadStories();
      }
    } finally {
      setSyncing(false);
    }
  }

  const filtered = stories.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      s.bookTitle.toLowerCase().includes(q) ||
      s.topics.some(t => t.toLowerCase().includes(q));
    const matchTopic = !topicFilter || s.topics.some(t => t.toLowerCase() === topicFilter.toLowerCase());
    return matchSearch && matchTopic;
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '12px 0' }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BookOpen style={{ color: 'var(--accent)' }} size={22} />
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                StoryVault
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600,
                background: 'var(--surface-2)', color: 'var(--text-2)',
                border: '1px solid var(--border)',
                padding: '2px 8px', borderRadius: 999,
              }}>
                {stories.length} stories
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <HeaderButton onClick={getRandomStory} icon={<Shuffle size={14} />} label="Remind me" />
              <HeaderButton onClick={runAnalysis} disabled={analyzing} icon={analyzing ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />} label="Link stories" />
              <HeaderButton onClick={handleSync} disabled={syncing} icon={syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} label="Sync Sheets" />
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, fontWeight: 600,
                  background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '7px 13px',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <Plus size={14} /> Add Story
              </button>
              <button
                onClick={() => setShowSettings(true)}
                title="Settings"
                style={{
                  display: 'flex', alignItems: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '7px 9px', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <Settings size={15} />
              </button>
              <button
                onClick={toggle}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                style={{
                  display: 'flex', alignItems: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 8,
                  padding: '7px 9px', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              {process.env.NEXT_PUBLIC_AUTH_ENABLED === '1' && (
                <button
                  onClick={signOut}
                  title="Sign out"
                  style={{
                    display: 'flex', alignItems: 'center',
                    background: 'var(--surface-2)', color: 'var(--text-2)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '7px 9px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <LogOut size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 1rem' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {(['stories', 'graph'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 20px', fontSize: 14, fontWeight: 500,
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-3)',
                background: 'none',
                marginBottom: -1, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t === 'stories' ? 'Stories' : 'Story Graph'}
            </button>
          ))}
        </div>

        {tab === 'stories' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {selected && (
              <StoryViewer
                story={selected}
                onClose={() => setSelected(null)}
                onDeleted={() => { setSelected(null); loadStories(); }}
                onStorySelect={s => setSelected(s)}
                onTopicClick={t => setTopicFilter(prev => prev === t ? '' : t)}
              />
            )}

            {/* Search + active topic filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
                <input
                  placeholder="Search stories, books, topics..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    border: '1px solid var(--border)', borderRadius: 10,
                    padding: '10px 14px', fontSize: 14,
                    background: 'var(--surface)', color: 'var(--text)',
                    outline: 'none', transition: 'border 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
              {topicFilter && (
                <button
                  onClick={() => setTopicFilter('')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 999, padding: '6px 12px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {topicFilter} ×
                </button>
              )}
              {loading && <Loader2 size={18} style={{ color: 'var(--text-3)', animation: 'spin 1s linear infinite' }} />}
            </div>

            {filtered.length === 0 && !loading ? (
              <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-3)' }}>
                <BookOpen size={48} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }} />
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-2)' }}>No stories yet</p>
                <p style={{ fontSize: 13, marginTop: 4 }}>Add your first story or scan a book page to get started</p>
                <button
                  onClick={() => setShowAdd(true)}
                  style={{
                    marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '10px 18px',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Add your first story
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}>
                {filtered.map(story => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    onClick={() => setSelected(story)}
                    active={selected?.id === story.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'graph' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Visual network of stories connected by shared topics. Click a node to view the story.
            </p>
            <StoryGraph onNodeClick={(id) => {
              const s = stories.find(x => x.id === id);
              if (s) { setSelected(s); setTab('stories'); }
            }} />
          </div>
        )}
      </main>

      {showAdd && (
        <AddStoryModal
          onClose={() => setShowAdd(false)}
          onAdded={loadStories}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function HeaderButton({ onClick, icon, label, disabled }: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 13, fontWeight: 500,
        background: 'var(--surface-2)', color: 'var(--text-2)',
        border: '1px solid var(--border)', borderRadius: 8,
        padding: '7px 12px', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, transition: 'all 0.15s',
      }}
    >
      {icon} {label}
    </button>
  );
}
