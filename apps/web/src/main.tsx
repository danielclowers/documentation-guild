import { lazy, Suspense, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

const GuildAccess = lazy(() => import('./accounts/access'));
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/+$/, '');
const accessLink = /^#\/(redeem|recover)\/(.*)$/.exec(location.hash);
const invitation = accessLink?.[1] === 'redeem' ? (accessLink[2] ?? null) : null;
const recovery = accessLink?.[1] === 'recover' ? (accessLink[2] ?? null) : null;
if (accessLink) history.replaceState(history.state, '', location.pathname + location.search);

function HallIllustration() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let dispose: (() => void) | undefined;
    let disposed = false;

    void import('./hall')
      .then(({ mountHall }) => {
        if (!disposed) dispose = mountHall(element);
      })
      .catch(() => {
        if (!disposed) element.dataset.renderFailed = 'true';
      });

    return () => {
      disposed = true;
      dispose?.();
    };
  }, []);

  return (
    <figure className="hall">
      <div
        ref={host}
        className="hall-art"
        role="img"
        aria-label="An empty pixel-art guild hall with bookshelves, wooden desks and a glowing hearth"
      />
      <figcaption>The Guild Hall</figcaption>
    </figure>
  );
}

function App() {
  return (
    <div className="page">
      <header className="brand">
        <span className="book-mark" aria-hidden="true" />
        <span>The Unwritten Chronicle</span>
      </header>
      <main className="welcome">
        <section className="intro" aria-labelledby="title">
          <h1 id="title">The Documentation Guild</h1>
          <p className="premise">
            Someone has been removing pages from the Royal Chronicle. The guild has a few questions.
          </p>
          <div className="access">
            {apiUrl && publishableKey ? (
              <Suspense fallback={<p role="status">Loading guild sign-in…</p>}>
                <GuildAccess
                  apiUrl={apiUrl}
                  publishableKey={publishableKey}
                  invitation={invitation}
                  recovery={recovery}
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
        <HallIllustration />
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
