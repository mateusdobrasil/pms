import { describe, expect, it } from "vitest";
import { canAccess, canSee, homeFor, pathArea } from "@/lib/team";

describe("equipe: o que cada perfil acessa", () => {
  it("tela sem área definida é só do dono", () => {
    expect(pathArea("/painel/configuracoes")).toBe("dono");
    expect(pathArea("/painel/equipe")).toBe("dono");
    expect(canSee("owner", "/painel/configuracoes")).toBe(true);
    expect(canSee("staff", "/painel/configuracoes")).toBe(false);
    expect(canSee("staff", "/painel")).toBe(false);
  });

  it("recepção: vendas, agenda do dia a dia, clientes e estoque", () => {
    for (const p of ["/painel/vender", "/painel/pedidos", "/painel/pedidos/abc", "/painel/agenda", "/painel/agenda/bloqueios", "/painel/agenda/pacotes", "/painel/clientes", "/painel/produtos", "/painel/conta", "/painel/ajuda"]) {
      expect(canSee("staff", p), p).toBe(true);
    }
    for (const p of ["/painel/pedidos/exportar", "/painel/agenda/servicos", "/painel/agenda/profissionais/x", "/painel/agenda/comissoes", "/painel/cupons", "/painel/assinatura", "/painel/minha-agenda"]) {
      expect(canSee("staff", p), p).toBe(false);
    }
  });

  it("profissional: só a própria agenda, a conta e a ajuda", () => {
    expect(canSee("professional", "/painel/minha-agenda")).toBe(true);
    expect(canSee("professional", "/painel/conta")).toBe(true);
    expect(canSee("professional", "/painel/agenda")).toBe(false);
    expect(canSee("professional", "/painel/pedidos")).toBe(false);
    expect(homeFor("professional")).toBe("/painel/minha-agenda");
  });

  it("o dono vê tudo, menos a tela do profissional", () => {
    expect(canAccess("owner", "dono")).toBe(true);
    expect(canAccess("owner", "estoque")).toBe(true);
    expect(canAccess("owner", "minha-agenda")).toBe(false);
    expect(pathArea("/painel/agendamento")).toBe("dono"); // prefixo só casa no limite do caminho
  });
});
