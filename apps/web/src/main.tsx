import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { HelpPage } from './help';
import { HallCanvas } from './hall/canvas';
import { createRoot } from 'react-dom/client';
import './style.css';
import './game/game.css';

const GuildAccess = lazy(() => import('./accounts/access'));
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const accessLink = /^#\/(redeem|recover)\/(.*)$/.exec(location.hash);
const invitation = accessLink?.[1] === 'redeem' ? (accessLink[2] ?? null) : null;
const recovery = accessLink?.[1] === 'recover' ? (accessLink[2] ?? null) : null;
if (accessLink) history.replaceState(history.state, '', location.pathname + location.search);

function App() {
  const [inside, setInside] = useState(false);
  const [help, setHelp] = useState(() => location.hash === '#/help');
  useEffect(() => {
    const navigate = () => setHelp(location.hash === '#/help');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const externalHelp = help && !inside;
  useEffect(() => {
    if (externalHelp) document.getElementById('help-title')?.focus();
  }, [externalHelp]);
  const dismissHelp = useCallback(() => {
    if (location.hash === '#/help') {
      history.replaceState(history.state, '', location.pathname + location.search);
      setHelp(false);
    }
  }, []);
  return (
    <div className={inside ? 'game-page' : 'page'}>
      {!inside && (
        <header className="brand">
          <span className="book-mark" aria-hidden="true" />
          <span>The Unwritten Chronicle</span>
          <a className="help-nav" href={help ? '#/' : '#/help'}>
            {help ? 'Guild' : 'Help & FAQ'}
          </a>
        </header>
      )}
      {externalHelp && <HelpPage />}
      <main hidden={externalHelp} className={inside ? 'game-main' : 'welcome'}>
        <section
          className={inside ? 'game-entry' : 'intro'}
          aria-labelledby={inside ? undefined : 'title'}
        >
          {!inside && <h1 id="title">The Documentation Guild</h1>}
          {!inside && (
            <p className="premise">
              Someone has been removing pages from the Royal Chronicle. The guild has a few
              questions.
            </p>
          )}
          <div className={inside ? 'game-access' : 'access'}>
            {apiUrl && publishableKey ? (
              <Suspense fallback={<p role="status">Loading guild sign-in…</p>}>
                <GuildAccess
                  apiUrl={apiUrl}
                  publishableKey={publishableKey}
                  invitation={invitation}
                  recovery={recovery}
                  onEnter={setInside}
                  showHelp={help}
                  onDismissHelp={dismissHelp}
                />
              </Suspense>
            ) : (
              <>
                <h2>Guild access</h2>
                <p>
                  The guild is invitation-only. Sign-in will open when the guild server is
                  connected.
                </p>
              </>
            )}
          </div>
        </section>
        {!inside && <HallCanvas />}
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
