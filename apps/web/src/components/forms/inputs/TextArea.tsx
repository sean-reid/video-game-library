import type { TextareaHTMLAttributes } from 'react';

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className, ...rest }: TextAreaProps) {
  return (
    <textarea
      {...rest}
      className={`w-full bg-white/5 rounded-xl px-3 py-2 text-[15px] text-white placeholder-zinc-500 outline-none focus:bg-white/8 focus:ring-1 focus:ring-white/20 resize-none ${className ?? ''}`}
    />
  );
}
