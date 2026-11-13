import { hallStations } from '@guild/shared';
import type { HallStation } from '@guild/shared';
import { useEffect, useState } from 'react';
import { HelpTip } from '../help';
import { accountError, type AccountApi } from '../accounts/api';
import { HallCanvas } from './canvas';
import { useHallConnection } from './connection';

export function LiveHall({
  apiUrl,
  request,
  memberId,
  onConnection,
}: {
  apiUrl: string;
  request: AccountApi;
  memberId: string;
  onConnection: (connected: boolean) => void;
}) {
  const { members, status, wave, sendWave } = useHallConnection(apiUrl, request);
  useEffect(() => {
    onConnection(status === 'connected');
    return () => onConnection(false);
  }, [onConnection, status]);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [mute, setMute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = members.find((member) => member.id === memberId);

  async function selectStation(station: HallStation) {
    setBusy(true);
    setError('');
    try {
      await request('/me/hall-station', { method: 'PUT', body: JSON.stringify({ station }) });
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="live-hall" aria-labelledby="live-hall-title">
      <header className="hall-heading">
        <h2 id="live-hall-title">Guild Hall</h2>
        <p role="status">
          {status === 'connected'
            ? `${members.length} online`
            : {
                connecting: 'Connecting to the hall…',
                reconnecting: 'Reconnecting to the hall…',
                denied: 'Guild access ended',
              }[status]}
        </p>
      </header>
      <HallCanvas members={members} reducedMotion={reducedMotion} wave={mute ? undefined : wave} />
      <div className="hall-controls">
        <label>
          Hall station
          <select
            value={own?.station ?? 'Lounge'}
            disabled={!own || busy}
            onChange={(event) => {
              const station = hallStations.find((item) => item === event.currentTarget.value);
              if (station) void selectStation(station);
            }}
          >
            {hallStations.map((station) => (
              <option key={station}>{station}</option>
            ))}
          </select>
        </label>
        <HelpTip topic="Hall station">
          Move your avatar around the hall. To change the skill you earn XP in, choose a Standing
          order.
        </HelpTip>
        <button type="button" disabled={!own} onClick={sendWave}>
          Wave
        </button>
        <details>
          <summary>Hall settings</summary>
          <label>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.currentTarget.checked)}
            />{' '}
            Reduce motion
          </label>
          <label>
            <input
              type="checkbox"
              checked={mute}
              onChange={(event) => setMute(event.currentTarget.checked)}
            />{' '}
            Mute waves
          </label>
        </details>
      </div>
      {error && <p role="alert">{error}</p>}
      {members.length > 0 && (
        <ul className="hall-roster" aria-label="Online guild members">
          {members.map((member) => (
            <li key={member.id}>
              <details>
                <summary>
                  {member.displayName}
                  {member.id === memberId && ' (you)'}
                </summary>
                <span>
                  Level {member.level} · {member.station} ·{' '}
                  {member.presence === 'idle' ? 'Idle' : 'Online'}
                </span>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
