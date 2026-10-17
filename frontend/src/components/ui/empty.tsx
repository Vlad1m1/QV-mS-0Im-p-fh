import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty" className={cn(className)} {...props} />;
}
function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn(className)} {...props} />;
}
const emptyMediaVariants = cva("ui-empty-media", {
  variants: {
    variant: {
      default: "ui-empty-media--default",
      icon: "ui-empty-media--icon",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  );
}
function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-title" className={cn(className)} {...props} />;
}
function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div data-slot="empty-description" className={cn(className)} {...props} />
  );
}
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-content" className={cn(className)} {...props} />;
}
export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};
