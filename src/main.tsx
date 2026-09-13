import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { applyStoredTheme } from './components/ui';
import { LocaleProvider } from './i18n';
import './index.css';
import './lp-atmo.css';

applyStoredTheme();
document.documentElement.classList.add('prospy-site');

const app = (
  <BrowserRouter>
    <LocaleProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LocaleProvider>
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV ? <StrictMode>{app}</StrictMode> : app,
);
