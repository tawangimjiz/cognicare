'use client';

import { use } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { GAMES } from '@cognicare/shared';
import type { AccessibilitySettings, GameSlug } from '@cognicare/shared';
import GameEmbed from '../../../../components/GameEmbed';
import SpotDemo from '../../../../components/patient/SpotDemo';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';

const DEFAULTS: AccessibilitySettings = { notif: true, sound: true, largeText: false };

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const isMock = id === 'mock' && process.env.NODE_ENV !== 'production';
  if (!isMock && !GAMES.some((g) => g.id === id)) notFound();
  const gameId = id as GameSlug | 'mock';
  const slug: GameSlug = gameId === 'mock' ? 'spot' : gameId;

  return (
    <GameEmbed
      gameId={gameId}
      settings={user?.settings ?? DEFAULTS}
      onStart={(tier) => api.startSession({ gameId: slug, tier })}
      onEnd={(sid, body) => api.endSession(sid, body)}
      onExit={() => router.push('/patient/games')}
      fallback={id === 'spot' ? <SpotDemo /> : undefined}
    />
  );
}
