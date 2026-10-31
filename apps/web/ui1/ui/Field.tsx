import { clsx } from 'clsx';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { CircleX } from 'lucide-react';

export type Rule = { label: string; met: boolean };

function FieldShell({
  label,
  help,
  error,
  children,
}: {
  label?: string;
  help?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className={clsx('field', error && 'field--invalid')}>
      {label && <label className="field__label">{label}</label>}
      {children}
      {error ? (
        <span className="field__error">
          <CircleX size={14} aria-hidden="true" />
          {error}
        </span>
      ) : (
        help && <span className="field__help">{help}</span>
      )}
    </div>
  );
}

export function Input({
  label,
  help,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; help?: string; error?: string | null }) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <input className="field__input" {...rest} />
    </FieldShell>
  );
}

export function Select({
  label,
  help,
  error,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; help?: string; error?: string | null }) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <select className="field__select" {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Textarea({
  label,
  help,
  error,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; help?: string; error?: string | null }) {
  return (
    <FieldShell label={label} help={help} error={error}>
      <textarea className="field__textarea" {...rest} />
    </FieldShell>
  );
}

/** Live password rule checklist: >8 chars, upper, lower, special. */
export function PasswordChecklist({ rules }: { rules: Rule[] }) {
  return (
    <div className="pwcheck" aria-live="polite">
      {rules.map((r) => (
        <span key={r.label} className={clsx('pwcheck__item', r.met && 'is-met')}>
          {r.met ? '✓' : '○'} {r.label}
        </span>
      ))}
    </div>
  );
}

export function passwordRules(value: string): Rule[] {
  return [
    { label: 'More than 8 characters', met: value.length > 8 },
    { label: 'An uppercase letter', met: /[A-Z]/.test(value) },
    { label: 'A lowercase letter', met: /[a-z]/.test(value) },
    { label: 'A special character', met: /[^A-Za-z0-9]/.test(value) },
  ];
}
