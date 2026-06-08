import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,#081120_0%,#0f4c81_52%,#0ea5e9_100%)] px-4 py-2.5 text-white shadow-[0_16px_36px_rgba(15,76,129,0.24)] hover:-translate-y-0.5",
        secondary:
          "border border-slate-200 bg-white/90 px-4 py-2.5 text-slate-700 hover:border-slate-300 hover:text-slate-950",
        ghost:
          "px-3 py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        danger:
          "bg-rose-600 px-4 py-2.5 text-white shadow-[0_16px_36px_rgba(225,29,72,0.22)] hover:bg-rose-500",
      },
      size: {
        default: "h-10",
        sm: "h-8 rounded-xl px-3 text-xs",
        lg: "h-11 px-5 text-sm",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
