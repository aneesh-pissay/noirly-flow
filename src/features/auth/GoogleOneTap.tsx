"use client";

import { useEffect, useRef, useState } from "react";

type CredentialResponse = { credential?: string };

type GoogleAccountsId = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    nonce?: string;
    context?: string;
    itp_support?: boolean;
    use_fedcm_for_prompt?: boolean;
  }) => void;
  prompt: () => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<GoogleAccountsId> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.accounts.id) resolve(window.google.accounts.id);
        else reject(new Error("Google Identity Services failed to load"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else reject(new Error("Google Identity Services failed to load"));
    };
    script.onerror = () => reject(new Error("Google Identity Services failed to load"));
    document.head.appendChild(script);
  });
}

export function ProductGoogleOneTap({
  identityUrl,
  onCredential,
}: {
  identityUrl: string;
  onCredential: (input: { credential: string; nonce: string }) => void;
}) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${identityUrl.replace(/\/$/, "")}/api/auth/oauth-providers`)
      .then((res) => res.json() as Promise<{ google?: boolean; googleClientId?: string | null }>)
      .then(async (data) => {
        if (cancelled || !data.google || !data.googleClientId) return;
        const accounts = await loadGsi();
        if (cancelled) return;
        setAvailable(true);
        const nonce =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now());
        accounts.initialize({
          client_id: data.googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
          context: "signin",
          nonce,
          callback: (response) => {
            if (!response.credential) return;
            callbackRef.current({ credential: response.credential, nonce });
          },
        });
        accounts.disableAutoSelect();
        accounts.prompt();
        if (buttonRef.current) {
          buttonRef.current.innerHTML = "";
          accounts.renderButton(buttonRef.current, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: "signin_with",
            shape: "rectangular",
            logo_alignment: "left",
            width: buttonRef.current.offsetWidth || 336,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [identityUrl]);

  // Hidden until Identity reports Google is configured and GSI has loaded,
  // so an unconfigured Google IdP leaves no empty slot or stray label.
  return (
    <div className={available ? "flex flex-col gap-2" : "hidden"}>
      <div ref={buttonRef} className="flex min-h-10 w-full justify-center" />
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--muted-foreground)]">
        Google One Tap · pick any account
      </p>
    </div>
  );
}
