# Back-end e Banco de Dados (`backend/sql/`)

Todo o back-end roda no **Supabase** (PostgreSQL + Auth + Storage + Row Level Security).
Os arquivos de criação e evolução do banco ficam em **`backend/sql/`** (`supabase.sql` até `supabase-18.sql`).

---

## 1. Como funciona o Login

* O Supabase exige e-mail, mas o site usa apenas `@usuario`. Por baixo dos panos (`emailDe()` em `frontend/js/banco.js`), o usuário `joao` vira `kayorigo0+joao@gmail.com` (truque do `+` no Gmail).
* O Supabase exige no mínimo 6 caracteres na senha; por isso `senhaReal()` acrescenta `@kq` ao final da senha antes de enviar.
* *"Confirm email"* fica **desligado** no painel do Supabase.
* O primeiro cadastro com usuário `kayo` vira administrador automaticamente (`novo_usuario()`).

---

## 2. Níveis de Acesso (Garantidos por RLS no Banco)

* **Bloqueado (`status = 'recusado'`):** não lê nada no banco e vê a tela de acesso bloqueado.
* **Visitante (tag do sistema `Visitante`):** entra aprovado no cadastro (quando `visitantesAtivos` está ligado em Admin → Cadastro). Só vê eventos, fotos, recados, anúncios, sorteios e enquetes marcados com `visivel_visitantes = true`; só vota em enquetes com `visitantes_votam = true`; na Economia só vê o Ranking; pode trocar a própria foto de perfil (`perfis/<uid>/...`).
* **Katequista (tag do sistema `Katequista` ou `admin = true`):** acesso completo ao site, cria conteúdo, vota na Câmara popular e participa da Economia.
* **Presidente / Deputado (tags do sistema):** publicam anúncios oficiais no Mural; Deputados votam na Câmara (`votar_camara`); Presidente propõe leis (`propor_lei`), decide empates (`levar_ao_voto_popular`) e marca prioridade em anúncios.
* **Admin (`perfis.admin = true`):** gerencia membros, tags, tema global, frases, política, loja e vê o uso do espaço.

---

## 3. Mapa das Tabelas

* **Conta e Grupo:** `perfis`, `config` (linha única `id = 1` com JSON), `tags`, `perfil_tags`, `atualizacoes`.
* **Atividades e Mural:** `eventos`, `presencas`, `midias`, `recados`, `anuncios`, `enquetes`, `enquete_opcoes`, `enquete_votos`, `sorteios`, `sorteio_resultados`.
* **Política e Leis:** `politica`, `politica_link` (só Katequistas leem), `politica_eleicao` (só Katequistas leem), `leis`, `propostas_lei`, `votos_camara` (secreto), `votos_populares` (secreto).
* **Economia:** `carteiras`, `trabalhos`, `trabalho_niveis`, `transacoes`, `itens_loja`, `inventario`, `equipamentos`, `meus_equipamentos`, `efeitos_ativos`, `ultimas_apostas`.
* **Storage:** bucket privado `arquivos` (apenas `image/*`, limite de 10 MB por arquivo, URLs assinadas de 1 hora).

---

## 4. Onde está a versão mais recente de cada Função SQL

Quando precisar consultar ou alterar uma função, veja em qual arquivo de `backend/sql/` está a última definição dela:

| Função SQL | Último arquivo | O que faz |
| :--- | :--- | :--- |
| `eh_aprovado()`, `eh_admin()`, `proteger_perfil()` | `supabase.sql` | Checagem de aprovação/admin e proteção de `perfis`. |
| `uso_do_espaco()` | `supabase-3.sql` | Mede tamanho do banco e das fotos no Storage (só Admin). |
| `eh_katequista()`, `id_tag()`, triggers de tags | `supabase-4.sql` | Troca automática entre as tags `Katequista` e `Visitante`. |
| `criar_enquete()`, `votar()`, `resultados_enquetes()` | `supabase-5.sql` | Criação, votação e apuração de enquetes. |
| `evento_aberto()` | `supabase-9.sql` | Confere se o evento ainda não passou (fuso de Brasília). |
| `tem_tag()`, `pode_anunciar()`, `pode_priorizar()` | `supabase-12.sql` | Permissões de cargos políticos no Mural. |
| `nivel_de()`, `nivel_trabalho()`, `minha_carteira_travada()`, `mexer_saldo()`, `abrir_carteira()`, `admin_ajustar_saldo()` | `supabase-14.sql` | Base da Economia (`mexer_saldo` tem `REVOKE EXECUTE` para ninguém chamar direto). |
| `efeitos_trabalho()` | `supabase-15.sql` | Soma o melhor equipamento de cada linha na profissão. |
| `bonus_itens()`, `meus_bonus_itens()`, `comecar_trabalho()`, `trabalhar()`, `bonus_diario()`, `comprar()`, `comprar_equipamento()`, `usar_item()`, `transferir()` | `supabase-16.sql` | Ações da Economia somando equipamentos + atributos dos itens da loja. |
| `apostar()`, `propor_lei()`, `votar_camara()`, `votar_popular()`, `levar_ao_voto_popular()`, `arquivar_proposta()`, `propostas_situacao()` | `supabase-17.sql` | Cassino com espera entre apostas e sistema completo de Leis e Câmara. |
| `novo_usuario()`, `proteger_anuncio()`, `proteger_recado()`, `vender_item()`, `sortear()`, `pode_ver_arquivo()`, `pode_enviar_arquivo()`, `ordenar_tags()`, `apurar_proposta()` | `supabase-18.sql` | Correções de segurança, revenda com desconto, proteção de pastas do Storage, hierarquia de tags e apuração da Câmara. |

---

## 5. Como criar uma nova migração (`supabase-N.sql`)

1. Crie o próximo arquivo numerado em **`backend/sql/supabase-19.sql`**.
2. Escreva sempre de forma **idempotente** (que possa rodar mais de uma vez sem erro):
   * `create table if not exists`
   * `alter table ... add column if not exists`
   * `drop policy if exists ...` antes de cada `create policy`
   * `create or replace function`
3. Inclua no final do arquivo o `insert into public.atualizacoes ... where not exists (...)` registrando a mudança.
4. Rode `node --test testes/*.test.js` para o guardrail validar a sintaxe idempotente do SQL.
