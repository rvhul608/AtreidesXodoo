import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn--primary',
  secondary: 'btn--secondary',
  destructive: 'btn--destructive',
  ghost: 'btn--ghost',
};

const sizeClass: Record<Size, string | null> = {
  sm: 'btn--sm',
  md: null,
  lg: 'btn--lg',
};

/** One primary button per view; label with the exact action. */
export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={clsx('btn', variantClass[variant], sizeClass[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
