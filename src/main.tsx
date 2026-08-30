import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { applyPlatePreference, readPlatePreference } from './ui/settings/plate-preference';

// Before the first paint, so a chosen night plate never flashes the day sheet.
applyPlatePreference(readPlatePreference());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
