import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface SelectContextType {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = createContext<SelectContextType | undefined>(undefined);

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Select({
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  children,
  disabled = false,
}: SelectProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const value = controlledValue !== undefined ? controlledValue : uncontrolledValue;

  const handleValueChange = (newValue: string) => {
    if (controlledValue === undefined) {
      setUncontrolledValue(newValue);
    }
    onValueChange?.(newValue);
    setOpen(false);
  };

  return (
    <SelectContext.Provider value={{ value, onValueChange: handleValueChange, open, setOpen }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export function SelectTrigger({ children, className = "", disabled, ...props }: SelectTriggerProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("SelectTrigger must be used within a Select component");
  }

  const { open, setOpen } = context;

  return (
    <button
      type="button"
      onClick={() => !disabled && setOpen(!open)}
      disabled={disabled}
      className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      aria-expanded={open}
      aria-haspopup="listbox"
      {...props}
    >
      {children}
      <ChevronDown className={`ml-2 h-4 w-4 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

interface SelectValueProps {
  placeholder?: string;
  children?: React.ReactNode;
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("SelectValue must be used within a Select component");
  }

  const { value } = context;
  
  // Find the selected item's label by looking through SelectContent's children
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  
  useEffect(() => {
    // This will be set by SelectItem when it's selected
    const label = value ? document.querySelector(`[data-value="${value}"]`)?.textContent || value : "";
    setSelectedLabel(label);
  }, [value]);

  return <span className="block truncate">{selectedLabel || placeholder || "Select an option"}</span>;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

export function SelectContent({ children, className = "" }: SelectContentProps) {
  const context = useContext(SelectContext);
  const contentRef = useRef<HTMLDivElement>(null);
  
  if (!context) {
    throw new Error("SelectContent must be used within a Select component");
  }

  const { open, setOpen } = context;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        const trigger = contentRef.current.previousElementSibling;
        if (trigger && !trigger.contains(event.target as Node)) {
          setOpen(false);
        }
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, setOpen]);

  if (!open) {
    return null;
  }

  return (
    <div 
      ref={contentRef}
      className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm ${className}`}
      role="listbox"
    >
      {children}
    </div>
  );
}

interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function SelectItem({ value, children, className = "", disabled = false, ...props }: SelectItemProps) {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("SelectItem must be used within a Select component");
  }

  const { value: selectedValue, onValueChange } = context;
  const isSelected = selectedValue === value;

  return (
    <div
      className={`relative cursor-pointer select-none py-2 pl-3 pr-9 ${
        isSelected ? "bg-blue-50 text-blue-900" : "text-gray-900"
      } hover:bg-gray-100 ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
      data-value={value}
      onClick={() => !disabled && onValueChange(value)}
      role="option"
      aria-selected={isSelected}
      {...props}
    >
      <span className={`block truncate ${isSelected ? "font-semibold" : "font-normal"}`}>
        {children}
      </span>
      {isSelected && (
        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
      )}
    </div>
  );
}