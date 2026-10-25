// =====================================================================
// config.js — dados de conexão com o Supabase.
//
// Pegue os dois valores no Supabase: Project Settings → API (ou "Data API").
//   - SUPABASE_URL: o "Project URL" (algo como https://abcdefgh.supabase.co)
//   - SUPABASE_ANON_KEY: a chave "anon public" (ou "publishable")
//
// Pode ficar tranquilo: essa chave é feita para ser pública. Quem protege os
// dados são as regras de acesso (RLS) que o supabase.sql criou no banco.
// NUNCA coloque aqui a chave "service_role" / "secret": essa sim dá acesso total.
// =====================================================================

const SUPABASE_URL = "https://vfdnwvrinxdtnbyljibk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_w6Trrved7p0rMtCBFB5JCQ_hIdlSpoU";

// O Supabase faz login por e-mail, e só aceita e-mails de domínios que existem.
// Como no Katequese a gente usa só nome de usuário, o truque é usar um Gmail com "+":
// o usuário "joao" vira "EMAILBASE+joao@gmail.com" por baixo dos panos.
// O Gmail entrega qualquer "+algo" na mesma caixa, mas o Supabase enxerga cada
// um como um e-mail diferente. Nenhum e-mail é enviado (a confirmação está desligada).
// Este endereço fica visível no código do site, então use um Gmail só do grupo.
const EMAIL_BASE = "kayorigo0@gmail.com";
