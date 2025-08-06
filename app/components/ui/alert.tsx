import React from "react";

interface AlertProps {
  children: React.ReactNode;
  variant?: "default" | "destructive" | "success" | "warning";
  className?: string;
}

export function Alert({
  children,
  variant = "default",
  className = "",
}: AlertProps) {
  const variantClasses = {
    default: "bg-gray-50 border-gray-200 text-gray-800",
    destructive: "bg-red-50 border-red-200 text-red-800",
    success: "bg-green-50 border-green-200 text-green-800",
    warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
  };

  return (
    <div
      className={`relative w-full rounded-lg border p-4 ${variantClasses[variant]} ${className}`}
      role="alert"
    >
      {children}
    </div>
  );
}

interface AlertDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function AlertDescription({
  children,
  className = "",
}: AlertDescriptionProps) {
  return <div className={`text-sm ${className}`}>{children}</div>;
}

interface AlertTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function AlertTitle({
  children,
  className = "",
}: AlertTitleProps) {
  return <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`}>{children}</h5>;
}