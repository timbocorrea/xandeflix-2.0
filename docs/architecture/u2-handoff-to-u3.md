# Handoff da U2 para a U3 — Catálogo Local e Classificador Canônico

Este documento estabelece as diretrizes de handoff da implementação candidata da U2, validada localmente e aguardando commit e gates, para o início dos trabalhos na **Issue U3**.

---

## 1. Contexto Geral e Metadados da U2

```yaml
PROJETO=Xandeflix 2.0
ISSUE_CONCLUIDA=U2_CANDIDATA
BASE_SHA=ad231b42a1839d5d50a3ac0e542314ea3ff975fb
BRANCH=feat/issue-u2-universal-raw-catalog-local-first
HEAD_FUNCIONAL=140180491467cd99163f00cce63fb3219743d4a3
HEAD_FINAL=RESOLVIDO_PELO_HEAD_DA_PR
PR=PREENCHER_APOS_CRIACAO
STATUS_PR=NAO_CRIADA
DATA_GOVERNANCE=PASS_LOCAL
BUILD=PASS_LOCAL
LINT_NOVOS_ARQUIVOS=PASS
LINT_LINHAS_U2=PASS
GLOBAL_LINT=FAIL_BASELINE
DIFF_CHECK=PASS
FIRE_STICK_GATE=PENDENTE_VALIDACAO_FISICA
TABLET_GATE=PENDENTE_VALIDACAO_FISICA
MOBILE_DATA_GATE=PENDENTE_VALIDACAO_FISICA
```

A **Issue U2** estruturou a fundação local-first de VOD de filmes baseada em IndexedDB. Ela implementou a ingestão em background via carregador progressivo de playlists M3U, persistência sanitizada e determinística (SHA-256) e a integração dos dados na Home e na página de Categorias de filmes com fallback transparente para o Supabase.

---

## 2. Recomendações e Objetivos para a Issue U3

O foco recomendado para a **Issue U3** é expandir a maturidade da ingestão e consolidar a classificação canônica do catálogo.

### Objetivos Principais da U3
1.  **Consolidar o Classificador Canônico**: Refatorar e formalizar as regras de classificação em `classifyChannelContent` para mapear com precisão filmes, canais de TV ao vivo, rádios e estruturas complexas de séries.
2.  **Ingestão Xtream**: Implementar adaptadores específicos para a ingestão via API Xtream (que trafega metadados formatados de forma diferente de playlists M3U estruturadas por EXTINF), salvando canais no mesmo catálogo IndexedDB da U2.
3.  **Metadados Estruturados de Séries**: Implementar a persistência estruturada de Séries, Temporadas e Episódios (armazenando `seriesName`, `seasonNumber`, `episodeNumber`) no IndexedDB.
4.  **Preservação de Fallbacks e Flexibilidade**:
    *   O enriquecimento via TMDB **não** deve se tornar obrigatório para a visibilidade dos cards (cards sem metadados TMDB devem renderizar com informações básicas da playlist).
    *   Preservar integralmente o fallback remoto da API/Supabase caso a base local esteja em transição, indisponível ou ocorram erros de banco.

---

## 3. Branch e Estrutura Recomendada para a U3

*   **Branch Recomendada**: `feat/issue-u3-universal-catalog-xtream-classification`
*   **Estratégia de Integração**: A U3 deve partir da `main` após o merge controlado da U2, e não diretamente da branch ainda não mergeada.

---

## 4. Plano de Rollback Pós-Commit

Caso seja necessário reverter a implantação da Issue U2 pós-commit, utilize os seguintes comandos em ordem reversa:

1.  `git revert <HEAD_DOCUMENTAL_DA_PR>` (Reverte documentações)
2.  `git revert 140180491467cd99163f00cce63fb3219743d4a3` (Reverte alterações visuais na Home/Categorias)
3.  `git revert e60dfae6101ef52ba1a521aaca0da9c540799004` (Reverte IndexedDB v2 e parser progressivo)

### Notas Operacionais importantes:
*   Reverter o código não reduz automaticamente a versão do IndexedDB.
*   Bancos já atualizados para versão 2 permanecem nessa versão.
*   Stores e índices adicionais não devem ser apagados automaticamente.
*   O rollback operacional deve preservar os dados locais e de fallback remoto.
