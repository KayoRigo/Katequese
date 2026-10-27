# Função enviar-notificacao

Entrega as notificações no celular. Roda no Supabase (não no site).
No Supabase real ela ficou com o endereço (slug) **`smart-processor`**; é esse nome que o site chama
(`frontend/modulos/notificacoes/notificacoes.js`) e que o banco chama (`supabase-25.sql`, função `disparar_fila`).

Ela tem dois modos:
- **Manual:** tela Notificações (só admin e Presidente, conferido pelo login da pessoa).
- **Automático:** o banco avisa "tem coisa na fila" (`{"processar": true}`) e a função entrega.
  Esse modo não aceita texto, só entrega o que o próprio banco colocou na fila.

## Como colocar no ar / atualizar
1. Rode os SQLs em ordem (o `supabase-25.sql` é o das notificações automáticas).
2. Supabase → **Edge Functions** → `smart-processor` → aba **Code**: apague tudo, cole o conteúdo de `index.ts` e clique em **Deploy updates**.
3. Aba **Settings** da função → desligue **Verify JWT** (se ficar ligado, o banco é barrado). A função continua protegida:
   o modo manual confere o login da pessoa por dentro.
4. **Edge Functions → Secrets** (criados uma vez só):
   - `VAPID_PUBLIC_KEY` = a mesma chave pública do `frontend/js/base/config.js`
   - `VAPID_PRIVATE_KEY` = a chave privada (nunca vai para o GitHub)
   - `VAPID_SUBJECT` = `mailto:` + um e-mail seu
5. **Database → Extensions**: confira que `pg_net` e `pg_cron` estão ligadas (o SQL tenta ligar sozinho).
   Se ligar agora, rode o `supabase-25.sql` de novo.

Para trocar as chaves no futuro, gere um par novo, atualize os secrets e a chave pública no `config.js`;
cada membro precisa desligar e ligar as notificações de novo no Perfil.
