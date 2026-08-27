"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function CommandPopover({
  open,
  onOpenChange,
  trigger,
  searchPlaceholder = "Cari…",
  emptyLabel = "Tidak ditemukan.",
  children,
  contentClassName,
  align = "start",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  searchPlaceholder?: string;
  emptyLabel?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
  align?: "start" | "center" | "end";
}) {
  const [search, setSearch] = React.useState("");

  function handleOpenChange(next: boolean) {
    if (!next) setSearch("");
    onOpenChange(next);
  }

  function clearSearch(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align={align}
      >
        <Command>
          <div className="relative">
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
              className={search ? "pr-6" : undefined}
            />
            {search ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label="Hapus pencarian"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                onPointerDown={clearSearch}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
