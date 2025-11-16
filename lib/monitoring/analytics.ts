// lib/monitoring/analytics.ts
import { log } from './logger';

// Extend Window interface for Google Analytics gtag
declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

interface EventProperties {
  [key: string]: unknown;
}

export const track = {
  event: (eventName: string, properties?: EventProperties) => {
    log.info(`Analytics: ${eventName}`, properties);

    // For future analytics integration
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, properties);
    }
  },

  pageView: (pageName: string) => {
    log.info('Page view', { page: pageName });

    // For future analytics integration
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: pageName,
        page_location: window.location.href,
        page_path: window.location.pathname
      });
    }
  },

  error: (errorName: string, error: unknown) => {
    log.error(`User error: ${errorName}`, error);
  }
};

