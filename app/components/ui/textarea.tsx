import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", error = false, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        <textarea
          className={`flex min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            error
              ? "border-red-500 focus-visible:ring-red-500"
              : "border-gray-300"
          } ${className}`}
          ref={ref}
          {...props}
        />
        {helperText && (
          <p className={`mt-1 text-xs ${error ? "text-red-500" : "text-gray-500"}`}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";