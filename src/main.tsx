import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import { AppProviders } from './app/providers/AppProviders';
import './styles/globals.css';
import { markDiscoveryPerformance } from './features/catalog/services/discoveryPerformance.service';

markDiscoveryPerformance('app_start');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
