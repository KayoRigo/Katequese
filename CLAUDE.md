# Katequese — Índice Rápido e Guardrails

Site privado do grupo de amigos **Katequese**.
**Time de desenvolvedores:** **Gregory**, **Bruno** e **Kayo** (`@kayo`, dono/admin).
Mantenha explicações e comentários em **português** simples e direto no código.

---

## 1. Mapa do Projeto (Onde fica cada coisa)

Para não acumular tudo na raiz nem num único documento, o projeto é dividido em **5 pastas**:

| Pasta | O que fica ali |
| :--- | :--- |
| `frontend/` | **Todo o site:** `paginas/*.html`, `css/style.css` (base global), `js/base/` (config, banco, dados, menu, tema) e `modulos/<secao>/` (cada seção isolada com seu `.js` e `.css`). |
| `backend/sql/` | Estrutura e funções do Supabase (`supabase.sql` até `supabase-23.sql`), rodados em ordem. Funções do Supabase (Edge Functions) ficam em `backend/funcoes/`. |
| `testes/` | Testes unitários da lógica e banco (`node --test testes/*.test.js` + `5-banco-seguranca.sql`). |
| `guardrails/` | Travas automáticas de arquitetura e responsividade (`node --test guardrails/*.test.js`). |
| `docs/` | Documentação detalhada dividida por assunto (leia só o documento da parte em que for mexer). |

---

## 2. Qual documento ler antes de mexer (`docs/`)

**REGRA DE OURO:** Não acumule regras de abas específicas neste `CLAUDE.md` (máximo de **120 linhas**, conferido por teste automatizado). Sempre leia e atualize o arquivo certo dentro de `docs/`:

1. **`docs/arquitetura.md`** → Como rodar o site, papel de cada arquivo em `frontend/`, menu, paletas, temas globais (Halloween/Natal) e estilo visual.
2. **`docs/backend-banco.md`** → Login (`+` no Gmail e `@kq`), tabelas do Supabase, onde está a versão atual de cada função SQL e como criar o próximo `backend/sql/supabase-N.sql`.
3. **`docs/funcionalidades.md`** → Regras de Membros, Eventos/Presença, Aniversários, Mural (Anúncios/Recados), Enquetes, Sorteios, Cargos ao lado do nome, Política e Câmara de Leis.
4. **`docs/economia.md`** → Moeda `K$`, níveis/XP, profissões, minijogos, equipamentos por linha, atributos dos itens da loja e cassino.
5. **`docs/seguranca-e-guardrails.md`** → Regras de segurança (RLS, `esc()`, Storage), fluxo de trabalho entre Gregory, Bruno e Kayo, e como rodar/criar testes.

---

## 3. Guardrails Obrigatórios (Para os 3 Devs e IAs)

1. **Rode os testes e guardrails antes de cada commit:**
   ```bash
   node --test testes/*.test.js guardrails/*.test.js
   ```
   A pasta `guardrails/` trava automaticamente se alguém deixar arquivos soltos na raiz ou em `frontend/`, esquecer login numa página nova, quebrar a responsividade ou passar de 120 linhas neste `CLAUDE.md`.
2. **Segurança no banco primeiro:**
   * Nenhuma regra crítica (saldo `K$`, sorteios, votos, permissões) pode confiar só no navegador. Use sempre RLS e funções `security definer`.
   * Todo texto vindo de usuário dentro de `innerHTML` **precisa** passar por `esc()` (`frontend/js/dados.js`).
   * Nunca use `alert()` ou `confirm()` do navegador: use `avisarJanela()` e `confirmar()`.
3. **Mudança no banco = novo `backend/sql/supabase-N.sql`:**
   * O próximo arquivo é o **`backend/sql/supabase-24.sql`**.
   * Todo SQL deve ser **idempotente** (poder rodar mais de uma vez sem erro: `create table if not exists`, `drop policy if exists`, `create or replace function`).
   * Não cole o SQL inteiro no chat a menos que peçam: crie o arquivo em `backend/sql/` e avise o nome para rodar no SQL Editor do Supabase.
4. **Registre toda mudança em Atualizações:**
   * Cada novidade, melhoria, correção ou SQL novo deve ser registrado na tabela `atualizacoes` (pela página *Atualizações* ou no final do `supabase-N.sql`).
5. **Visual limpo (sem "cara de IA"):**
   * Sem degradês/brilhos exagerados, sem roxo + verde-água e sem emojis em títulos. Textos da interface diretos e neutros.
   * Não cite nomes reais dos membros no código ou textos fixos, a não ser onde for pedido.
