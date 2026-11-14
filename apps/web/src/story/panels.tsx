import type {
  GuildActivity,
  GuildFeed,
  GuildJournal,
  GuildRecap,
  JournalDiscovery,
} from '@guild/shared';
import { useEffect, useState } from 'react';
import { accountError, type AccountApi } from '../accounts/api';
import { HelpTip } from '../help';

const labels = {
  case: 'Guild Business',
  challenge: 'Expedition challenge',
  party: 'Shared expedition discovery',
  chronicle: 'Guild Chronicle',
};

function Discovery({ item }: { item: JournalDiscovery }) {
  return (
    <li>
      <strong>{item.title}</strong>
      <p>{item.text}</p>
      <small>
        {labels[item.source]} · {item.rarity}
      </small>
    </li>
  );
}

export function Journal({ request }: { request: AccountApi }) {
  const [open, setOpen] = useState(false);
  const [journal, setJournal] = useState<GuildJournal>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError('');
    void request<GuildJournal>('/me/journal', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setJournal(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(accountError(err));
      });
    return () => controller.abort();
  }, [open, request]);

  return (
    <details
      className="guild-admin story-panel"
      id="personal-journal"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Journal &amp; Chronicle</summary>
      {error && <p role="alert">{error}</p>}
      {!journal && !error && <p role="status">Opening your journal…</p>}
      {journal && (
        <>
          <div className="help-heading">
            <h3>Your discoveries</h3>
            <HelpTip topic="your discoveries">
              Find personal discoveries through Guild Business and expedition challenges. Chronicle
              clues are shared by the whole guild.
            </HelpTip>
          </div>
          {journal.discoveries.length ? (
            <ul className="story-list">
              {journal.discoveries.map((item) => (
                <Discovery key={item.key} item={item} />
              ))}
            </ul>
          ) : (
            <p>Your discoveries will be recorded here.</p>
          )}
          <h3>Mysteries</h3>
          {journal.chains.map((chain) => (
            <details key={chain.key} className="story-entry">
              <summary>
                {chain.title} · {chain.discoveries.length}/{chain.steps} clues
              </summary>
              {chain.discoveries.length ? (
                <ol className="story-list">
                  {chain.discoveries.map(({ step, ...item }) => (
                    <li key={item.key} value={step}>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No clues recorded yet.</p>
              )}
            </details>
          ))}
          <h3>The Unwritten Chronicle</h3>
          {journal.chronicle.map((chapter) => (
            <article key={chapter.key} className="story-entry">
              <h4>{chapter.title}</h4>
              <p>{chapter.intro}</p>
              <ul>
                <li>
                  {chapter.expeditions}/{chapter.targetExpeditions} expeditions
                </li>
                <li>
                  {chapter.renown}/{chapter.targetRenown} chapter renown
                </li>
                <li>
                  {chapter.clues.length}/{chapter.targetClues} story clues
                </li>
              </ul>
              {chapter.scenes.map((scene) => (
                <p key={scene.key}>{scene.text}</p>
              ))}
              {chapter.recap && (
                <p>
                  <strong>Chapter complete.</strong> {chapter.recap}
                </p>
              )}
            </article>
          ))}
        </>
      )}
    </details>
  );
}

function activityText(entry: GuildActivity) {
  switch (entry.kind) {
    case 'expedition':
      return `A party returned from ${entry.title} with ${entry.renown} baseline renown.`;
    case 'discovery':
      return `A party shared a discovery, ${entry.title}.`;
    case 'clue':
      return `The Chronicle gained a clue, ${entry.title}.`;
    case 'renown':
      return `The guild reached ${entry.renown.toLocaleString()} renown.`;
  }
}

export function GuildNoticeboard({ request }: { request: AccountApi }) {
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<GuildFeed>();
  const [older, setOlder] = useState<GuildActivity[]>([]);
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError('');
    void request<GuildFeed>('/guild/feed', { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setFeed(result);
        setOlder([]);
        setNext(result.next ?? undefined);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(accountError(err));
      });
    return () => controller.abort();
  }, [open, request]);

  async function showOlder() {
    if (!next || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<GuildFeed>('/guild/feed?before=' + encodeURIComponent(next));
      setOlder((entries) => [...entries, ...result.entries]);
      setNext(result.next ?? undefined);
    } catch (err) {
      setError(accountError(err));
    } finally {
      setBusy(false);
    }
  }

  const entries = [...(feed?.entries ?? []), ...older];
  return (
    <details
      className="guild-admin story-panel"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Guild activity</summary>
      {feed && <p>Guild renown · {feed.renown.toLocaleString()}</p>}
      {error && <p role="alert">{error}</p>}
      {!feed && !error && <p role="status">Reading the noticeboard…</p>}
      {feed &&
        (entries.length ? (
          <ul className="story-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <time dateTime={new Date(entry.at).toISOString()}>
                  {new Date(entry.at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
                <p>{activityText(entry)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No guild activity in the last 30 days.</p>
        ))}
      {next && (
        <button disabled={busy} onClick={() => void showOlder()}>
          Older activity
        </button>
      )}
    </details>
  );
}

function openPanel(id: string) {
  const panel = document.getElementById(id);
  if (panel instanceof HTMLDetailsElement) {
    panel.open = true;
    panel.querySelector('summary')?.focus();
  }
}

export function WhileYouWereAway({
  request,
  characterId,
}: {
  request: AccountApi;
  characterId: string;
}) {
  const [recap, setRecap] = useState<GuildRecap>();
  useEffect(() => {
    const controller = new AbortController();
    const key = 'guild.last-check-in.' + characterId;
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(key);
    } catch {
      /* Storage is optional. */
    }
    const query = previous && /^\d+$/.test(previous) ? '?since=' + previous : '';
    void request<GuildRecap>('/me/recap' + query, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecap(result);
        try {
          localStorage.setItem(key, String(result.checkedAt));
        } catch {
          /* Storage is optional. */
        }
      })
      .catch(() => {
        /* The journal and expedition board remain available. */
      });
    return () => controller.abort();
  }, [request, characterId]);
  if (
    !recap ||
    ![
      recap.standing.xp,
      recap.returned.length,
      recap.discoveries,
      recap.challenges,
      recap.invitations,
      recap.milestones,
    ].some(Boolean)
  )
    return null;
  return (
    <details className="guild-admin story-panel">
      <summary>While you were away</summary>
      <ul className="story-list">
        {recap.standing.xp > 0 && (
          <li>
            Standing orders · {recap.standing.xp} XP · {recap.standing.skillXp} skill XP ·{' '}
            {recap.standing.gold} gold earned while connected
          </li>
        )}
        {recap.returned.map((party) => (
          <li key={party.id}>
            {party.title} returned · +{party.xp} XP · +{party.gold} gold
          </li>
        ))}
        {recap.discoveries > 0 && <li>New personal discoveries · {recap.discoveries}</li>}
        {recap.challenges > 0 && <li>Optional challenges available · {recap.challenges}</li>}
        {recap.invitations > 0 && <li>Open expedition invitations · {recap.invitations}</li>}
        {recap.milestones > 0 && (
          <li>New guild milestones and Chronicle clues · {recap.milestones}</li>
        )}
      </ul>
      {(recap.returned.length > 0 || recap.challenges > 0 || recap.invitations > 0) && (
        <button onClick={() => openPanel('expedition-board')}>Open Expedition Board</button>
      )}
      {(recap.discoveries > 0 || recap.milestones > 0) && (
        <button onClick={() => openPanel('personal-journal')}>Open journal</button>
      )}
    </details>
  );
}
