import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "ghost";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "default", ...props }, ref) => {
		const base =
			"inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
		const variants: Record<Variant, string> = {
			default:
				"bg-gray-900 text-white hover:bg-gray-800 active:bg-black border border-gray-900",
			secondary:
				"bg-white text-gray-900 hover:bg-gray-50 border border-gray-300",
			ghost: "bg-transparent hover:bg-gray-100 border border-transparent",
		};
		return (
			<button
				ref={ref}
				className={cn(base, variants[variant], "h-9 px-3", className)}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";
