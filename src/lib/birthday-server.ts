import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todayBR } from "@/lib/billing";
import { normalizePhone } from "@/lib/customers";
import { storeBaseUrl } from "@/lib/urls";
import { notifyBirthday } from "@/lib/email";
import { sendTemplate, toWhatsappNumber, whatsappConnected } from "@/lib/whatsapp";
import { buildParams } from "@/lib/whatsapp-events";
import { eventTemplate } from "@/lib/whatsapp-send";
import { campaignState } from "@/lib/whatsapp-campaigns-server";
import { type BirthdayConfig, birthdayCode, birthdayGift, birthdaysOn, parseBirthday } from "@/lib/birthday";
import { isCouponScope } from "@/lib/coupons";

// Configuração da loja (SQL 20261122000000; sem as colunas, desligado).
export async function getBirthdayConfig(db: SupabaseClient, storeId: string): Promise<BirthdayConfig | null> {
  const { data, error } = await db.from("stores").select("birthday_enabled, birthday_kind, birthday_value, birthday_valid_days, birthday_applies_to").eq("id", storeId).maybeSingle();
  if (error || !data) return null;
  return {
    enabled: data.birthday_enabled,
    kind: data.birthday_kind === "fixed" ? "fixed" : "percent",
    value: data.birthday_value,
    validDays: data.birthday_valid_days,
    appliesTo: isCouponScope(data.birthday_applies_to) ? data.birthday_applies_to : "all",
  };
}

// Cliente informou o aniversário (checkout ou agendamento): grava (ou atualiza) pela chave do celular. Nunca lança erro.
export async function recordBirthday(db: SupabaseClient, storeId: string, who: { name: string; email: string | null; phone: string | null; birthday: unknown }) {
  try {
    const birthday = parseBirthday(who.birthday);
    const key = normalizePhone(who.phone) ?? who.email?.trim().toLowerCase();
    if (!birthday || !key || !(await getBirthdayConfig(db, storeId))?.enabled) return;
    await db.from("customer_birthdays").upsert(
      { store_id: storeId, customer_key: key, name: who.name.trim().slice(0, 120), email: who.email, phone: normalizePhone(who.phone), birthday, updated_at: new Date().toISOString() },
      { onConflict: "store_id,customer_key" },
    );
  } catch (err) {
    console.error("Falha ao gravar aniversário", { storeId, err });
  }
}

type Person = { id: string; customer_key: string; name: string; email: string | null; phone: string | null };

// Rotina diária (a partir das 9h): para cada loja com o cupom ligado, os aniversariantes do dia ganham um cupom
// pessoal (1 uso, com validade), por e-mail e, se aceitaram novidades, pelo WhatsApp (dentro da cota de campanhas).
// Trava: last_sent_year (um cupom por ano por cliente). Nunca lança erro.
export async function sendBirthdayCoupons(db: SupabaseClient, today = todayBR()) {
  const result = { coupons: 0, emails: 0, whatsapp: 0 };
  try {
    const year = Number(today.slice(0, 4));
    const { data: stores, error } = await db.from("stores").select("id, name, email, primary_color, birthday_kind, birthday_value, birthday_valid_days, birthday_applies_to").eq("status", "active").eq("birthday_enabled", true);
    if (error) return result; // sem o SQL
    const waCfg = whatsappConnected() ? await eventTemplate(db, "birthday") : null;
    for (const s of stores ?? []) {
      const { data: people } = await db
        .from("customer_birthdays")
        .select("id, customer_key, name, email, phone")
        .eq("store_id", s.id)
        .in("birthday", birthdaysOn(today))
        .or(`last_sent_year.is.null,last_sent_year.lt.${year}`);
      if (!people?.length) continue;
      const { data: domains } = await db.from("store_domains").select("domain, is_primary").eq("store_id", s.id);
      const domain = (domains ?? []).find((d) => d.is_primary)?.domain ?? domains?.[0]?.domain;
      if (!domain) continue;
      const base = storeBaseUrl(domain);
      const cfg = { kind: s.birthday_kind as "percent" | "fixed", value: s.birthday_value as number };
      const endsAt = addDays(today, s.birthday_valid_days - 1);
      const validUntil = `${endsAt.slice(8, 10)}/${endsAt.slice(5, 7)}/${endsAt.slice(0, 4)}`;
      let waLeft = waCfg?.enabled ? ((await campaignState(db, s.id))?.remaining ?? 0) : 0;
      for (const p of people as Person[]) {
        const { data: claimed } = await db
          .from("customer_birthdays")
          .update({ last_sent_year: year })
          .eq("id", p.id)
          .or(`last_sent_year.is.null,last_sent_year.lt.${year}`)
          .select("id");
        if (!claimed?.length) continue;
        // Código pessoal (tenta de novo se, por azar, já existir).
        let code = "";
        for (let i = 0; i < 3 && !code; i++) {
          const c = birthdayCode();
          const { error: insErr } = await db.from("coupons").insert({
            store_id: s.id,
            code: c,
            kind: cfg.kind,
            value: cfg.value,
            ends_at: `${endsAt}T23:59:59-03:00`,
            max_uses: 1,
            applies_to: s.birthday_applies_to,
            origin: "birthday",
            customer_key: p.customer_key,
          });
          if (!insErr) code = c;
        }
        if (!code) {
          await db.from("customer_birthdays").update({ last_sent_year: year - 1 }).eq("id", p.id); // tenta amanhã
          continue;
        }
        result.coupons++;
        const link = `${base}/?cupom=${code}`;
        const gift = birthdayGift(cfg);
        if (p.email && (await notifyBirthday(s, { name: p.name, email: p.email }, { code, gift, validUntil, link }))) result.emails++;
        // WhatsApp: só para quem aceitou novidades (e não saiu), dentro da cota do mês.
        const to = toWhatsappNumber(p.phone);
        if (waCfg?.enabled && waLeft > 0 && to && p.phone) {
          const { data: optin } = await db.from("whatsapp_optins").select("token").eq("store_id", s.id).eq("phone", p.phone).is("opted_out_at", null).maybeSingle();
          if (optin) {
            const sent = await sendTemplate(
              to,
              waCfg.template,
              buildParams(waCfg.params, {
                first_name: p.name.trim().split(/\s+/)[0] || p.name,
                customer_name: p.name,
                store_name: s.name,
                gift,
                coupon_code: code,
                valid_until: validUntil,
                link,
                optout_link: `${base}/whatsapp/sair/${optin.token}`,
              }),
              waCfg.language,
            );
            await db.from("whatsapp_messages").insert({
              store_id: s.id,
              to_phone: to,
              template: waCfg.template,
              wa_message_id: sent.ok ? sent.id : null,
              status: sent.ok ? "sent" : "failed",
              error: sent.ok ? null : sent.error,
              event: "birthday",
            });
            if (sent.ok) {
              result.whatsapp++;
              waLeft--;
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Falha nos cupons de aniversário", err);
  }
  return result;
}
