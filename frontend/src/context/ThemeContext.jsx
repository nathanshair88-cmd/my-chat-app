import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

// Available themes: 'dark' | 'amoled' | 'light'
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app_theme') || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('app_theme', theme);
    // Remove all theme classes first
    document.documentElement.classList.remove('dark', 'amoled', 'light');
    // Apply current theme
    document.documentElement.classList.add(theme);
  }, [theme]);

  const setAppTheme = (t) => setTheme(t);

  // Legacy support for isDarkMode toggle used in ChatArea
  const isDarkMode = theme !== 'light';
  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, setAppTheme, isDarkMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
