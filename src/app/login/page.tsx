'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, Lock, Loader2 } from 'lucide-react';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Apply theme from localStorage before render
  useEffect(() => {
    const stored = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', stored ?? system);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push(params.get('from') || '/');
        router.refresh();
      } else {
        setError('Incorrect password');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '0 1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 18, padding: '36px 32px',
        boxShadow: '0 4px 32px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <BookOpen size={22} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>
            StoryVault
          </span>
        </div>

        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-2)' }}>
          Enter your password to continue.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Lock size={14} style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-3)', pointerEvents: 'none',
            }} />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px 10px 34px', fontSize: 14,
                background: 'var(--surface-2)', color: 'var(--text)',
                border: `1px solid ${error ? '#dc3030' : 'var(--border)'}`,
                borderRadius: 10, outline: 'none',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)'; }}
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 12, color: '#dc3030' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px', fontSize: 14, fontWeight: 600,
              background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 10, cursor: loading || !password ? 'default' : 'pointer',
              opacity: loading || !password ? 0.6 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {loading ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
