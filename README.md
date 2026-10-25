# Katequese

Plataforma privada do grupo **Katequese** — eventos, mídias, mural, enquetes, sorteios, sistema político (governo, eleições e Câmara de Leis) e economia gamificada (`K$`).

**Desenvolvedores:** Gregory, Bruno e Kayo.

---

## Estrutura de Pastas

```text
Katequese/
├── frontend/
│   ├── *.html              # Páginas do site
│   ├── css/style.css       # Estilos, paletas e temas globais (Halloween/Natal)
│   └── js/
│       ├── base/           # Scripts globais (config, banco, dados, menu, tema)
│       └── paginas/        # Scripts de páginas específicas (economia, minijogos, leis)
├── backend/
│   └── sql/                # Migrações e funções do Supabase (supabase.sql até supabase-18.sql)
├── testes/                 # Testes automatizados e guardrails de arquitetura
├── docs/                   # Documentação dividida por assunto
└── CLAUDE.md               # Índice rápido e regras principais
```

---

## Como rodar no computador

1. Suba um servidor estático apontando para a pasta `frontend`:
   ```bash
   # Windows
   python -m http.server 5173 -d frontend

   # Mac / Linux
   python3 -m http.server 5173 -d frontend
   ```
2. Abra `http://localhost:5173` no navegador.

---

## Como rodar os testes e guardrails

Antes de fazer commit, rode no terminal (precisa apenas do Node.js instalado, sem `npm install`):

```bash
node --test testes/*.test.js
```

---

## Documentação (`docs/`)

* [`docs/arquitetura.md`](docs/arquitetura.md) — Funcionamento do front-end, como criar páginas novas, temas e estilo visual.
* [`docs/backend-banco.md`](docs/backend-banco.md) — Tabelas do Supabase, índice de funções SQL e como criar um novo `supabase-N.sql`.
* [`docs/funcionalidades.md`](docs/funcionalidades.md) — Regras de Eventos, Mídias, Mural, Enquetes, Sorteios, Cargos e Câmara de Leis.
* [`docs/economia.md`](docs/economia.md) — Regras da moeda `K$`, níveis, minijogos, equipamentos, loja e cassino.
* [`docs/seguranca-e-guardrails.md`](docs/seguranca-e-guardrails.md) — Fluxo de trabalho entre os 3 devs, segurança e como criar testes.
