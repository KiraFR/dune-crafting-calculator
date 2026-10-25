import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/overlay.css';
import { APP_MODE, Overlay } from './Overlay';

// In the overlay app the page never scrolls: the app sizes its window to the panel.
document.documentElement.classList.toggle('is-app', APP_MODE);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
