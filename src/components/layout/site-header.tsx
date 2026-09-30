import Link from "next/link";
import { MapPinned } from "lucide-react";

import { getSessionUser, signOut } from "@/app/actions/auth";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/requests/new", label: "Post request" },
  { href: "/routes/new", label: "Publish trip" },
  { href: "/analytics", label: "Analytics" },
];

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <MapPinned className="size-4" />
          </span>
          <span>RouteRelay</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "shrink-0 text-xs sm:text-sm",
              )}
            >
              {link.label}
            </Link>
          ))}

          {user ? (
            <div className="ml-1 flex items-center gap-2">
              <span className="text-muted-foreground hidden max-w-[140px] truncate text-xs sm:inline">
                {user.fullName || user.email}
              </span>
              <form action={signOut}>
                <Button type="submit" size="sm" variant="outline">
                  Sign out
                </Button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(
                buttonVariants({ size: "sm" }),
                "ml-1 shrink-0",
              )}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
