import { bootstrapApp } from './app/bootstrap';
import AppRouter from './app/AppRouter';

bootstrapApp({
  app: <AppRouter />,
  missingMessage: 'Missing #root container for OpenCroc Studio.',
});
