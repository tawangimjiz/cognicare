'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GAMES, parseGameMessage } from '@cognicare/shared';
import type { AccessibilitySettings, EndSessionBody, GameSlug, HostToGame, SessionDto, StartSessionResponse } from '@cognicare/shared';
import ComingSoon from './ComingSoon';

export interface GameEmbedProps {
  gameId: GameSlug | 'mock';
  settings: AccessibilitySettings;
  onStart(tier: 1 | 2 | 3): Promise<StartSessionResponse>;
  onEnd(sessionId: string, body: EndSessionBody): Promise<SessionDto>;
  onExit(): void;
  fallback?: ReactNode;
}

// The mock page speaks as gameId 'spot' (parseGameMessage only accepts real slugs).
const bridgeId = (id: GameEmbedProps['gameId']): GameSlug => (id === 'mock' ? 'spot' : id);

export default function GameEmbed({ gameId, settings, onStart, onEnd, onExit, fallback }: GameEmbedProps) {
  const [state, setState] = useState<'checking' | 'ready' | 'missing'>('checking');
  const frame = useRef<HTMLIFrameElement>(null);
  const sessionId = useRef<string | null>(null);
  // Keep latest props without re-subscribing the message listener.
  const latest = useRef({ settings, onStart, onEnd, onExit });
  latest.current = { settings, onStart, onEnd, onExit };

  const src = `/games/${gameId}/index.html`;

  useEffect(() => {
    let alive = true;
    setState('checking');
    fetch(src, { method: 'HEAD' })
      .then((r) => alive && setState(r.ok ? 'ready' : 'missing'))
      .catch(() => alive && setState('missing'));
    return () => {
      alive = false;
    };
  }, [src]);

  const post = useCallback((msg: HostToGame) => {
    frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  useEffect(() => {
    if (state !== 'ready') return;
    const onMessage = async (e: MessageEvent) => {
      // Only our own iframe on our own origin.
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = parseGameMessage(e.data, bridgeId(gameId));
      if (!m) return;
      const h = latest.current;
      try {
        switch (m.type) {
          case 'ready':
            post({ v: 1, source: 'cognicare-host', type: 'init', settings: h.settings, locale: 'th' });
            break;
          case 'session:start': {
            const r = await h.onStart(m.tier);
            sessionId.current = r.sessionId;
            post({ v: 1, source: 'cognicare-host', type: 'session:started', sessionId: r.sessionId });
            break;
          }
          case 'session:event':
            break; // ponytail: events are not streamed; games send them again in session:end.result.events
          case 'session:end': {
            if (!sessionId.current) throw new Error('no active session');
            const session = await h.onEnd(sessionId.current, m.result);
            sessionId.current = null;
            post({ v: 1, source: 'cognicare-host', type: 'session:saved', session });
            break;
          }
          case 'exit':
            h.onExit();
            break;
        }
      } catch (err) {
        post({ v: 1, source: 'cognicare-host', type: 'error', message: err instanceof Error ? err.message : 'error' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [state, gameId, post]);

  if (state === 'checking') return <div className="muted" role="status">กำลังโหลดเกม...</div>;
  if (state === 'missing') {
    const name = GAMES.find((g) => g.id === gameId)?.name ?? gameId;
    return <>{fallback ?? <ComingSoon name={name} onBack={onExit} />}</>;
  }
  return (
    <iframe
      ref={frame}
      src={src}
      title={`เกม ${gameId}`}
      style={{ width: '100%', height: '75vh', border: 0 }}
      sandbox="allow-scripts allow-same-origin"
      allow="fullscreen; autoplay"
    />
  );
}
