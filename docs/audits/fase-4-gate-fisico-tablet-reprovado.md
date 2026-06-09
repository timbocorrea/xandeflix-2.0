# RELATÓRIO DE BLOQUEIO — FASE 4 — GATE FÍSICO TABLET REPROVADO

## 1. Contexto

A Fase 4 tinha como objetivo iniciar a migração controlada de Filmes/Séries para adapters/modelos neutros.

Antes de qualquer alteração funcional em Filmes/Séries, havia um gate obrigatório: validar o checkpoint da Fase 3 em APK nos dispositivos físicos.

## 2. Branch validada

Branch validada:

- feat/live-tv-neutral-adapter-pos-fase2

Checkpoint esperado da Fase 3:

- 352b780 docs(live-tv): fix neutral adapter report formatting

## 3. Resultado por dispositivo

### Fire Stick

Resultado: aprovado.

Checklist informado:

- app abre sem crash: sim
- Home abre: sim
- /live abre: sim
- grupos aparecem: sim
- canais aparecem: sim
- D-pad grupos: sim
- D-pad canais: sim
- OK no canal troca preview: sim
- OK no mesmo canal abre fullscreen: sim
- voltar do player funciona: sim
- layout TV com colunas preservado: sim
- problema visual: não

### Tablet Samsung SM-X610

Dispositivo ADB:

- RX2X301Q3KY

Resultado: reprovado.

Problemas informados:

- app abre sem crash: sim
- /live abre: sim
- retrato não mostra preview no topo
- select de grupo não aparece; continua em colunas como paisagem
- select de canal não aparece; continua em colunas como paisagem
- preview troca: sim
- bottom nav preservado: sim
- paisagem/tablet não quebrou
- fontes em /live ficaram pequenas
- preview inline deslocado para cima, próximo/acima da barra de status
- contorno da coluna de grupos corta nas bordas
- fontes em /filmes ficaram pequenas no hero e nos títulos das linhas
- fontes em /series também diminuíram

## 4. Diagnóstico realizado

Foram executadas inspeções sem alteração de código e confirmado:

- TypeScript passou.
- diff check passou.
- o tablet conectado correto é RX2X301Q3KY / SM_X610.
- métricas físicas ADB:
  - Physical size: 1600x2560
  - Physical density: 340
  - Override density: 300
- a Fase 3 alterou código funcional principalmente em:
  - src/features/live/pages/LiveTvPage.tsx
  - camada neutra em src/features/neutralData
- o problema visual do tablet impede aprovação do gate físico.

## 5. Tentativas experimentais não aprovadas

Foram testadas tentativas locais de ajustar a condição responsiva da Live TV para tablet retrato.

As tentativas não resolveram os sintomas reportados no tablet.

Por segurança, os patches experimentais não devem ser considerados aprovados para commit, push, PR ou merge.

## 6. Decisão de governança

A Fase 4 funcional está bloqueada.

Não iniciar migração de Filmes/Séries para camada neutra enquanto o gate físico da Fase 3 estiver reprovado no tablet.

## 7. Recomendação

Abrir uma etapa corretiva antes da Fase 4 funcional:

- Fase 3B — Correção responsiva pós-adapter da Live TV em tablet retrato

Objetivo recomendado:

- auditar detecção real de viewport/formFactor/inputMode no WebView Android;
- corrigir layout de /live no tablet retrato;
- preservar Fire Stick;
- preservar player;
- preservar D-pad;
- preservar Supabase/licensing;
- validar novamente APK no Fire Stick e no tablet;
- só depois liberar a Fase 4 de Filmes/Séries.

## 8. Status final recomendado

- FASE 4 BLOQUEADA
- GATE FÍSICO TABLET REPROVADO
- FIRE STICK APROVADO
- TABLET REPROVADO
- NÃO CRIAR PR
- NÃO FAZER MERGE
- NÃO ALTERAR FILMES/SÉRIES AINDA
