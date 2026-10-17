// shadcn/ui Pagination, adapted to SCSS and buttons for in-place pagination.
// https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/pagination.tsx
import type * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Навигация по страницам"
      data-slot="pagination"
      className={cn("ui-pagination", className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("ui-pagination__content", className)}
      {...props}
    />
  );
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

function PaginationLink({
  isActive,
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button> & { isActive?: boolean }) {
  return (
    <Button
      type="button"
      aria-current={isActive ? "page" : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      variant={isActive ? "outline" : "ghost"}
      size={size}
      {...props}
    />
  );
}

function PaginationPrevious(
  props: React.ComponentProps<typeof PaginationLink>,
) {
  return (
    <PaginationLink aria-label="Предыдущая попытка" {...props}>
      <ChevronLeft aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationNext(props: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink aria-label="Следующая попытка" {...props}>
      <ChevronRight aria-hidden="true" />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn("ui-pagination__ellipsis", className)}
      {...props}
    >
      <MoreHorizontal />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
