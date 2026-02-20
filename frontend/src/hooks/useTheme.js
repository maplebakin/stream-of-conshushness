import { useContext } from 'react';
import { ThemeContext } from '../theme-context.js';

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
