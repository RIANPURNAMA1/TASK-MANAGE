import clsx from 'clsx';

/** Shared look for every rail button: 44px square, blue bar on the left edge when active. */
export function railItemClass(active: boolean): string {
  return clsx(
    'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors [&_svg]:h-[22px] [&_svg]:w-[22px] [&_svg]:stroke-[1.75]',
    "before:absolute before:-left-4 before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:transition-colors before:content-['']",
    active
      ? 'bg-brand-subtle text-brand before:bg-brand'
      : 'text-ink-subtle before:bg-transparent hover:bg-canvas-deep hover:text-ink',
  );
}
