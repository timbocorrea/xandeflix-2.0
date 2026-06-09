# RELATÓRIO FINAL — FASE 3 — LIVE TV ADAPTER NEUTRO

## 1. Branch usada

Branch:

```txt
feat/live-tv-neutral-adapter-pos-fase2
2. Base da branch

Base oficial da Fase 3:

9e9b7ab docs(data): add neutral data layer phase report

A branch foi criada a partir do checkpoint final da Fase 2.

3. Commit técnico criado

Commit técnico local:

39bede5 feat(live-tv): add neutral live channel adapter
4. Arquivos criados
src/features/neutralData/lib/liveTvAdapter.ts
src/features/neutralData/types/neutralLiveTv.types.ts
5. Arquivos alterados
src/features/live/pages/LiveTvPage.tsx
src/features/neutralData/index.ts
src/features/neutralData/lib/index.ts
src/features/neutralData/types/index.ts
6. O layout foi alterado?

Não.

A Fase 3 não alterou classes visuais, CSS global, estrutura visual da página, responsividade validada, sidebar, colunas, selects mobile, preview panel ou D-pad visual.

A alteração na LiveTvPage.tsx foi restrita à criação de uma ponte neutra para derivação de grupos e canais ativos.

7. D-pad foi alterado?

Não.

As funções de navegação por foco, FocusableButton, onArrowPress, onEnterPress, foco inicial e navegação lateral não foram alteradas.

8. Player foi alterado?

Não.

O fluxo de player/preview continuou usando o modelo legado IptvChannel em runtime.

Não houve alteração em:

src/features/player/
android/
NativePlayerActivity
detectStreamKind
createNativeAndroidPlayerAdapter
createLiveTvPreviewAdapter
UniversalPlayerPage
9. Supabase functions/migrations foram alteradas?

Não.

Não houve alteração em:

supabase/
supabase/functions/
supabase/migrations/

A Fase 3 também não criou cache novo no Supabase e não reforçou armazenamento centralizado de dados IPTV.

10. Tipos/helpers/adapters criados

Foram criados tipos neutros específicos para Live TV:

NeutralLiveChannel
NeutralLiveChannelIdentity
NeutralLiveChannelVisual
NeutralLiveChannelRuntimePlayback
NeutralLiveChannelRuntimeSourceMode

Arquivo:

src/features/neutralData/types/neutralLiveTv.types.ts

Foi criado adapter puro:

mapIptvChannelToNeutralLiveChannel()
mapIptvChannelsToNeutralLiveChannels()
buildNeutralLiveChannelFingerprint()

Arquivo:

src/features/neutralData/lib/liveTvAdapter.ts
11. Como stream_url/url de reprodução foi tratado

A URL de reprodução herdada de IptvChannel.url foi tratada como referência efêmera de runtime:

playbackRef
runtimeOnly: true
nonPersistable: true

Isso deixa explícito que o dado pode existir em memória para tocar vídeo, mas não deve ser persistido em Supabase, banco central, analytics remoto ou cache remoto.

12. O que ficou runtime-only

Ficou runtime-only:

NeutralLiveChannelRuntimePlayback.playbackRef
NeutralLiveChannelRuntimePlayback.sourceMode

Marcadores obrigatórios criados:

runtimeOnly: true
nonPersistable: true
13. O que ficou persistível

Nesta fase, nada novo foi persistido.

A identidade neutra criada é apenas preparatória:

NeutralLiveChannelIdentity.fingerprint
NeutralLiveChannelIdentity.legacyChannelId
NeutralLiveChannelVisual.name
NeutralLiveChannelVisual.groupName
NeutralLiveChannelVisual.logoUrl

Esses campos foram usados para renderização/agrupamento em runtime, não para persistência.

14. Dependências legadas ainda existentes

A LiveTvPage.tsx ainda depende de fontes legadas, intencionalmente, para preservar funcionamento:

IptvChannel
usePlaylistRuntime()
loadFromSource()
loadFromChannels()
listAuthorizedLicenseChannels()
getCachedLiveTvCriticalChannels()
storeCachedLiveTvCriticalChannels()
getCachedAppBootstrapResult()

O fluxo legado não foi removido nesta fase.

A ponte criada permite que fases futuras substituam gradualmente a origem dos dados sem redesenhar a UI.

15. Integração feita na LiveTvPage

Foi criado um view-model interno:

NeutralLiveChannelViewModel

Composto por:

legacyChannel: IptvChannel
neutralChannel: NeutralLiveChannel

A página passou a derivar:

groups
activeGroupChannelViewModels
activeGroupChannels

a partir do modelo neutro, preservando legacyChannel para reprodução.

16. Validações executadas
TypeScript

Resultado:

TSC_EXIT_CODE=0
Diff check

Resultado:

DIFF_CHECK_EXIT_CODE=0
CACHED_DIFF_CHECK_EXIT_CODE=0
Vite build

Comando executado com outDir temporário:

npx.cmd --no-install vite build --outDir .tmp/vite-live-neutral-build --emptyOutDir

Resultado:

VITE_BUILD_EXIT_CODE=0

Observação: Vite exibiu aviso não bloqueante de chunks acima de 500 kB.

Auditoria de escopo bloqueado

Resultado:

NO_BLOCKED_SCOPE_FILES_CHANGED
17. Testes em dispositivos

Não houve APK nem teste físico em Fire Stick/tablet/mobile nesta fase até o fechamento deste relatório.

A validação executada foi técnica:

TypeScript
diff check
Vite build
auditoria de escopo
auditoria runtime-only
18. Riscos remanescentes
A Live TV ainda depende do runtime legado de playlist/licença.
Ainda existem chamadas legadas de cache crítico local/autorizado.
groupTitle ainda é lido do legado para formar identidade visual e agrupamento neutro.
O playback ainda usa IptvChannel.url, preservado por segurança para não quebrar reprodução.
Falta validação física em Fire Stick/tablet após geração de APK.
19. Pendências
Gerar APK debug, se a governança autorizar.
Instalar e validar no Fire Stick.
Validar tablet/mobile, principalmente:
grupos;
lista de canais;
select mobile;
preview inline;
abrir fullscreen;
retorno do player.
Em fase futura, evoluir de view-model local para fonte neutra mais formal.
Não remover legado até a Live TV estar validada em dispositivos.
20. Recomendação para Fase 4

A Fase 4 deve continuar a estratégia de migração controlada, sem refatoração ampla.

Recomendação:

Validar a Fase 3 em dispositivo antes de expandir.
Só depois aplicar a mesma estratégia a Filmes/Séries.
Para Filmes/Séries, separar:
identidade TMDB persistível;
metadados visuais;
referência de reprodução runtime-only;
vínculos que não devem ser persistidos com stream_url.
Não migrar tudo de uma vez.
Não remover Supabase functions ainda.
Não criar migrations.
Não misturar player, Android nativo, licensing ou layout.
21. Status final esperado do git

Após o commit do relatório, o esperado é:

branch: feat/live-tv-neutral-adapter-pos-fase2
working tree limpo
push: não executado
PR: não criada
merge: não executado
22. Conclusão

A Fase 3 cumpriu o objetivo de iniciar a migração da Live TV para uma camada neutra sem alterar layout, D-pad, player, Android nativo ou Supabase.

A tela /live ainda preserva o runtime legado para reprodução, mas grupos e canais ativos passaram a atravessar uma ponte neutra por meio de NeutralLiveChannelViewModel.

A URL de reprodução foi explicitamente tratada como dado efêmero de runtime e marcada como não persistível.

Status técnico:

APROVADA COMO CHECKPOINT LOCAL TÉCNICO, PENDENTE DE VALIDAÇÃO EM DISPOSITIVO.
