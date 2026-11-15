import type { GuildProfile } from '@guild/shared';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { accountApi } from '../src/accounts/api';
import { GuildGame } from '../src/game/guild-game';
import '../src/style.css';
import '../src/game/game.css';

type GameProfile = GuildProfile & { character: NonNullable<GuildProfile['character']> };
const apiUrl = location.origin;
const request = accountApi(apiUrl);

function Harness() {
  const [profile, setProfile] = useState<GameProfile>();
  if (!profile)
    return (
      <button type="button" onClick={() => void request<GameProfile>('/me').then(setProfile)}>
        Enter test hall
      </button>
    );
  function update(next: GuildProfile) {
    if (next.character) setProfile({ ...next, character: next.character });
  }
  return (
    <main>
      <GuildGame
        apiUrl={apiUrl}
        profile={profile}
        request={request}
        onChange={update}
        onConnection={() => undefined}
        onSaveAppearance={async (appearance) => {
          update(
            await request<GuildProfile>('/me/character', {
              method: 'PATCH',
              body: JSON.stringify(appearance),
            }),
          );
        }}
        onSignOut={() => setProfile(undefined)}
        accountSettings={<button type="button">Change password</button>}
      />
    </main>
  );
}

createRoot(document.getElementById('fixture')!).render(<Harness />);
