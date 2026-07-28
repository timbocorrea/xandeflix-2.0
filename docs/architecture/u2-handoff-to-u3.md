# Handoff da U2 para a U3 — Catálogo Local e Classificador Canônico

Este documento estabelece as diretrizes de handoff da implementação candidata da U2, commitada e publicada na PR #21, ainda aguardando gates físicos e revisão técnica, para o início dos trabalhos na **Issue U3**.

---

## 1. Contexto Geral e Metadados da U2

```yaml
PROJETO=Xandeflix 2.0
ISSUE_CONCLUIDA=U2_CANDIDATA
BASE_SHA=ad231b42a1839d5d50a3ac0e542314ea3ff975fb
BRANCH=feat/issue-u2-universal-raw-catalog-local-first
HEAD_FUNCIONAL=140180491467cd99163f00cce63fb3219743d4a3
HEAD_DOCUMENTAL_INICIAL=d16687571b0b4ae421e9453735c7dca3f1504a8b
HEAD_FINAL=RESOLVIDO_PELO_HEAD_ATUAL_DA_PR
PR=#21
STATUS_PR=open / Draft / não mergeada
DATA_GOVERNANCE=PASS_REMOTO_NO_HEAD_D166875
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

O workflow remoto havia passado no head documental inicial `d16687571b0b4ae421e9453735c7dca3f1504a8b`. Qualquer novo head documental da PR deve ter o workflow revalidado antes de Ready for Review.

---

## 2. Recomendações e Objetivos para a Issue U3

O foco recomendado para a **Issue U3** é expandir a maturidade da ingestão e consolidar a classificação canônica do catálogo.

### Objetivos Principais da U3
1. **Consolidar o Classificador Canônico**: Refatorar e formalizar as regras de classificação em `classifyChannelContent` para mapear com precisão filmes, canais de TV ao vivo, rádios e estruturas complexas de séries.
2. **Ingestão Xtream**: Implementar adaptadores específicos para a ingestão via API Xtream, salvando canais no mesmo catálogo IndexedDB da U2.
3. **Metadados Estruturados de Séries**: Implementar a persistência estruturada de Séries, Temporadas e Episódios, incluindo `seriesName`, `seasonNumber` e `episodeNumber`.
4. **Preservação de Fallbacks e Flexibilidade**:
   - O enriquecimento via TMDB não deve se tornar obrigatório para a visibilidade dos cards.
   - O fallback remoto da API/Supabase deve ser preservado quando a base local estiver em transição, indisponível ou com erro.

---

## 3. Branch e Estrutura Recomendada para a U3

- **Branch Recomendada**: `feat/issue-u3-universal-catalog-xtream-classification`
- **Estratégia de Integração**: A U3 deve partir da `main` após o merge controlado da U2, e não diretamente da branch ainda não mergeada.

---

## 4. Plano de Rollback Pós-Commit

Caso seja necessário reverter a implantação da Issue U2 após a integração, utilize os seguintes comandos na ordem inversa:

1. `git revert <HEAD_DOCUMENTAL_DA_PR>` — reverte documentação e handoff.
2. `git revert 140180491467cd99163f00cce63fb3219743d4a3` — reverte a integração da Home e de Filmes.
3. `git revert e60dfae6101ef52ba1a521aaca0da9c540799004` — reverte IndexedDB v2, parser progressivo e importação local.

### Notas operacionais
- Reverter o código não reduz automaticamente a versão do IndexedDB.
- Bancos já atualizados para versão 2 permanecem nessa versão.
- Stores e índices adicionais não devem ser apagados automaticamente.
- O rollback operacional deve preservar dados locais e o fallback remoto.
