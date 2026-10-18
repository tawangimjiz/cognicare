'use client';

import { useRouter } from 'next/navigation';
import { DOMAINS, GAMES } from '@cognicare/shared';
import { Icon } from '../../../components/Icon';

// Not-ready games still route to /patient/games/<id>, where GameEmbed shows ComingSoon.
export default function GameHub() {
  const router = useRouter();
  return (
    <>
      <div className="h1">เล่นเกม</div>
      <div className="game-grid">
        {GAMES.map((g) => {
          const d = DOMAINS[g.domainIdx];
          return (
            <div className="card game-card" key={g.id}>
              <div className="game-icon"><Icon name={g.icon} size={24} /></div>
              <div className="h2">{g.name}</div>
              <div className="domain-chip"><Icon name={d.icon} size={14} /> {d.th}</div>
              <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => router.push(`/patient/games/${g.id}`)}>เล่นเลย</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
