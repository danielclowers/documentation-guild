import type {
  GuildActivity,
  GuildFeed,
  GuildJournal,
  GuildRecap,
  JournalDiscovery,
} from '@guild/shared';
import { useEffect, useState } from 'react';
import { accountError, type AccountApi } from '../accounts/api';
import { discoveryHelp, HelpTip } from '../help';
import { Rarity } from '../game/rewards';

const labels = {
  case: 'Guild Business',
  challenge: 'Expedition challenge',
  party: 'Shared expedition discovery',
  chronicle: 'Guild Chronicle',
};

function Discovery({ item }: { item: JournalDiscovery }) {
  return (
    <li id={'journal-entry-' + item.key} tabIndex={-1}>
      <strong>{item.title}</strong>
      <p>{item.text}</p>
      <small>
        {labels[item.source]} · <Rarity value={item.rarity} />
      </small>
    </li>
  );
}

export function Journal({
  request,
  visible,
  focusKey,
  onRead,
}: {
  request: AccountApi;
  visible: boolean;
  focusKey?: string;
  onRead: () => void;
}) {
  const [page, setPage] = useState<'discoveries' | 'chronicle'>('discoveries');
  const [journal, setJournal] = useState<GuildJournal>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!visible) return;
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
  }, [visible, request]);

  useEffect(() => {
    if (!visible || !focusKey || !journal) return;
    if (page !== 'discoveries') {
      setPage('discoveries');
      return;
    }
    const frame = requestAnimationFrame(() => {
      const entry = document.getElementById('journal-entry-' + focusKey);
      if (!entry) return;
      entry.scrollIntoView({ block: 'nearest' });
      entry.focus({ preventScroll: true });
      onRead();
    });
    return () => cancelAnimationFrame(frame);
  }, [visible, focusKey, journal, page, onRead]);

  return (
    <div className="story-panel panel-content">
      {error && <p role="alert">{error}</p>}
      {!journal && !error && <p role="status">Opening your journal…</p>}
      {journal && (
        <>
          <div className="rpg-pages" role="group" aria-label="Journal pages">
            <button
              type="button"
              aria-pressed={page === 'discoveries'}
              onClick={() => setPage('discoveries')}
            >
              My Journal
            </button>
            <button
              type="button"
              aria-pressed={page === 'chronicle'}
              onClick={() => setPage('chronicle')}
            >
              Guild Chronicle
            </button>
          </div>
          {page === 'discoveries' ? (
            <section className="parchment">
              <div className="help-heading">
                <h3>Your discoveries</h3>
                <HelpTip topic="your discoveries">
                  Find personal discoveries through Guild Business and expedition challenges.
                  Chronicle clues are shared by the whole guild.
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
              <details className="story-entry">
                <summary>How discoveries work</summary>
                {discoveryHelp.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </details>
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
            </section>
          ) : (
            <section className="parchment">
              <div className="help-heading">
                <h3>The Unwritten Chronicle</h3>
                <HelpTip topic="Chronicle progress">
                  Everyone shares these chapter goals. Expeditions earn chapter renown and
                  guaranteed story clues. Random personal discoveries stay in your journal.
                </HelpTip>
              </div>
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
            </section>
          )}
        </>
      )}
    </div>
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

export function GuildNoticeboard({ request, visible }: { request: AccountApi; visible: boolean }) {
  const [feed, setFeed] = useState<GuildFeed>();
  const [older, setOlder] = useState<GuildActivity[]>([]);
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, request]);

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
    <div className="story-panel panel-content">
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
    </div>
  );
}

export function useGuildRecap(request: AccountApi, characterId: string) {
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
  return recap;
}

export function WhileYouWereAway({
  recap,
  onExpeditions,
  onJournal,
}: {
  recap: GuildRecap | null;
  onExpeditions: () => void;
  onJournal: () => void;
}) {
  if (!recap) return null;

  return (
    <div className="story-panel panel-content">
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
        <button type="button" onClick={onExpeditions}>
          Open Expedition Board
        </button>
      )}
      {(recap.discoveries > 0 || recap.milestones > 0) && (
        <button type="button" onClick={onJournal}>
          Open journal
        </button>
      )}
    </div>
  );
}
