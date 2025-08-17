// src/main.jsx
import './index.css';
import './variables.css';
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
    <Toaster position="bottom-center" />
    <App />
  </React.StrictMode>
);
