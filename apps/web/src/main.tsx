import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      Video Game Library scaffold. App content lands in the next PR.
    </div>
  </StrictMode>,
);
