'use client';

import '@ant-design/v5-patch-for-react-19';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

type ThemeMode = 'light' | 'dark';

type ThemeModeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const themeStorageKey = 'teamsight_theme_mode';
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

dayjs.locale('pt-br');

function readInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = localStorage.getItem(themeStorageKey);

  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function hasVisibleModalOverlay() {
  if (typeof document === 'undefined') {
    return false;
  }

  const modalWraps = document.querySelectorAll<HTMLElement>('.ant-modal-root .ant-modal-wrap');

  return Array.from(modalWraps).some((element) => {
    if (element.classList.contains('ant-modal-wrap-hidden')) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function releaseBodyScrollLockIfNeeded() {
  if (typeof document === 'undefined') {
    return;
  }

  if (hasVisibleModalOverlay()) {
    return;
  }

  const body = document.body;
  body.classList.remove('ant-scrolling-effect');

  if (body.style.overflow === 'hidden') {
    body.style.overflow = '';
  }

  if (body.style.width) {
    body.style.width = '';
  }

  const html = document.documentElement;
  html.classList.remove('ant-scrolling-effect');

  if (html.style.overflow === 'hidden') {
    html.style.overflow = '';
  }

  if (html.style.width) {
    html.style.width = '';
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readInitialThemeMode);

  const toggleMode = () => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const providerValue = useMemo<ThemeModeContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode
    }),
    [mode]
  );

  const themeConfig = useMemo(
    () => ({
      algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: '#3b82f6',
        colorLink: '#60a5fa',
        colorInfo: '#3b82f6',
        borderRadius: 12,
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        ...(mode === 'dark'
          ? {
              colorBgBase: '#0d1117',
              colorBgContainer: '#151b23',
              colorBgElevated: '#1a2230',
              colorText: '#e5e7eb',
              colorTextSecondary: '#9ca3af',
              colorBorder: '#2d3748',
              colorFillSecondary: '#1f2937'
            }
          : {
              colorBgBase: '#f3f6fb',
              colorBgContainer: '#ffffff',
              colorBgElevated: '#ffffff',
              colorText: '#0f172a',
              colorTextSecondary: '#475569',
              colorBorder: '#dbe6f3',
              colorFillSecondary: '#f1f5f9'
            })
      },
      components: {
        Layout: {
          bodyBg: mode === 'dark' ? '#0d1117' : '#f3f6fb',
          siderBg: mode === 'dark' ? '#101722' : '#ffffff',
          headerBg: 'transparent'
        },
        Card: {
          borderRadiusLG: 16
        },
        Button: {
          borderRadius: 10
        }
      }
    }),
    [mode]
  );

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem(themeStorageKey, mode);
  }, [mode]);

  useEffect(() => {
    let rafId: number | null = null;

    const scheduleCheck = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      rafId = window.requestAnimationFrame(() => {
        releaseBodyScrollLockIfNeeded();
      });
    };

    const observer = new MutationObserver(() => {
      scheduleCheck();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      childList: true,
      subtree: true
    });

    scheduleCheck();
    window.addEventListener('pageshow', scheduleCheck);
    window.addEventListener('popstate', scheduleCheck);

    return () => {
      observer.disconnect();
      window.removeEventListener('pageshow', scheduleCheck);
      window.removeEventListener('popstate', scheduleCheck);

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
    <ThemeModeContext.Provider value={providerValue}>
      <ConfigProvider theme={themeConfig} locale={ptBR}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);

  if (!context) {
    throw new Error('useThemeMode deve ser usado dentro de <Providers>.');
  }

  return context;
}
