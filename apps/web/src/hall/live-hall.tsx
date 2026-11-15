import { hallStations } from '@guild/shared';
import type { HallMember, HallStation } from '@guild/shared';
import { useState } from 'react';
import { AvatarPreview } from '../accounts/character';
import { accountError, type AccountApi } from '../accounts/api';

export function HallSettings({
  request,
  own,
  reducedMotion,
  mute,
  onMotion,
  onMute,
}: {
  request: AccountApi;
  own?: HallMember;
  reducedMotion: boolean;
  mute: boolean;
  onMotion: (enabled: boolean) => void;
  onMute: (enabled: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    <section className="panel-content">
      <h3>Hall settings</h3>
      <label htmlFor="hall-station">Hall station</label>
      <select
        id="hall-station"
        value={own?.station ?? 'Lounge'}
        disabled={!own || Boolean(own.expeditionAt) || busy}
        onChange={(event) => {
          const station = hallStations.find((item) => item === event.currentTarget.value);
          if (station) void selectStation(station);
        }}
      >
        {hallStations.map((station) => (
          <option key={station}>{station}</option>
        ))}
      </select>
      <p>Choose where your character stands. Your standing order keeps its current assignment.</p>
      {error && <p role="alert">{error}</p>}
      <div className="game-checks">
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(event) => onMotion(event.currentTarget.checked)}
          />{' '}
          Reduce motion
        </label>
        <label>
          <input
            type="checkbox"
            checked={mute}
            onChange={(event) => onMute(event.currentTarget.checked)}
          />{' '}
          Mute waves
        </label>
      </div>
    </section>
  );
}

export function HallMembers({
  members,
  memberId,
  selected,
  onSelect,
  onWave,
  onCharacter,
}: {
  members: HallMember[];
  memberId: string;
  selected?: string;
  onSelect: (id?: string) => void;
  onWave: () => void;
  onCharacter: () => void;
}) {
  const member = members.find((item) => item.id === selected);
  const own = members.some(({ id }) => id === memberId);
  if (member)
    return (
      <div className="panel-content">
        <button type="button" onClick={() => onSelect()}>
          Back to guild members
        </button>
        <article className="member-profile">
          <AvatarPreview appearance={member} />
          <div>
            <h3>{member.displayName}</h3>
            <p>
              Level {member.level} · {member.presence === 'idle' ? 'Idle' : 'Online'}
            </p>
            <p>{member.expeditionAt ? 'On expedition' : member.station}</p>
          </div>
        </article>
        {member.id === memberId ? (
          <button type="button" onClick={onCharacter}>
            Character &amp; Skills
          </button>
        ) : (
          <button type="button" disabled={!own} onClick={onWave}>
            Wave to the hall
          </button>
        )}
      </div>
    );
  return (
    <div className="panel-content">
      {selected && <p role="status">This guild member is no longer connected.</p>}
      {members.length ? (
        <ul className="member-buttons" aria-label="Online guild members">
          {members.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => onSelect(item.id)}>
                <AvatarPreview appearance={item} />
                <span>
                  <strong>
                    {item.displayName}
                    {item.id === memberId && ' (you)'}
                  </strong>
                  <small>
                    Level {item.level} · {item.expeditionAt ? 'On expedition' : item.station}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nobody is connected to the hall.</p>
      )}
      <button type="button" disabled={!own} onClick={onWave}>
        Wave to the hall
      </button>
    </div>
  );
}
