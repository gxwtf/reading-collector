import * as React from "react";

import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "destructive" }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs",
        variant === "default" && "border-border bg-muted/60 text-foreground",
        variant === "success" && "border-brand/40 bg-brand/10 text-brand",
        variant === "destructive" && "border-destructive/40 bg-destructive/10 text-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-muted-foreground", className)} {...props} />;
}
