import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import enGB from 'antd/locale/en_GB';
import dayjs from 'dayjs';
import 'dayjs/locale/en-gb';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { QuickAddProvider } from './components/QuickAdd';
import { StatusToastHost } from './components/StatusToast';
import { antdTheme } from './theme/antdTheme';
import './theme/global.css';

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

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={antdTheme} locale={enGB}>
        <AntApp>
          <RouterProvider router={router} />
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </StrictMode>,
);
