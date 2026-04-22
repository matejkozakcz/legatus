import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AdminPillTabs } from "@/components/admin/AdminPillTabs";
import { Apple, Smartphone, Download, Share, Plus, MoreVertical, X } from "lucide-react";
import legatusLogo from "@/assets/legatus-logo-light.png";

// BeforeInstallPromptEvent isn't in standard TS lib
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  // iPadOS 13+ reports as Mac but has touch
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

function isMobileUA() {
  return isIOS() || isAndroid();
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  // iOS
  // @ts-expect-error – non-standard Safari property
  if (window.navigator.standalone === true) return true;
  // Android / others
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

export function InstallPwaPrompt() {
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"ios" | "android">(
    typeof navigator !== "undefined" && isIOS() ? "ios" : "android",
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isMobileUA()) return;
    if (isStandalone()) return;
    if (sessionStorage.getItem("legatus-install-dismissed") === "1") return;
    setShow(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem("legatus-install-dismissed", "1");
    setDismissed(true);
  };

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setOpen(false);
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  if (!show || dismissed) return null;

  return (
    <>
      {/* Banner above login modal */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 400,
          margin: "0 16px 12px",
          background: "rgba(255,255,255,0.95)",
          borderRadius: 16,
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          boxShadow: "0 4px 16px rgba(0,85,95,0.18)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "#00555f",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <img src={legatusLogo} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 600,
              fontSize: 13,
              color: "#0c2226",
              lineHeight: 1.2,
            }}
          >
            Přidej si Legatus jako aplikaci
          </div>
          <div
            style={{
              fontFamily: "Open Sans, sans-serif",
              fontSize: 11,
              color: "#6b7280",
              marginTop: 2,
            }}
          >
            Rychlejší přístup z plochy telefonu
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            background: "#00abbd",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "8px 14px",
            fontFamily: "Poppins, sans-serif",
            fontWeight: 600,
            fontSize: 12.5,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          Přidat
        </button>
        <button
          onClick={handleDismiss}
          aria-label="Zavřít"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 4,
            color: "#8aadb3",
            display: "flex",
          }}
        >
          <X size={16} />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[420px] max-w-[92vw]" style={{ padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h2
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 700,
                fontSize: 18,
                color: "#0c2226",
                marginBottom: 4,
              }}
            >
              Přidat Legatus na plochu
            </h2>
            <p
              style={{
                fontFamily: "Open Sans, sans-serif",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              Vyber svůj systém a postupuj podle kroků.
            </p>
          </div>

          <AdminPillTabs
            tabs={[
              { key: "ios", label: "iPhone", icon: Apple },
              { key: "android", label: "Android", icon: Smartphone },
            ]}
            activeTab={activeTab}
            onTabChange={(k) => setActiveTab(k as "ios" | "android")}
          />

          <div style={{ marginTop: 20 }}>
            {activeTab === "ios" ? (
              <Steps
                items={[
                  { icon: <Share size={18} />, text: "Klepni na ikonu Sdílet ve spodní liště Safari." },
                  { icon: <Plus size={18} />, text: "Vyber „Přidat na plochu“." },
                  { icon: <Download size={18} />, text: "Potvrď tlačítkem „Přidat“ vpravo nahoře." },
                ]}
              />
            ) : (
              <>
                <Steps
                  items={[
                    { icon: <MoreVertical size={18} />, text: "Otevři menu (⋮) v pravém horním rohu Chrome." },
                    { icon: <Plus size={18} />, text: "Vyber „Přidat na plochu“ nebo „Nainstalovat aplikaci“." },
                    { icon: <Download size={18} />, text: "Potvrď tlačítkem „Nainstalovat“." },
                  ]}
                />
                {deferredPrompt && (
                  <button
                    onClick={handleAndroidInstall}
                    style={{
                      marginTop: 16,
                      width: "100%",
                      background: "#fc7c71",
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      padding: "12px 16px",
                      fontFamily: "Poppins, sans-serif",
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    }}
                  >
                    <Download size={16} />
                    Nainstalovat teď
                  </button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Steps({ items }: { items: { icon: React.ReactNode; text: string }[] }) {
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((it, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(0,85,95,0.05)",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#00abbd",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {i + 1}
          </div>
          <div style={{ color: "#00555f", display: "flex", flexShrink: 0 }}>{it.icon}</div>
          <div
            style={{
              fontFamily: "Open Sans, sans-serif",
              fontSize: 13,
              color: "#0c2226",
              lineHeight: 1.4,
            }}
          >
            {it.text}
          </div>
        </li>
      ))}
    </ol>
  );
}
