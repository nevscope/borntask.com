import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/en-gb';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { WorkspaceCatalogProvider } from './api/catalog';
import { App } from './App';
import { QuickAddProvider } from './components/QuickAdd';
import { StatusToastHost } from './components/StatusToast';
import { ThemeProvider } from './theme/ThemeProvider';
import './theme/global.css';
import './theme/theme.css';

dayjs.locale('en-gb');

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
});

const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <StatusToastHost>
        <QuickAddProvider>
          <App />
        </QuickAddProvider>
      </StatusToastHost>
    ),
  },
]);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WorkspaceCatalogProvider>
      <ThemeProvider>
        <AntApp>
          <RouterProvider router={router} />
        </AntApp>
      </ThemeProvider>
      </WorkspaceCatalogProvider>
    </QueryClientProvider>
  </StrictMode>,
);
