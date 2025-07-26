import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import './index.css';
import axios from './api/axiosInstance';
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <App />
    {/* Toast notifications provider for displaying success/error messages */}
    <Toaster position="top-right" />
  </AuthProvider>
);
