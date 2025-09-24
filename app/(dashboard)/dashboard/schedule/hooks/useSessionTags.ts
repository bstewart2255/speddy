import { useEffect, useRef, useState } from 'react';

const loadSessionTags = (): Record<string, string> => {
  if (typeof window === 'undefined') {
    return {};
  }

  const savedTags = localStorage.getItem('speddy-session-tags');

  if (!savedTags) {
    return {};
  }

  try {
    const parsed = JSON.parse(savedTags);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, string> = {};

    for (const key of Object.keys(parsed)) {
      const value = parsed[key];
      if (value !== undefined && typeof value !== 'function') {
        result[key] = String(value);
      }
    }

    return result;
  } catch {
    return {};
  }
};

export const useSessionTags = () => {
  const [sessionTags, setSessionTags] = useState<Record<string, string>>(loadSessionTags);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('speddy-session-tags', JSON.stringify(sessionTags));
    }
  }, [sessionTags]);

  return { sessionTags, setSessionTags } as const;
};
