import React from "react";

interface RadioGroupProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  name?: string;
}

export function RadioGroup({
  value,
  onValueChange,
  children,
  className = "",
  name,
}: RadioGroupProps) {
  return (
    <div className={`space-y-2 ${className}`} role="radiogroup">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          const childElement = child as React.ReactElement<RadioGroupItemProps>;
          return React.cloneElement(childElement, {
            checked: childElement.props.value === value,
            onChange: () => onValueChange?.(childElement.props.value),
            name: name || "radio-group",
          });
        }
        return child;
      })}
    </div>
  );
}

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  id?: string;
}

export function RadioGroupItem({
  value,
  id,
  className = "",
  children,
  ...props
}: RadioGroupItemProps) {
  const inputId = id || `radio-${value}`;
  
  return (
    <div className="flex items-center space-x-2">
      <input
        type="radio"
        id={inputId}
        value={value}
        className={`h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500 ${className}`}
        {...props}
      />
      {children && (
        <label htmlFor={inputId} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {children}
        </label>
      )}
    </div>
  );
}