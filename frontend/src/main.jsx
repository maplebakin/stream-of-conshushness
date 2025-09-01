// src/main.jsx
// ── CSS order matters: reset/base → tokens → overlay → app/page styles
import './index.css';          // your reset / base (keep first)
import './variables.css';      // design tokens (colors, radii, etc.)
import './DesignSystem.css';   // ← the overlay I gave you (new)
import './Main.css';           // existing globals

// optional page-specific add-ons (uncomment if you kept them separate)
// import './pages/ClusterPage.css';  // cluster layout add-on
// import './Auth.css';               // login/auth add-on

// existing per-page styles
import './Sidebar.css';
import './Calendar.css';
import './dailypage.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Toaster position="bottom-center" />
    <App />
  </React.StrictMode>
);
