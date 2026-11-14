"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_PLANS, type ContactPlan } from "@/lib/fewer/contactRequest";

/**
 * The pricing page's contact form (T-257).
 *
 * One form for both paid plans, with the plan preselected by the card the
 * reader came from. It posts to /api/contact, which sends the mail with the
 * visitor in `replyTo`, so no address is printed on the page.
 *
 * The honeypot field is a real input, hidden from people and from the
 * keyboard: a robot fills it, and the route answers as if the send worked.
 */
export function PricingContactForm({ defaultPlan = "pro" }: { defaultPlan?: ContactPlan }) {
  const [plan, setPlan] = useState<ContactPlan>(defaultPlan);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // A plain form post (no JavaScript) comes back as ?sent=1 or ?sent=0.
    const sent = new URLSearchParams(window.location.search).get("sent");
    if (sent === "1") {
      setState("sent");
      setMessage("Thanks. We will reply to that address.");
    } else if (sent === "0") {
      setState("error");
      setMessage("That did not go through. Try again.");
    }
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("sending");
    setMessage("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: data.get("plan"),
          name: data.get("name"),
          email: data.get("email"),
          organisation: data.get("organisation"),
          message: data.get("message"),
          website: data.get("website"),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(body.error ?? "That did not go through. Try again.");
        return;
      }
      setState("sent");
      setMessage("Thanks. We will reply to that address.");
      form.reset();
    } catch {
      setState("error");
      setMessage("That did not go through. Try again.");
    }
  }

  return (
    // action + method: with no JavaScript (or a hydration that never
    // happened) the browser posts the form itself and the route answers
    // with a redirect. With JavaScript, onSubmit takes over and posts JSON.
    // The native validation is left on: the browser checks the obvious
    // things before a request is made, and the route checks the rest.
    <form action="/api/contact" method="post" onSubmit={onSubmit} className="space-y-4">
      {/* The fields are uncontrolled and carry `suppressHydrationWarning`.
          A browser can change a form field before React hydrates it - an
          autofill, a password manager, a restored form on a reload - and
          React reports that as a hydration mismatch it will not patch. The
          value it found is the visitor's own, so the warning is noise: the
          fields are read from the DOM at submit time (FormData), never from
          React state.

          If hydration does not happen at all, the form still works: it posts
          to /api/contact as a plain HTML form, and the route answers a
          form-encoded body with a redirect. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="contact-name" className="text-xs font-semibold">
            Your name
          </label>
          <Input
            id="contact-name"
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            suppressHydrationWarning
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contact-email" className="text-xs font-semibold">
            Your email
          </label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            suppressHydrationWarning
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="contact-org" className="text-xs font-semibold">
            Organisation (optional)
          </label>
          <Input
            id="contact-org"
            name="organisation"
            maxLength={140}
            autoComplete="organization"
            suppressHydrationWarning
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contact-plan" className="text-xs font-semibold">
            What are you asking about?
          </label>
          <select
            id="contact-plan"
            name="plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value as ContactPlan)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {CONTACT_PLANS.map((p) => (
              <option key={p} value={p}>
                {p === "pro" ? "Pro" : "Enterprise"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-xs font-semibold">
          What do you need?
        </label>
        <Textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          maxLength={2000}
          suppressHydrationWarning
        />
      </div>

      {/* Honeypot: hidden from people, filled by robots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          suppressHydrationWarning
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={state === "sending"} className="cursor-pointer">
          {state === "sending" ? "Sending..." : "Send"}
        </Button>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}
