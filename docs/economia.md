# Economia (`K$`) e Minijogos (`frontend/js/economia.js` e `minijogos.js`)

A Economia é exclusiva para **Katequistas** (visitantes só veem a sub-aba *Ranking*).
Todo membro começa com **K$ 500** ao abrir a carteira pela primeira vez.

---

## 1. Segurança do Dinheiro

* Nenhuma tabela de saldo ou inventário aceita `INSERT`/`UPDATE` direto do navegador.
* Toda operação passa por funções `security definer` no banco: `abrir_carteira`, `bonus_diario`, `comecar_trabalho`, `trabalhar(id, desempenho)`, `transferir`, `comprar`, `comprar_equipamento`, `usar_item`, `vender_item`, `apostar(jogo, valor, escolha)` e `admin_ajustar_saldo`.
* A função interna `mexer_saldo` tem `REVOKE EXECUTE` para `public, anon, authenticated`.

---

## 2. Fórmulas de Nível e XP

* **Nível Geral:** `floor(sqrt(xp / 50)) + 1` (Nível 2 = 50 XP, Nível 3 = 200 XP, Nível 4 = 450 XP...).
  * Transferências entre membros só liberam a partir do **Nível Geral 3** (evita criação de contas extras só para transferir os K$ 500 iniciais).
* **Nível na Profissão:** `floor(sqrt(xp / 3)) + 1` (cada nível na profissão paga **+10%**).
* **Ganho de XP:**
  * Turno de trabalho: `trabalhos.xp_geral` (3 a 8 XP base, aumentado por itens de XP) + `1 XP` na profissão (`+2 XP` se o desempenho no minijogo for `>= 70`).
  * Bônus diário: `+5 XP`.
  * Aposta no cassino: `+2 XP`.
  * Compra na loja: `+3 XP` (devolvidos se o item for revendido via `vender_item`).

---

## 3. Profissões, Turnos e Minijogos (`frontend/js/minijogos.js`)

Todas as 5 profissões são liberadas desde o nível 1 e balanceadas para render ~130–145 K$/h jogando bem:

| ID | Profissão | Espera base | Pagamento base | Extra | Minijogo |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `entregador` | Entregador | 5 min | K$ 8 a 16 | Gorjeta | **Rota de entregas:** clicar nos pontos 1..8 na ordem certa. |
| `churrasqueiro` | Churrasqueiro | 8 min | K$ 14 a 24 | Gorjeta | **Ponto da carne:** tirar 12 carnes quando a barra estiver na faixa verde. |
| `dj` | DJ | 12 min | K$ 20 a 36 | Cachê extra | **Sequência:** repetir a sequência de 6 rodadas que acende nos pads. |
| `programador` | Programador | 15 min | K$ 25 a 45 | Bônus do cliente | **Caça aos bugs:** clicar nos bugs antes de sumirem, sem clicar nos testes `✓`. |
| `empresario` | Empresário | 20 min | K$ 30 a 56 | Investidor | **Negociação:** fechar 5 acordos quando o marcador passa na faixa. |

* **Fluxo do turno:** `comecar_trabalho(id)` já inicia o tempo de espera no banco (fechar no meio perde o turno). `trabalhar(id, desempenho)` só aceita entre **4 segundos e 5 minutos** depois.
* **Cálculo do pagamento:** `sorteio(min..max) × (1 + 0,1 × (nivel_prof - 1)) × (1 + bônus_pagamento) × (0,4 + 0,6 × desempenho/100)`.
* **Extra:** chance = `chance_extra + equipamentos + itens + até 15% pelo desempenho`; paga de 25% a 60% a mais.

---

## 4. Equipamentos e Itens da Loja

* **Equipamentos de trabalho (`equipamentos`):** organizados em **linhas** por profissão (ex: `bicicleta → moto → carro`). Em cada linha, **vale apenas o melhor equipamento** que a pessoa tem (`efeitos_trabalho`).
* **Outros itens da loja (`itens_loja`):** criados/editados pelo Admin em *Economia → Admin*, com foto na pasta `loja/`.
  * Atributos possíveis: `pagamento`, `espera`, `extra`, `ajuda`, `xp` (todos ou para um `trabalho_alvo`), `diario` (K$ fixo), `rendimento` (% do saldo no bônus diário, até K$ 2.000 e teto de 5%), `cassino_premio`, `cassino_volta` (cashback até 50%), `desconto` (até 50%), `revenda`, `limite` por pessoa e `duracao_horas` (vazio = permanente; preenchido = consumível ativado com `usar_item`).
  * Cada item distinto conta uma única vez em `bonus_itens()` (ter 3 iguais no inventário não triplica o bônus).
  * A redução total de espera (equipamentos + itens) tem teto máximo de **60%** (`0.6`).
  * **Revenda (`vender_item`):** calcula a devolução sobre o preço **com o desconto do jogador** (`floor(ceil(preco * (1 - desconto)) * revenda)`), impedindo comprar com desconto e vender mais caro.

---

## 5. Cassino Katequista e Dono do Cassino (`frontend/modulos/economia/cassino.js`)

* **Concessão Mensal ("Dono do Cassino"):**
  * Qualquer Katequista pode comprar o Cassino quando estiver sem dono (ou quando os 30 dias do dono anterior terminarem) por **K$ 25.000** (valor configurável em *Economia → Admin*, chave `cassinoPreco`).
  * Durante os **30 dias** de mandato, o dono recebe automaticamente **25% de todas as perdas líquidas dos outros jogadores** (`pagar_comissao_dono`). O próprio dono nunca recebe comissão da própria derrota.
* **6 Jogos Disponíveis (apostas de K$ 10 a K$ 50.000):**
  1. **Revoada da Katequese (`aviator`):** o avião sobe com multiplicador exponencial (`M(t) = e^(0.12*t)`) e RTP de 97%. O ponto de crash fica oculto em `partidas_cassino` até o voo acabar (`iniciar_aviator`, `checar_aviator`, `sacar_aviator`).
  2. **Campo Minado do Churrasco (`bomba`):** tabuleiro `5×5` (25 casas) com 1 a 24 bombas ocultas no banco (`iniciar_bomba`, `abrir_casa_bomba`, `sacar_bomba`). Multiplicador cresce a cada estrela aberta; pode retirar após qualquer acerto.
  3. **Tigrinho da Katequese (`tigrinho`):** grade `3×3` com **5 linhas de pagamento** (3 horizontais + 2 diagonais). 6 símbolos (Laranja `0.5×`, Chopp `1.2×`, Churrasco `2.5×`, Ouro `5×`, Troféu `12×` e Tigrinho `25×` que vale como **Coringa/WILD**). Fechar as 5 linhas ativa o bônus **Tela Cheia 10×**.
  4. **Cara ou Coroa (`moeda`):** 50/50, paga `2×`.
  5. **Roleta (`roleta`):** números `0` a `36` (ordem europeia). Vermelho ou preto pagam `2×`; verde (`0`) paga `36×`.
  6. **Caça-níquel Clássico (`slots`):** 3 rolos de 1 linha. 3 iguais pagam de `5×` a `100×`; 2 cerejas devolvem a aposta.
