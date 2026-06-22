import type { InputHTMLAttributes } from 'react';

type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export function TextInput({ className, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      className={`w-full bg-white/5 rounded-xl px-3 py-2 text-[15px] text-white placeholder-zinc-500 outline-none focus:bg-white/8 focus:ring-1 focus:ring-white/20 ${className ?? ''}`}
    />
  );
}
