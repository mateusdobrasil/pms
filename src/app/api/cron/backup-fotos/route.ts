import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { backupPhotos } from "@/lib/photo-backup";
import { notifyPlatformError } from "@/lib/email";

// Backup diário das fotos no Vercel Blob (vercel.json → crons, 3h de Brasília).
// A Vercel chama com "Authorization: Bearer <CRON_SECRET>"; sem o segredo certo, 401.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    await notifyPlatformError("backup-fotos:sem-blob", "Backup das fotos sem Vercel Blob configurado", {
      acao: "Vercel → Storage → criar um Blob e conectar ao projeto (cria BLOB_READ_WRITE_TOKEN)",
    });
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN ausente" }, { status: 500 });
  }
  try {
    // Para antes do limite de 60 s da função; o que faltar vai no dia seguinte.
    const result = await backupPhotos(createAdminClient(), Date.now() + 45_000);
    console.log("Backup das fotos", { ...result, failed: result.failed.length });
    if (result.failed.length) {
      await notifyPlatformError("backup-fotos:falhas", "Algumas fotos não foram copiadas para o backup", {
        falhas: result.failed.length,
        exemplos: result.failed.slice(0, 5),
      });
    }
    return NextResponse.json({ ...result, failed: result.failed.slice(0, 20) });
  } catch (err) {
    console.error("Erro no backup das fotos", err);
    await notifyPlatformError("backup-fotos:erro", "Erro no backup diário das fotos", { erro: String(err) });
    return NextResponse.json({ error: "falhou" }, { status: 500 });
  }
}
