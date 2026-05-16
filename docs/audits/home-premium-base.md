# Fase 4.11-B2 - Home premium base

## 1. Objetivo

Elevar a experiencia visual da Home/Catalogo para uma base premium de app de streaming em TV, sem alterar backend, contratos de dados, Live TV, Player, Admin, Supabase ou Android.

## 2. Arquivos alterados

- `src/components/media/CatalogHero.tsx`
- `src/components/tv/FocusableMediaCard.tsx`
- `src/features/catalog/data/catalogSections.ts`
- `src/features/catalog/pages/CatalogPage.tsx`

## 3. Melhorias visuais aplicadas

- Hero com composicao mais cinematografica:
  - hierarquia de titulo/subtitulo reforcada;
  - painel lateral de contexto ("Panorama rapido");
  - botoes principais maiores e com contraste melhor para TV.
- Secoes da Home com estrutura mais editorial:
  - container por secao com borda/fundo dedicados;
  - descricao de secao;
  - contador de itens visiveis para leitura rapida.
- Cards mais premium:
  - fallback visual com gradiente por paleta;
  - badge superior;
  - rodape com metadata mais legivel.
- Estado de carregamento intencional:
  - placeholders de secoes extras enquanto o modo progressivo de TV ainda esta carregando.
- Estado vazio da Home e das secoes:
  - mensagens claras para ausencia de conteudo.

## 4. Cuidados com D-pad

- Focus keys existentes foram preservadas:
  - `hero-play-button`, `hero-info-button`, `catalog-section-*-item-*`.
- Nao foram introduzidos elementos focaveis extras desnecessarios.
- Botoes de Hero e cards continuam com componentes focaveis existentes (`FocusableButton` e `FocusableMediaCard`).
- Fluxo de navegacao principal Hero -> secoes -> cards foi mantido.

## 5. Cuidados com Fire Stick

- Sem aumento de itens iniciais renderizados na Home.
- Mantido carregamento progressivo de secoes para TV.
- Sem video autoplay na Home.
- Sem dependencia nova.
- Sem uso de blur em massa em listas inteiras.
- Sem animacao continua pesada; apenas transicoes leves e placeholders de loading pontuais.

## 6. O que nao foi alterado

- Nao altera Admin.
- Nao altera Supabase.
- Nao altera Edge Functions.
- Nao altera migrations/schema.
- Nao altera Android/Capacitor.
- Nao altera Live TV.
- Nao altera Player universal.
- Nao altera regras de licenciamento.

## 7. Proximas fases recomendadas

1. `4.11-B3` para Live TV premium (layout, navegacao e preview orientados a TV).
2. `4.11-B4` para overlay premium do Player (UX final, reduzindo interface tecnica de diagnostico).
3. `4.11-B5` para polimento dedicado de D-pad (foco inicial/fallback por rota).
4. `4.11-B6` para performance Fire Stick (tuning de renderizacao e chunks).
