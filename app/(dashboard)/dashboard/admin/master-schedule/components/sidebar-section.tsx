'use client';

import React, { useState } from 'react';
import { Card, CardBody } from '../../../../../components/ui/card';

interface SidebarSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function SidebarSection({
  title,
  count,
  defaultOpen = false,
  children,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 text-xs font-normal text-gray-500">({count})</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <CardBody className="pt-0 pb-3 px-4">
          {children}
        </CardBody>
      )}
    </Card>
  );
}
