import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

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
            <h2>Guild access</h2>
            <p>
              The guild is invitation-only. Sign-in and invitation redemption are still in
              development.
            </p>
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
