import { describe, expect, it } from "vitest";
import { correiosTrackingUrl, deliveredEvent, isCorreiosCode, parseTracking, tokenValid, trackingDue } from "@/lib/correios";

// Formato da API srorastro/v1/objetos (campos que usamos).
const SAMPLE = {
  versao: "1.0.0",
  quantidade: 2,
  objetos: [
    {
      codObjeto: "AB123456789BR",
      eventos: [
        { codigo: "BDE", tipo: "01", dtHrCriado: "2026-10-27T14:03:12", descricao: "Objeto entregue ao destinatário", unidade: { endereco: { cidade: "CAMPINAS", uf: "SP" } } },
        { codigo: "OEC", tipo: "01", dtHrCriado: "2026-10-27T08:10:00", descricao: "Objeto saiu para entrega ao destinatário", unidade: { endereco: { cidade: "CAMPINAS", uf: "SP" } } },
        {
          codigo: "RO",
          tipo: "01",
          dtHrCriado: "2026-10-25T19:00:00",
          descricao: "Objeto em transferência - por favor aguarde",
          unidade: { nome: "CTE CAJAMAR" },
          unidadeDestino: { endereco: { cidade: "CAMPINAS", uf: "SP" } },
        },
        { codigo: "PO", tipo: "01", dtHrCriado: "2026-10-24T11:00:00", descricao: "Objeto postado", unidade: { endereco: { cidade: "SAO PAULO", uf: "SP" } } },
      ],
    },
    { codObjeto: "XY987654321BR", mensagem: "SRO-020: Objeto não encontrado na base de dados dos Correios." },
  ],
};

describe("rastreio dos Correios", () => {
  it("reconhece o código dos Correios (com espaço ou minúscula)", () => {
    expect(isCorreiosCode("AB123456789BR")).toBe(true);
    expect(isCorreiosCode(" ab 123456789 br ")).toBe(true);
    expect(isCorreiosCode("JD0001234567")).toBe(false); // Jadlog e outros: sem rastreio automático
    expect(isCorreiosCode(null)).toBe(false);
    expect(correiosTrackingUrl("ab123456789br")).toContain("objetos=AB123456789BR");
  });

  it("traduz os eventos (mais novo primeiro, horário de Brasília, cidade e destino)", () => {
    const map = parseTracking(SAMPLE);
    expect([...map.keys()]).toEqual(["AB123456789BR"]); // o não encontrado fica de fora
    const ev = map.get("AB123456789BR")!;
    expect(ev.map((e) => e.code)).toEqual(["BDE", "OEC", "RO", "PO"]);
    expect(ev[0].at).toBe("2026-10-27T17:03:12.000Z");
    expect(ev[0].place).toBe("CAMPINAS/SP");
    expect(ev[2]).toMatchObject({ place: "CTE CAJAMAR", detail: "para CAMPINAS/SP" });
  });

  it("entregue: BDE, BDI ou BDR com tipo 01", () => {
    expect(deliveredEvent(parseTracking(SAMPLE).get("AB123456789BR")!)?.code).toBe("BDE");
    const notYet = parseTracking({ objetos: [{ codObjeto: "AB123456789BR", eventos: [{ codigo: "BDE", tipo: "20", dtHrCriado: "2026-10-27T14:00:00", descricao: "Carteiro não atendido" }] }] });
    expect(deliveredEvent(notYet.get("AB123456789BR")!)).toBeNull();
    const bdi = parseTracking({ objetos: [{ codObjeto: "AB123456789BR", eventos: [{ codigo: "BDI", tipo: "1", dtHrCriado: "2026-10-27T14:00:00", descricao: "Objeto entregue" }] }] });
    expect(deliveredEvent(bdi.get("AB123456789BR")!)?.code).toBe("BDI");
  });

  it("resposta estranha não quebra", () => {
    expect(parseTracking(null).size).toBe(0);
    expect(parseTracking({ objetos: [{ codObjeto: "AB123456789BR", eventos: [{ codigo: "PO" }] }] }).size).toBe(0);
  });

  it("consulta a cada 3 h e renova o token 30 min antes de vencer", () => {
    const now = Date.parse("2026-10-28T12:00:00Z");
    expect(trackingDue(null, now)).toBe(true);
    expect(trackingDue("2026-10-28T10:00:00Z", now)).toBe(false);
    expect(trackingDue("2026-10-28T08:59:00Z", now)).toBe(true);
    expect(tokenValid("2026-10-28T13:00:00Z", now)).toBe(true);
    expect(tokenValid("2026-10-28T12:20:00Z", now)).toBe(false);
    expect(tokenValid(null, now)).toBe(false);
  });
});
