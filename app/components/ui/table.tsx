import React from 'react';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}

interface TableHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHeader({ children, className = '' }: TableHeaderProps) {
  return (
    <thead className={`bg-gray-50 ${className}`}>
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className = '' }: TableBodyProps) {
  return (
    <tbody className={className}>
      {children}
    </tbody>
  );
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TableRow({ children, className = '', onClick }: TableRowProps) {
  const clickableClass = onClick ? 'cursor-pointer' : '';

  return (
    <tr 
      className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${clickableClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
  sortable?: boolean;
  onSort?: () => void;
}

export function TableHead({ children, className = '', sortable, onSort }: TableHeadProps) {
  const sortableClass = sortable ? 'cursor-pointer hover:bg-gray-100' : '';

  return (
    <th 
      className={`text-left font-semibold text-gray-600 px-4 py-3 text-sm uppercase tracking-wide ${sortableClass} ${className}`}
      onClick={onSort}
    >
      <div className="flex items-center gap-2">
        {children}
        {sortable && (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        )}
      </div>
    </th>
  );
}

interface TableCellProps {
  children: React.ReactNode;
  className?: string;
}

export function TableCell({ children, className = '' }: TableCellProps) {
  return (
    <td className={`px-4 py-3 text-gray-900 ${className}`}>
      {children}
    </td>
  );
}

// Action cell for buttons
interface TableActionCellProps {
  children: React.ReactNode;
  className?: string;
}

export function TableActionCell({ children, className = '' }: TableActionCellProps) {
  return (
    <td className={`px-4 py-3 ${className}`}>
      <div className="flex items-center gap-2">
        {children}
      </div>
    </td>
  );
}

// Empty state component
interface TableEmptyProps {
  message?: string;
  description?: string;
  action?: React.ReactNode;
}

export function TableEmpty({ 
  message = "No data available", 
  description,
  action 
}: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={100} className="px-4 py-12 text-center">
        <div className="text-gray-500">
          <div className="text-lg font-medium mb-2">{message}</div>
          {description && (
            <div className="text-sm text-gray-400 mb-4">{description}</div>
          )}
          {action && action}
        </div>
      </td>
    </tr>
  );
}