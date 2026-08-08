"use client";

import * as React from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function resolveClassName(className: unknown) {
  return typeof className === "string" ? className : undefined;
}

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={joinClasses(
        "flex w-full flex-col gap-4",
        resolveClassName(className),
      )}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={joinClasses(
        "overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm",
        resolveClassName(className),
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  const title = typeof children === "string" ? children : undefined;

  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={joinClasses(
          "group/accordion-trigger flex flex-1 items-center justify-between gap-2 px-4 py-4 text-left outline-none transition-colors hover:bg-ink-50/60 aria-disabled:pointer-events-none aria-disabled:opacity-50 sm:gap-4 sm:px-6 sm:py-5",
          resolveClassName(className),
        )}
        {...props}
      >
        <span
          title={title}
          className="min-w-0 flex-1 truncate whitespace-nowrap text-[12px] font-medium leading-none text-ink-900 sm:text-[15px] sm:leading-snug md:text-[17px]"
        >
          {children}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-180 sm:h-4 sm:w-4"
        >
          <path
            d="M5.75 7.75L10 12.25L14.25 7.75"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden"
      {...props}
    >
      <div
        className={joinClasses(
          "h-(--accordion-panel-height) px-4 pb-4 pt-0 text-sm leading-relaxed text-ink-600 transition-[height] duration-200 ease-out sm:px-6 sm:pb-5 sm:text-base",
          resolveClassName(className),
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
