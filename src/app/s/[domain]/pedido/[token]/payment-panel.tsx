"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PixData = { qrCode: string; qrCodeBase64: string; expiresAt: string | null };
type PayResponse = { status?: string; message?: string; pix?: PixData; error?: string };

// Dados que o Card Payment Brick entrega no onSubmit (cartão já tokenizado pelo Mercado Pago).
type CardFormData = {
  token: string;
  issuer_id: string;
  payment_method_id: string;
  installments: number;
  payer: { email: string; identification: { type: string; number: string } };
};

type BrickController = { unmount(): void };
declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => { bricks(): { create(type: string, containerId: string, settings: unknown): Promise<BrickController> } };
  }
}

export function PaymentPanel({
  token,
  totalCents,
  publicKey,
  payerEmail,
}: {
  token: string;
  totalCents: number;
  publicKey: string | null;
  payerEmail: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"pix" | "card">("pix");
  const [pix, setPix] = useState<PixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Enquanto houver Pix gerado (ou cartão em análise), consulta o status até o pedido sair de "aguardando".
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/orders/${token}/status`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const { status } = await res.json();
      if (status !== "pending_payment") {
        setPolling(false);
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [polling, token, router]);

  async function pay(body: object): Promise<PayResponse> {
    const res = await fetch(`/api/orders/${token}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) return { error: data?.error ?? "Não foi possível processar o pagamento." };
    return data;
  }

  async function generatePix() {
    setLoading(true);
    setMessage(null);
    const result = await pay({ method: "pix" });
    setLoading(false);
    if (result.error || !result.pix) {
      setMessage(result.error ?? "Não foi possível gerar o Pix.");
      return;
    }
    setPix(result.pix);
    setPolling(true);
  }

  async function payWithCard(data: CardFormData) {
    setMessage(null);
    const result = await pay({
      method: "card",
      token: data.token,
      installments: data.installments,
      paymentMethodId: data.payment_method_id,
      issuerId: data.issuer_id,
      payer: { identification: data.payer.identification },
    });
    if (result.status === "approved") {
      router.refresh();
      return;
    }
    if (result.status === "pending") setPolling(true);
    setMessage(result.message ?? result.error ?? "Pagamento recusado.");
  }

  async function copyPix() {
    if (!pix) return;
    await navigator.clipboard.writeText(pix.qrCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg border px-4 py-2 text-sm ${active ? "border-neutral-900 font-medium" : "text-neutral-500"}`;

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="font-medium">Pagamento</h2>
      <div className="flex gap-2">
        <button type="button" className={tabClass(method === "pix")} onClick={() => setMethod("pix")}>
          Pix
        </button>
        {publicKey && (
          <button type="button" className={tabClass(method === "card")} onClick={() => setMethod("card")}>
            Cartão de crédito
          </button>
        )}
      </div>

      {method === "pix" && !pix && (
        <button
          type="button"
          onClick={generatePix}
          disabled={loading}
          className="w-full rounded-lg px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          style={{ background: "var(--brand)" }}
        >
          {loading ? "Gerando Pix…" : "Gerar Pix"}
        </button>
      )}

      {method === "pix" && pix && (
        <div className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR code Pix" className="mx-auto h-56 w-56" />
          <p className="text-sm text-neutral-600">Escaneie o QR code ou use o Pix copia e cola:</p>
          <textarea readOnly value={pix.qrCode} rows={3} className="w-full rounded-lg border p-2 font-mono text-xs" />
          <button type="button" onClick={copyPix} className="w-full rounded-lg border px-4 py-2 text-sm">
            {copied ? "Copiado!" : "Copiar código Pix"}
          </button>
          {pix.expiresAt && (
            <p className="text-xs text-neutral-500">
              Válido até {new Date(pix.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.
              A confirmação aparece aqui automaticamente.
            </p>
          )}
        </div>
      )}

      {method === "card" && publicKey && (
        <CardBrick publicKey={publicKey} amountCents={totalCents} email={payerEmail} onSubmit={payWithCard} />
      )}

      {message && <p className="text-sm text-red-700">{message}</p>}
    </section>
  );
}

let sdkPromise: Promise<void> | null = null;
function loadSdk() {
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.onload = () => resolve();
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Falha ao carregar o SDK do Mercado Pago"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function CardBrick({
  publicKey,
  amountCents,
  email,
  onSubmit,
}: {
  publicKey: string;
  amountCents: number;
  email: string;
  onSubmit: (data: CardFormData) => Promise<void>;
}) {
  const submitRef = useRef(onSubmit);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    submitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    let cancelled = false;
    let controller: BrickController | undefined;

    loadSdk()
      .then(async () => {
        if (cancelled || !window.MercadoPago) return;
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const created = await mp.bricks().create("cardPayment", "card-brick", {
          // O valor aqui é só exibição/parcelas; o servidor cobra o total do pedido.
          initialization: { amount: amountCents / 100, payer: { email } },
          customization: { paymentMethods: { maxInstallments: 12 } },
          callbacks: {
            onReady: () => {},
            onSubmit: (data: CardFormData) => submitRef.current(data),
            onError: (err: unknown) => console.error("Card Brick", err),
          },
        });
        if (cancelled) created.unmount();
        else controller = created;
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      controller?.unmount();
    };
  }, [publicKey, amountCents, email]);

  if (failed) return <p className="text-sm text-red-700">Não foi possível carregar o pagamento com cartão. Tente o Pix.</p>;
  return <div id="card-brick" />;
}
