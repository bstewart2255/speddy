import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  className?: string;
}

export function Badge({
  children,
  variant = "default",
  className = "",
}: BadgeProps) {
  const variantClasses = {
    default: "bg-blue-100 text-blue-800 border-transparent",
    secondary: "bg-gray-100 text-gray-800 border-transparent",
    destructive: "bg-red-100 text-red-800 border-transparent",
    outline: "text-gray-800 border-gray-300 bg-transparent",
    success: "bg-green-100 text-green-800 border-transparent",
    warning: "bg-yellow-100 text-yellow-800 border-transparent",
  };

  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </div>
  );
}