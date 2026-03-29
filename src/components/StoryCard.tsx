'use client';

import { Story } from '@/types/story';
import { BookOpen, User } from 'lucide-react';

interface Props {
  story: Story;
  onClick?: () => void;
  compact?: boolean;
  active?: boolean;
}

export default function StoryCard({ story, onClick, compact = false, active = false }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: compact ? 10 : 14,
        padding: compact ? '10px 12px' : '16px 18px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        boxShadow: active ? `0 0 0 2px var(--accent)22` : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--accent)';
          e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <h3 style={{
        fontWeight: 600,
        fontSize: compact ? 13 : 15,
        color: 'var(--text)',
        lineHeight: 1.4,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        margin: 0,
      }}>
        {story.title}
      </h3>

      {!compact && (
        <p style={{
          color: 'var(--text-2)', fontSize: 13, marginTop: 6,
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {story.content}
        </p>
      )}

      <div style={{ marginTop: compact ? 6 : 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {story.bookTitle && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 500,
            color: 'var(--accent)', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 999,
            padding: '2px 8px',
          }}>
            <BookOpen size={10} /> {story.bookTitle}
          </span>
        )}
        {story.author && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 11, color: 'var(--text-3)',
          }}>
            <User size={10} /> {story.author}
          </span>
        )}
      </div>

      {story.topics.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {story.topics.slice(0, compact ? 2 : 4).map(t => (
            <span key={t} style={{
              fontSize: 11, color: 'var(--text-3)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 999, padding: '2px 8px',
            }}>
              {t}
            </span>
          ))}
          {story.topics.length > (compact ? 2 : 4) && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              +{story.topics.length - (compact ? 2 : 4)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
