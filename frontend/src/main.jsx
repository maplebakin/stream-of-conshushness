// src/main.jsx
import './index.css';      // Tailwind first
import './variables.css';  // your custom properties next
import './Main.css';
import './Sidebar.css';
import './Calendar.css';
import './dailypage.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Global toaster for notifications */}
    <Toaster position="bottom-center" />
    <App />
  </React.StrictMode>
);
