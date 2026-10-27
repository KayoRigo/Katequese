# Função enviar-notificacao

> No Supabase real o endereço (slug) ficou `smart-processor`; é esse nome que o site chama em `notificacoes.js`.

Envia as notificações para o celular. Roda no Supabase (não no site).

## Como colocar no ar (só uma vez)
1. Rode o `supabase-23.sql` no SQL Editor.
2. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Nome da função: `enviar-notificacao` (exatamente assim).
4. Apague o código de exemplo, cole todo o conteúdo de `index.ts` e clique em **Deploy**.
5. Em **Edge Functions → Secrets** (ou Project Settings → Edge Functions) crie 3 secrets:
   - `VAPID_PUBLIC_KEY` = a mesma chave pública do `frontend/js/base/config.js`
   - `VAPID_PRIVATE_KEY` = a chave privada (nunca vai para o GitHub)
   - `VAPID_SUBJECT` = `mailto:` + um e-mail seu
6. Em **Edge Functions → enviar-notificacao → Details**, deixe **Verify JWT** ligado.

Para trocar as chaves no futuro, gere um par novo, atualize os secrets e a chave pública no `config.js`;
cada membro precisa desligar e ligar as notificações de novo no Perfil.
