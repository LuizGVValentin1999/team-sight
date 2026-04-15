'use client';

import '@ant-design/v5-patch-for-react-19';
import { useEffect } from 'react';
import { App as AntdApp, ConfigProvider } from 'antd';

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
    <ConfigProvider>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
