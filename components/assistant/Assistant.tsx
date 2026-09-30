import { Suspense, useEffect, useId, useRef, useState } from "react";
import { CircleAlert, Sparkles, X } from "lucide-react";
import type { Locale } from "../../lib/catalog";
import { aiStrings } from "../../lib/ai/strings";
import type { AgentContext } from "../../lib/ai/tools";
import { t } from "../../lib/i18n";
import { ErrorBoundary } from "../ErrorBoundary";
import { lazyView } from "../lazyView";

// The panel (providers, the Anthropic SDK, the agent's tools) is only downloaded when someone opens it.
const AssistantPanel = lazyView(() => import("./AssistantPanel"));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
  getContext: () => Omit<AgentContext, "sharing">;
};

/** Floating AI assistant: the launcher button, and the panel once it has been asked for. */
export function Assistant({ open, onOpenChange, locale, getContext }: Props) {
  const s = aiStrings(locale);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const [pending, setPending] = useState(false);
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);

  // Returning from an OpenRouter sign-in (?code=…): the panel finishes it and opens itself.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address bar, client-only
    if (new URLSearchParams(location.search).has("code")) setWanted(true);
  }, []);

  return (
    <>
      <button ref={fabRef} type="button" className="assistant-fab" data-tour="assistant" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={s.fab} data-tip={open ? undefined : s.fab} onClick={() => onOpenChange(!open)} onPointerEnter={AssistantPanel.preload} onFocus={AssistantPanel.preload}>
        <Sparkles size={20} /><b>{s.aiBadge}</b>{pending && <i className="fab-dot" aria-hidden="true" />}
      </button>
      {wanted && (
        <ErrorBoundary fallback={(retry) => open ? (
          <aside id={panelId} className="assistant" data-state="open" role="dialog" aria-label={s.title} onKeyDown={(event) => { if (event.key === "Escape") onOpenChange(false); }}>
            <p className="assistant-error" role="alert"><CircleAlert size={15} />{t(locale, "partErrorTitle")} {t(locale, "partErrorText")}<button type="button" onClick={() => onOpenChange(false)} aria-label={s.close}><X size={13} /></button></p>
            <div className="empty-actions"><button type="button" className="button button-primary" onClick={retry}>{t(locale, "retry")}</button></div>
          </aside>
        ) : null}>
          <Suspense fallback={null}>
            <AssistantPanel open={open} onOpenChange={onOpenChange} locale={locale} getContext={getContext} panelId={panelId} fabRef={fabRef} onPendingChange={setPending} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
