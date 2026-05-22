// Import styles, initialize component theme here.
import '../src/styles/index.css';
import '../src/styles/App.css';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import { beforeMount } from '@playwright/experimental-ct-react/hooks';

beforeMount(async ({ App, hooksConfig }) => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
});
