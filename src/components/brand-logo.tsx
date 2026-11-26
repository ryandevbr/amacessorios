import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: "header" | "footer" | "lg";
  className?: string;
}

const SIZE_STYLES = {
  header: {
    wrapper: "gap-1",
    circle: "h-10 w-10 sm:h-11 sm:w-11",
    monogram: "text-[21px] sm:text-[23px]",
    subtitle: "text-[7px] sm:text-[8px] tracking-[0.18em]",
  },
  footer: {
    wrapper: "gap-2",
    circle: "h-14 w-14",
    monogram: "text-[30px]",
    subtitle: "text-[9.5px] tracking-[0.2em]",
  },
  lg: {
    wrapper: "gap-2.5",
    circle: "h-18 w-18 sm:h-20 sm:w-20",
    monogram: "text-[38px] sm:text-[42px]",
    subtitle: "text-[10.5px] sm:text-[11px] tracking-[0.22em]",
  },
} as const;

export function BrandLogo({ size = "header", className }: BrandLogoProps) {
  const styles = SIZE_STYLES[size];

  return (
    <span
      className={cn("inline-flex flex-col items-center select-none shrink-0", styles.wrapper, className)}
      aria-label="AM Acessórios e Makes"
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid place-items-center rounded-full bg-primary text-primary-foreground shadow-xs ring-1 ring-inset ring-brand-accent-light/30",
          styles.circle,
        )}
      >
        <span
          className={cn(
            "font-display font-medium leading-none tracking-[-0.04em] translate-y-[0.5px]",
            styles.monogram,
          )}
        >
          AM
        </span>
      </span>
      <span
        className={cn(
          "font-sans font-semibold uppercase leading-none text-primary whitespace-nowrap",
          styles.subtitle,
        )}
      >
        ACESSÓRIOS E MAKE
      </span>
    </span>
  );
}
