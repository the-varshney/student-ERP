import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ThemeProviderWrapper } from './context/ThemeContext';
import AuthProvider from './context/AuthProvider';
import '@fontsource/roboto-flex';
import 'bulma/css/bulma.min.css';
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProviderWrapper>
          <App />
        </ThemeProviderWrapper>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);