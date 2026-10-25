# Arquitetura e Front-end (`frontend/`)

## Como o site funciona e como rodar

* **Site estático** (HTML, CSS e JavaScript puros, sem framework, sem bundler e sem `node_modules`) + **Supabase** (PostgreSQL, Auth e Storage privado).
* **Para rodar localmente:**
  * No Mac/Linux: `python3 -m http.server 5173 -d frontend`
  * No Windows: `python -m http.server 5173 -d frontend`
  * Abra `http://localhost:5173` no navegador (use `Ctrl+Shift+R` / `Cmd+Shift+R` ao editar JS/CSS para limpar o cache).
  * No Netlify: configure *Publish directory* como `frontend`.
* **Para rodar os testes automatizados:**
  ```bash
  node --test testes/*.test.js
  ```

---

## Estrutura de Arquivos do Front-end

Todo o front-end fica dentro de `frontend/`, dividido entre as páginas `.html`, `css/` e `js/` (`base/` para os scripts globais e `paginas/` para os scripts específicos):

| Arquivo | Papel |
| :--- | :--- |
| `frontend/*.html` | As páginas do site (`index.html`, `eventos.html`, `economia.html`, etc.). |
| `frontend/js/base/config.js` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chave pública `publishable`) e `EMAIL_BASE`. |
| `frontend/js/base/banco.js` | Conexão com o Supabase (`sb`), `iniciarPagina()` (protege as páginas), envio/links/limpeza de imagens no Storage (`reduzirImagem`, `enviarArquivo`, `limparFotosAntigas`), busca de eventos, presenças, aniversários, mural e cargos. |
| `frontend/js/base/dados.js` | Funções de ajuda: `esc()` (anti-XSS), datas (`lerData`, `inicioEvento`, `diasAteAniversario`), cartões HTML (`htmlEvento`, `htmlPresenca`, `htmlAvatar`, `htmlTag`, `htmlNome`, `htmlCargos`, `cargosVisiveis`, `htmlRecado`, `htmlAnuncio`) e janelas `confirmar()` / `avisarJanela()`. |
| `frontend/js/base/menu.js` | Cabeçalho único de todas as páginas: `ABAS_FIXAS` (barra principal: Início, Eventos, Mídias, Política, Economia) + `GRUPOS_MENU` (botão "Mais" no PC / "Menu" no celular: Grupo, Atividades, Conta). |
| `frontend/js/base/tema.js` | Paletas individuais (`localStorage`) + temas globais ativados pelo Admin (`halloween` e `natal`) desenhados em SVG puro. |
| `frontend/js/paginas/economia.js` | Lógica da página `economia.html` (Carteira, Trabalhos, Transferir, Loja, Cassino, Ranking e Admin da Economia). |
| `frontend/js/paginas/minijogos.js` | Janela de turno e os 5 minijogos das profissões + efeitos visuais/sonoros (Web Audio API) compartilhados com o Cassino. |
| `frontend/js/paginas/leis.js` | Sub-abas da página `politica.html`: Leis em vigor, Câmara e Gestão (`iniciarLeis(eu)`). |
| `frontend/css/style.css` | Todo o visual do site; variáveis das paletas no topo e temas globais (Halloween e Natal) no final. |

---

## Como criar uma página nova

1. Crie o arquivo `.html` dentro de `frontend/` começando com `<html lang="pt-BR" class="carregando">` (para não exibir nada antes de checar o login).
2. Inclua no `<head>`:
   ```html
   <link rel="stylesheet" href="css/style.css">
   <script src="js/base/tema.js"></script>
   ```
3. No fim do `<body>`, carregue o SDK do Supabase e os scripts base:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
   <script src="js/base/config.js"></script>
   <script src="js/base/dados.js"></script>
   <script src="js/base/menu.js"></script>
   <script src="js/base/banco.js"></script>
   <script type="module">
     const eu = await iniciarPagina();
     // código da página aqui
   </script>
   ```
4. Adicione a página no grupo correspondente em `frontend/js/base/menu.js` (`GRUPOS_MENU`).

---

## Regras de Responsividade (Celulares de 320px até Telas Grandes)

Inspirado na engenharia reversa de sistemas de layout fluido (**Every Layout** e **Utopia**), todo CSS novo em `frontend/css/style.css` deve seguir estas 5 regras (protegidas pelo guardrail `testes/8-responsividade.test.js`):

1. **Grids Intrínsecos (`min(Npx, 100%)`):**
   * **Nunca** escreva `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))` seco, porque numa tela de `320px` (com `24px` de bordas sobram `296px`) a coluna de `300px` estoura a tela para o lado.
   * **Sempre** use: `repeat(auto-fill, minmax(min(300px, 100%), 1fr))`. Assim, em telas menores que `300px`, o cartão encolhe para `100%` sozinho sem precisar de dezenas de `@media`.
2. **Variáveis Fluidas de Espaçamento (`--pad-tela` e `--pad-caixa`):**
   * Use `var(--pad-tela)` (`clamp(12px, 4vw, 24px)`) para margens laterais de página e `var(--pad-caixa)` (`clamp(14px, 3vw, 20px)`) para o recheio das `.caixa` e modais.
3. **Altura de Tela Real no Celular (`100dvh`):**
   * Sempre que usar `100vh` (como em `.capa`, `.tela-login` ou `.painel-menu`), coloque na linha de baixo a versão com `100dvh`, que desconta a barra de endereço retrátil do navegador do celular.
4. **Proibido `width` ou `min-width` fixo maior que `320px`:**
   * Para janelas e caixas largas, use sempre `max-width: 720px` ou `width: min(720px, 94vw)`.
5. **Fontes de Formulário `>= 16px` no Celular:**
   * Mantenha `font-size: max(16px, 0.95rem)` em `input, textarea, select` para impedir que o Safari do iPhone dê zoom sozinho na tela ao tocar num campo.

---

## Preferências Visuais e Segredos

* **Fontes:** `Coustard Black` apenas para o nome "Katequese" (`.fonte-nome`); `Archivo` para todo o resto.
* **Estilo:** Fundo neutro, superfícies um tom acima e uma única cor de destaque (`--destaque`). Sem degradês ou brilhos artificiais.
* **Segredos da página inicial (`index.html`):**
  * Clicar nas letras do nome "Katequese" solta frases (`gritos`), com mensagens especiais no 10º e 25º clique.
  * Digitar `"katequese"` no teclado solta chuva de confete.
* **Temas Globais (`frontend/js/tema.js`):**
  * **Halloween (`decorarHalloween`):** varal, teias com aranha, morcegos voando com física suave, abóboras, velas, doces, lápides, caldeirão e lua (clicar faz chover doces).
  * **Natal (`decorarNatal`, prefixo `nt-`):** neve caindo, pisca-pisca (clique muda o modo), sinos com som (Web Audio), trenó que solta presentes, árvore, boneco de neve, estrela-guia (nevasca) e **guerra de bola de neve** (clicar no monte de neve pega uma bola, o próximo clique arremessa e cada decoração reage; `Esc` solta).
