import { describe, expect, it } from "vitest";
import {
  addDays,
  dueDateOptions,
  invoiceStage,
  invoiceTitle,
  isDueDay,
  lastPayDay,
  monthlyInvoiceToIssue,
  nextDueDate,
  todayBR,
} from "@/lib/billing";

describe("datas da cobrança", () => {
  it("usa o dia de Brasília", () => {
    expect(todayBR(new Date("2026-11-10T02:00:00Z"))).toBe("2026-11-09"); // 23h do dia 9 em Brasília
    expect(todayBR(new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-10");
  });

  it("próximo vencimento é o dia 9", () => {
    expect(nextDueDate("2026-11-01")).toBe("2026-11-09");
    expect(nextDueDate("2026-11-09")).toBe("2026-11-09");
    expect(nextDueDate("2026-11-10")).toBe("2026-12-09");
    expect(nextDueDate("2026-12-20")).toBe("2027-01-09");
  });

  it("opções da 1ª mensalidade", () => {
    expect(dueDateOptions("2026-10-22", 3)).toEqual(["2026-11-09", "2026-12-09", "2027-01-09"]);
    expect(isDueDay("2026-11-09")).toBe(true);
    expect(isDueDay("2026-11-10")).toBe(false);
  });

  it("vira mês e ano", () => {
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
    expect(lastPayDay("2026-11-09")).toBe("2026-11-29");
  });
});

describe("emissão da mensalidade", () => {
  it("emite 10 dias antes do vencimento", () => {
    expect(monthlyInvoiceToIssue("2026-10-29", "2026-11-09")).toBeNull();
    expect(monthlyInvoiceToIssue("2026-10-30", "2026-11-09")).toEqual({ referenceMonth: "2026-11-01", dueDate: "2026-11-09" });
    expect(monthlyInvoiceToIssue("2026-11-09", "2026-11-09")).toEqual({ referenceMonth: "2026-11-01", dueDate: "2026-11-09" });
  });

  it("não emite antes do início nem sem mensalidade", () => {
    expect(monthlyInvoiceToIssue("2026-11-30", "2027-01-09")).toBeNull();
    expect(monthlyInvoiceToIssue("2026-12-30", "2027-01-09")).toEqual({ referenceMonth: "2027-01-01", dueDate: "2027-01-09" });
    expect(monthlyInvoiceToIssue("2026-11-05", null)).toBeNull();
  });
});

describe("atraso", () => {
  it("avisa, alerta aos 15 dias e suspende depois de 20", () => {
    expect(invoiceStage("2026-11-09", "2026-11-09")).toBe("upcoming");
    expect(invoiceStage("2026-11-09", "2026-11-10")).toBe("overdue");
    expect(invoiceStage("2026-11-09", "2026-11-24")).toBe("warning");
    expect(invoiceStage("2026-11-09", "2026-11-29")).toBe("warning"); // último dia para pagar
    expect(invoiceStage("2026-11-09", "2026-11-30")).toBe("suspend");
  });

  it("título da fatura", () => {
    expect(invoiceTitle({ kind: "monthly", reference_month: "2026-11-01" })).toBe("Mensalidade de novembro de 2026");
    expect(invoiceTitle({ kind: "setup", reference_month: null })).toBe("Taxa de implantação");
  });
});
