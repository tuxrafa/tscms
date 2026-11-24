import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-pine text-paper hover:bg-[#18563b]',
    ghost: 'bg-transparent text-ink hover:bg-line/60',
    danger: 'bg-clay text-white hover:bg-[#a8563b]',
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink/70">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="rounded-xl border border-line bg-white px-3 py-2 outline-none focus:border-pine" {...props} />;
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-white/80 p-4 shadow-sm">
      <h2 className="mb-3 font-serif text-xl">{title}</h2>
      {children}
    </section>
  );
}
