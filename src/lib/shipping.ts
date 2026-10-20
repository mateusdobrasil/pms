import "server-only";
import type { Store } from "@/lib/store";
import type { PricedLine } from "@/lib/orders";

export type ShippingOption = {
  id: string; // 'pickup' ou id do serviço no Melhor Envio
  name: string;
  priceCents: number;
  deliveryDays: number | null;
};

// Opções de entrega sempre calculadas no servidor.
// Por enquanto só retirada; o Melhor Envio (etapa 5) entra aqui a partir do CEP e das dimensões das variantes.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- usados pelo Melhor Envio na etapa 5
export async function getShippingOptions(store: Store, lines: PricedLine[]): Promise<ShippingOption[]> {
  return [{ id: "pickup", name: "Retirada na loja", priceCents: 0, deliveryDays: null }];
}
