# Funcionalidades do Grupo (Regras de Negócio)

Resumo de como funcionam as abas sociais e políticas do site para consulta rápida ao dar manutenção.

---

## 1. Membros e Contadores (`membros.html` e `index.html`)

* **Duas abas em Membros:** *Katequistas* e *Visitantes*, separadas por `ehKatequistaPerfil(pessoa, tags)` (`frontend/js/banco.js`).
* **Contadores na capa (`index.html`):** "membros" conta os Katequistas e "visitantes" conta os demais aprovados.
* **Nível da Economia:** aparece no cartão de cada membro em `membros.html` e no `perfil.html`.

---

## 2. Eventos e Aniversários (`eventos.html` e `index.html`)

* **Presença (`presencas`):** cada evento tem os botões *Vou / Talvez / Não vou* (clicar na mesma opção remove a resposta), avatares de quem vai e lista expansível de nomes. Só Katequistas respondem, até o dia do evento.
* **Horário opcional:** quando um evento é criado sem hora definida, `inicioEvento(ev)` considera `23:59` para que ele continue aparecendo como "Próximo encontro" na página inicial durante todo o dia do evento.
* **Aniversários (`perfis.aniversario`):** preenchido no Perfil. A página inicial destaca os aniversariantes de hoje e lista os próximos; o ano de nascimento nunca é exibido. Quem nasceu em `29/02` comemora em `01/03` nos anos não bissextos.

---

## 3. Mural: Anúncios Oficiais e Recados (`mural.html`)

* **Abas:** abre por padrão em *Anúncios oficiais*; `#recados` abre direto nos *Recados*.
* **Anúncios oficiais:** só Presidente, Deputado ou Admin publicam (`pode_anunciar()`). A opção *Prioridade* (topo + destaque na página inicial) só pode ser marcada por Presidente ou Admin (`pode_priorizar()`).
* **Recados:** só Katequistas escrevem (até 1.000 caracteres) e escolhem se visitantes podem ver. Admin pode fixar no topo; autor ou Admin apaga.
* **Na página inicial:** mostra o anúncio prioritário mais recente + os 3 últimos recados (sem formulário de escrita para manter a capa limpa).

---

## 4. Cargos e Hierarquia de Tags (`frontend/js/banco.js` e `dados.js`)

* **Ordem (`tags.ordem`):** menor número = mais alto na hierarquia.
  * `Admin` (não é tag, fica sempre no topo: `-1`) → `Presidente` (`10`) → `Deputado` (`20`) → outras tags criadas pelo Admin (`~100–500`) → `Katequista` (`900`) → `Visitante` (`950`).
* **Exibição ao lado do nome (`cargosVisiveis`):**
  * Mostra apenas o cargo mais alto da pessoa (priorizando sempre tags acima de `Katequista`/`Visitante`).
  * Admins mostram `"Admin"` + o próximo cargo político/especial (escondendo `Katequista`/`Visitante`).
  * Todas as demais tags da pessoa aparecem completas em *Membros* e no *Perfil*.

---

## 5. Enquetes (`enquetes.html`) e Sorteios (`sorteios.html`)

* **Enquetes:** Katequista cria com duração, imagem opcional, única ou múltipla escolha, voto anônimo, visibilidade para visitantes e se visitantes podem votar. Voto pode ser alterado ou retirado enquanto aberta.
* **Sorteios:** Katequista cria com lista de itens (2 a 200), opção *"Não repetir"* e visibilidade para visitantes.
  * Só o autor ou Admin sorteia; o item vencedor é escolhido no banco (`sortear()`) e salvo em `sorteio_resultados`.
  * A janela tem link direto (`sorteios.html#ID`) e botão *"Rever animação"*.

---

## 6. Política, Eleições e Câmara de Leis (`politica.html` e `frontend/modulos/politica/leis.js`)

* **Sub-abas de `politica.html`:**
  1. **Governo:** presidente atual, 4 deputados, candidatos (enquanto a eleição não encerrou, só para Katequistas) e cartão da eleição (com link do site de votação restrito a Katequistas). Em `Admin → Política`, vincular o membro sincroniza automaticamente as tags `Presidente` e `Deputado` (`sincronizar_cargos_politica`).
  2. **Leis em vigor:** visível para todos os aprovados (leis ativas e histórico de revogadas com texto completo).
  3. **Câmara:** visível para Katequistas. Mostra propostas/ideias em andamento e histórico paginado (`htmlPaginacao`).
  4. **Gestão:** visível para Presidente, Deputados ou Admin (`propor_lei` para criar, alterar ou revogar uma lei).
* **Regras de propostas, ideias de Deputados e votação (`supabase-17.sql` a `supabase-20.sql`):**
  * **Iniciativa do Presidente (ou Admin):** a proposta entra direto em votação na Câmara (`status = 'camara'`).
  * **Ideia de Deputado (`status = 'sugestao'`):** o Deputado envia a ideia para a mesa do Presidente. O Presidente avalia em Gestão (`avaliar_sugestao`): se aprovar, escolhe o prazo e envia para a Câmara mantendo os créditos (*"Ideia de [Deputado] · Enviada à Câmara por [Presidente]"*); se recusar, é arquivada.
  * Só quem tem a tag `Deputado` vota na Câmara (`votar_camara`), com voto secreto enquanto aberta e votos nominais visíveis após encerrar.
  * Encerra quando o prazo acaba **ou** quando todos os deputados já votaram (se houver pelo menos 1 deputado cadastrado).
  * **Mais Sim:** aprovada e entra em vigor na hora (`aplicar_proposta`), salvando o texto anterior quando for alteração.
  * **Mais Não:** rejeitada.
  * **Empate (2 a 2):** o Presidente (ou Admin) escolhe entre arquivar (`arquivar_proposta`) ou levar ao **Voto Popular** (`levar_ao_voto_popular`), onde todos os Katequistas votam em segredo (`votar_popular`). Empate no voto popular mantém como está (rejeita).
