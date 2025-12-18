'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface LongHoverTooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number; // in milliseconds, default 5000 (5 seconds)
  position?: 'top' | 'bottom' | 'auto';
  maxWidth?: number;
}

export function LongHoverTooltip({
  content,
  children,
  delay = 5000,
  position = 'auto',
  maxWidth = 300,
}: LongHoverTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [actualPosition, setActualPosition] = useState<'top' | 'bottom'>('top');
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipHeight = 80; // Estimated height
    const spacing = 8;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Determine vertical position
    let finalPosition: 'top' | 'bottom' = position === 'auto' ? 'top' : position;

    if (position === 'auto') {
      const spaceAbove = triggerRect.top;
      const spaceBelow = viewportHeight - triggerRect.bottom;

      if (spaceAbove < tooltipHeight + spacing && spaceBelow > spaceAbove) {
        finalPosition = 'bottom';
      }
    }

    // Calculate coordinates
    let top: number;
    if (finalPosition === 'top') {
      top = triggerRect.top - spacing;
    } else {
      top = triggerRect.bottom + spacing;
    }

    // Center horizontally, but keep within viewport
    let left = triggerRect.left + triggerRect.width / 2;

    // Ensure tooltip doesn't overflow viewport edges
    const halfWidth = maxWidth / 2;
    if (left - halfWidth < 10) {
      left = halfWidth + 10;
    } else if (left + halfWidth > viewportWidth - 10) {
      left = viewportWidth - halfWidth - 10;
    }

    setCoords({ top, left });
    setActualPosition(finalPosition);
  }, [position, maxWidth]);

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      calculatePosition();
      setIsVisible(true);
    }, delay);
  }, [delay, calculatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Recalculate position on scroll/resize while visible
  useEffect(() => {
    if (!isVisible) return;

    const handleReposition = () => calculatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);

    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [isVisible, calculatePosition]);

  const tooltipElement = isVisible && mounted ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`
        fixed z-[1150] px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg
        transition-opacity duration-200
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
      style={{
        top: actualPosition === 'top' ? coords.top : coords.top,
        left: coords.left,
        transform: `translate(-50%, ${actualPosition === 'top' ? '-100%' : '0'})`,
        maxWidth: `${maxWidth}px`,
        pointerEvents: 'none',
      }}
    >
      {/* Arrow */}
      <div
        className={`
          absolute left-1/2 -translate-x-1/2 w-0 h-0
          border-l-[6px] border-l-transparent
          border-r-[6px] border-r-transparent
          ${actualPosition === 'top'
            ? 'bottom-0 translate-y-full border-t-[6px] border-t-gray-900'
            : 'top-0 -translate-y-full border-b-[6px] border-b-gray-900'
          }
        `}
      />
      {content}
    </div>
  ) : null;

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-block"
    >
      {children}
      {mounted && typeof document !== 'undefined' && tooltipElement && createPortal(tooltipElement, document.body)}
    </div>
  );
}
