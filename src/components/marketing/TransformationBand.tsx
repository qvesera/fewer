import fs from "node:fs";
import path from "node:path";
import { Reveal } from "./Reveal";

/**
 * The illustration band (T-150). The art is hand-drawn and dropped in as
 * `public/reorg-graph.svg`; the brief for it lives in
 * design-system/fewer/ILLUSTRATION.md. Until the file exists the band simply
 * does not render, rather than shipping a broken image, and appears by itself
 * the moment the asset lands.
 *
 * Server-only on purpose (node:fs): this component is never imported by a
 * client module, which is the rule the desktop shell export depends on.
 */
const ASSET = path.join(process.cwd(), "public", "reorg-graph.svg");

export function TransformationBand() {
  if (!fs.existsSync(ASSET)) return null;

  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <figure className="m-0">
            <img
              src="/reorg-graph.svg"
              width={1600}
              height={700}
              loading="lazy"
              className="w-full"
              alt="Loose file cards in a tangled pile becoming an ordered, connected tree"
            />
            <figcaption className="mt-4 text-center text-sm text-muted-foreground">
              The same folder. One is a pile, the other is a map.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}
