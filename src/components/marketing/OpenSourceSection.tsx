import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { APP_URL } from "./MarketingLayout";
import { Reveal } from "./Reveal";

/**
 * Open source (T-150 follow-up): the closing band the pre-redesign page
 * carried, kept because "free software you can read" is the argument the rest
 * of the page's privacy claims rest on. Same two buttons, same one line.
 *
 * The veil is the one place the page breaks the uniform dot grid: the band is
 * centred prose, and without a surface behind it it floats rather than closes.
 * A tint, not a rule - T-150 dropped section rules on purpose.
 */
export function OpenSourceSection() {
  return (
    <section className="relative z-10 bg-card/20 py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Open source</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            fewer is free software under the AGPLv3. Build on it, read the source,
            report issues, and shape where it goes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://github.com/qvesera/fewer"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              View on GitHub
            </a>
            <Link href={APP_URL} className={buttonVariants({ variant: "default", size: "lg" })}>
              Launch the app
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
