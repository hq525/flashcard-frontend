import type { ButtonHTMLAttributes } from 'react';

const variants = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  ghost: 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:text-gray-300',
} as const;

export type ButtonVariant = keyof typeof variants;

// Also used to style Links as buttons (e.g. "Study") so they can't drift
// out of sync with real Buttons.
export function buttonClassName(variant: ButtonVariant = 'primary', className = ''): string {
  return `inline-flex min-h-11 touch-manipulation items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed ${variants[variant]} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...rest} />;
}
