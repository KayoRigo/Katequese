# Segurança, Testes e Trabalho em Equipe (Gregory, Bruno e Kayo)

Este guia define como os 3 desenvolvedores (**Gregory**, **Bruno** e **Kayo**) mantêm o projeto seguro, organizado e funcionando por **+5 anos** sem quebrar o que já existe.

---

## 1. Como trabalhar em 3 desenvolvedores sem conflito

Como o código agora está separado por responsabilidade, cada um pode mexer em partes diferentes sem atropelar o outro:

1. **Antes de começar a mexer:**
   * Faça `git pull` (ou *Fetch/Pull* no GitHub Desktop) para pegar o que os outros subiram.
2. **Onde colocar cada coisa nova:**
   * **SQL novo:** crie sempre um arquivo novo numerado em `backend/sql/supabase-N.sql` (ex: `supabase-19.sql`). Nunca reescreva um arquivo SQL que já foi rodado no banco de produção.
   * **Script JS novo:** coloque em `frontend/js/`.
   * **Documentação:** atualize o arquivo correspondente em `docs/` (nunca deixe o `CLAUDE.md` da raiz passar de 120 linhas).
3. **Antes de fazer Commit / Push:**
   * Rode a bateria de testes no terminal:
     ```bash
     node --test testes/*.test.js
     ```
   * Se todos os testes e guardrails passarem (`fail 0`), faça o Commit e o Push.
   * No GitHub, a Action (`.github/workflows/testes.yml`) também roda os testes automaticamente a cada Push ou Pull Request.

---

## 2. Como funcionam os Testes (`testes/`) e os Guardrails (`guardrails/`)

Para facilitar a localização, os **testes de lógica** e os **guardrails de proteção** ficam em pastas separadas na raiz:

### Pasta `testes/` (Testes de Lógica e Banco):
* `testes/ajuda.js` — Carrega os arquivos de `frontend/js/` e `frontend/modulos/` num ambiente isolado do Node.js.
* `testes/1-seguranca-login.test.js` — Testa `esc()` (contra XSS em HTML e atributos) e formatação de login/senha.
* `testes/2-datas-eventos.test.js` — Testa datas locais, eventos sem hora (`23:59`), aniversários e anos bissextos (`29/02`).
* `testes/3-cargos-tags.test.js` — Testa `ehKatequistaPerfil`, `temCargo` e a hierarquia de `cargosVisiveis`.
* `testes/4-economia.test.js` — Testa fórmulas de nível/XP, equipamentos por linha, limite de 60% na espera e trava anti-exploit de revenda.
* `testes/5-banco-seguranca.sql` — Script SQL transacional (`BEGIN ... ROLLBACK`) para colar no SQL Editor do Supabase e validar se as travas do banco estão ativas sem sujar dados.
* `testes/6-armazenamento-e-sorteio.test.js` — Testa `limparFotosAntigas()` para não acumular imagens órfãs no limite de 1 GB do Supabase.

### Pasta `guardrails/` (Travas Automáticas de Arquitetura e Responsividade):
* `guardrails/1-arquitetura-e-pastas.test.js` — **Guardrail automático da estrutura:**
  * Garante que nenhum arquivo fique solto na raiz nem em `frontend/` (tudo deve ficar em `paginas/`, `modulos/`, `js/` ou `css/`);
  * Garante que `CLAUDE.md` continue enxuto (`<= 120` linhas) e os arquivos de `docs/` existam;
  * Confere se todos os `<script src>` e `<link href>` de todas as páginas em `frontend/paginas/*.html` apontam para arquivos reais;
  * Confere se toda página interna tem `class="carregando"` e seu módulo chama `iniciarPagina()`;
  * Confere se todos os SQLs em `backend/sql/` usam `create table if not exists` e se `config.js` não vazou nenhuma chave `service_role`.
* `guardrails/2-responsividade.test.js` — **Guardrail automático de responsividade (celular/tablet/PC):**
  * Garante `<meta name="viewport">` em todas as páginas `.html`;
  * Proíbe grids rígidos (`minmax(300px, 1fr)` sem `min(300px, 100%)`) e larguras fixas (`width > 320px`) que criam barra de rolagem horizontal em celulares pequenos;
  * Garante o uso de `--pad-tela`, `--pad-caixa`, `overflow-x: clip`, `100dvh`, fonte `>= 16px` nos inputs (anti-zoom iOS) e recálculo de decorações ao girar a tela (`resize`).

### Sempre faça o teste RED ao criar um teste novo:
Quando criar um teste novo, quebre de propósito a linha correspondente no código, rode `node --test testes/*.test.js` para confirmar que o teste **falha (RED)**, e depois desfaça a quebra para voltar a **passar (GREEN)**.

---

## 3. Cuidados para o Projeto Durar +5 Anos

1. **Repositório Privado no GitHub:**
   * Mantenha o repositório como **Private** no GitHub (*Settings → Change repository visibility*) e adicione Gregory, Bruno e Kayo em *Settings → Collaborators*.
2. **Pausa de 7 dias do Supabase Grátis:**
   * O plano grátis do Supabase pausa o projeto se ficar 7 dias sem nenhuma requisição. Se o grupo ficar uma semana sem entrar, basta reativar no painel do Supabase (ou configurar um ping periódico via GitHub Actions).
3. **Economia de Créditos do Netlify:**
   * No plano grátis do Netlify (300 créditos/mês, 15 por publicação), juntem as alterações locais, testem com `python -m http.server 5173` + `node --test testes/*.test.js` e deem Push quando o pacote estiver pronto.
