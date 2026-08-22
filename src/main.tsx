import ReactDOM from 'react-dom/client';

import { App } from './app/App';
import { AppProviders } from './app/providers/AppProviders';
import { env } from './config/env';
import './styles/globals.css';
import { markDiscoveryPerformance } from './features/catalog/services/discoveryPerformance.service';
import { e8DiagnosticLog } from './platform/e8DiagnosticLog';

e8DiagnosticLog('TRANSPORT_PROBE');
e8DiagnosticLog('CONFIG_FLAGS', {
  snapshotImportEnabled: env.localCatalogSnapshotImportEnabled,
  snapshotPromotionEnabled: env.localCatalogSnapshotPromotionEnabled,
});
markDiscoveryPerformance('app_start');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App />
  </AppProviders>,
);
