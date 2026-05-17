# Handoff tecnico - Home premium, TMDB e D-pad

## 1. Contexto

Este handoff registra as alteracoes feitas apos a Fase 4.11-B2.1 para investigar e conter os problemas vistos no Fire Stick:

- HeroSection alternando sozinho;
- Hero carregando canais ao vivo em vez de filmes;
- cards exibindo fallback/generico em vez de capas TMDB;
- resposta do D-pad ficando lenta ou sem foco visivel;
- Home presa em carregamento ao tentar baixar a playlist direta.

A branch usada foi `fix/home-premium-visual-polish`, criada sobre a versao anterior da Home premium visual.

## 2. Diagnostico feito

### 2.1 Hero mudando sozinho

O Hero era recalculado a partir das secoes enquanto a lista de canais ainda chegava em lotes e enquanto o enriquecimento TMDB rodava. Isso fazia o item destacado trocar de `Foxter & Max` para `Guerra ao Trafico` sem acao do usuario.

Mitigacao aplicada:

- a Home passa a guardar `featuredItemId`;
- o item em destaque so troca se o item atual nao existir mais nas secoes resolvidas;
- itens sem visual TMDB sao filtrados antes de serem promovidos para Hero/cards.

### 2.2 Conteudos de canais ao vivo entrando na Home

Foi criado o mapper `src/features/catalog/lib/iptvChannelsToCatalog.ts` para transformar canais IPTV em secoes de catalogo. Ele tenta separar VOD/filmes/series de grupos de canais ao vivo.

Mitigacao aplicada:

- grupos com termos como `canal`, `canais`, `ao vivo`, `live`, `tv`, `news`, `jornal`, `esporte`, `radio` sao excluidos da Home/Catalogo;
- a Home usa somente itens com URL e indicios de VOD/filme/serie;
- quando nao ha item com capa/metadado, a Home cai para vitrine local TMDB-ready.

### 2.3 TMDB nao preenchendo Hero/cards no Fire Stick

Foi criada a tentativa de enriquecimento em `src/features/catalog/services/tmdbCatalog.service.ts`.

Durante teste pelo WebView remoto, foi observado que a Home disparava muitas buscas TMDB enquanto a playlist ainda estava carregando. Isso gerava peso no Fire Stick e deixava a tela/foco instaveis.

Mitigacoes aplicadas:

- limite reduzido para `MAX_TMDB_ITEMS = 18`;
- erros de fetch TMDB passaram a ser isolados por item, sem derrubar todo o enriquecimento;
- adicionados matches locais TMDB para titulos observados/testados:
  - `Ataque Terrorista`;
  - `Foxter & Max: Um Cachorro de Outro Mundo`;
  - `Guerra ao Trafico`.

Observacao importante: a integracao TMDB real ainda nao deve ser considerada final. A estrategia correta para producao e resolver metadados/imagens fora do render principal ou por backend/cache.

### 2.4 D-pad lento ou sem resposta

O WebView remoto mostrou que a Home estava tentando baixar uma playlist direta grande:

`http://drpk.site/get.php?...type=m3u_plus&output=ts`

Esse fetch ficou pendurado por dezenas de segundos no Fire Stick. Enquanto isso, a pagina permanecia em "Carregando sua lista" e o foco visual ficava inconsistente.

Mitigacoes aplicadas:

- a Home nao usa mais fallback direto para a playlist M3U quando `allowDirectFallback` esta falso;
- `prepareHomePlaylist` ganhou timeout de 7 segundos para tentativa de cache;
- se a carga de cache falhar ou nao for segura para cliente, a Home cai para `catalogSections` local;
- `FocusableMediaCard` passou a usar scroll `nearest` e transicoes mais leves;
- escala de foco em cards no perfil TV foi reduzida para diminuir custo visual;
- `focusFirstMediaCard` agora procura o primeiro card real no DOM, em vez de depender apenas de `catalog-section-continue-watching-item-0`.

## 3. Estrategia atual

### 3.1 Caminho desejado para producao

O fluxo correto ainda deve ser:

```text
App cliente -> licenca/dispositivo -> Edge Function cliente owner-aware -> license_channels_cache -> TMDB/cache de metadados -> Home/Live TV
```

### 3.2 Caminho aplicado nesta contencao

Como `list-license-channels-cache` e administrativa e exige `admin_profiles`, ela nao e segura como endpoint do app cliente. Portanto, a Home usa:

1. tentativa curta de cache autorizado se for possivel;
2. sem fallback para playlist direta pesada no boot da Home;
3. vitrine local TMDB-ready com titulos reais observados na lista enquanto a Edge Function cliente definitiva nao existe.

Isso preserva a responsividade do Fire Stick e evita a Home preta/travada.

## 4. Arquivos alterados

- `src/components/media/CatalogHero.tsx`
- `src/components/tv/FocusableMediaCard.tsx`
- `src/features/catalog/data/catalogSections.ts`
- `src/features/catalog/lib/iptvChannelsToCatalog.ts`
- `src/features/catalog/pages/CatalogPage.tsx`
- `src/features/catalog/services/prepareHomePlaylist.service.ts`
- `src/features/catalog/services/tmdbCatalog.service.ts`
- `src/hooks/useCatalogGridNavigation.ts`
- `src/lib/spatial/focusNavigation.ts`
- `src/styles/globals.css`
- `docs/audits/home-premium-visual-polish-handoff.md`

## 5. O que foi evitado no commit

Os seguintes artefatos foram gerados durante testes e nao devem ser versionados:

- `dist-sync/`;
- `docs/audits/firestick-latest.png`;
- `docs/audits/firestick-shots/`;
- arquivos gerados pelo `cap sync` dentro de assets Android, exceto se ja forem rastreados pelo projeto.

## 6. Validacoes executadas

Executado com sucesso apos recuperacao do lock do Dropbox/Android:

```bash
npx.cmd cap sync android
npx.cmd tsc -b
npx.cmd vite build --outDir dist-home-polish-handoff --emptyOutDir
./gradlew.bat :app:assembleDebug
```

Observacoes:

- o build Vite manteve o warning existente de chunks acima de 500 kB;
- houve lock temporario do Dropbox em `android/app/src/main/assets/public/assets` e `android/capacitor-cordova-android-plugins/build/intermediates`;
- o lock foi recuperado com `gradlew --stop` e novo `cap sync android`.

## 7. Riscos e pendencias

### Critico

- Ainda falta uma Edge Function cliente owner-aware para listar canais autorizados do `license_channels_cache` sem exigir perfil admin.
- `list-license-channels-cache` nao deve ser usado diretamente pelo app cliente porque hoje e uma funcao administrativa.

### Alto

- A vitrine local TMDB-ready e temporaria. Ela evita tela preta/travamento, mas nao substitui o catalogo real.
- O fallback direto para playlist M3U foi desabilitado somente na Home para preservar performance; Live TV ainda deve ser auditada separadamente.

### Medio

- O enriquecimento TMDB no frontend deve ser limitado ou movido para backend/cache, para nao pesar no Fire Stick.
- A fonte real de capas/metadados deve ser cacheada e nao depender de muitas buscas em runtime.

## 8. Como reverter se necessario

Depois do commit desta contencao, a versao estavel anterior pode ser restaurada com:

```bash
git revert <HASH_DO_COMMIT_DESTA_CONTENCAO>
```

Base anterior antes desta contencao:

```text
3179a2c feat: add premium visual content to home
```

## 9. Proximos passos recomendados

1. Abrir PR desta contencao para auditoria, sem considerar como solucao final de catalogo.
2. Criar fase curta para Edge Function cliente:
   - validar licenca/dispositivo;
   - respeitar owner-aware;
   - retornar canais ativos do `license_channels_cache`;
   - nao exigir `admin_profiles`;
   - opcionalmente retornar poster/backdrop/cache de metadados.
3. Depois, substituir a vitrine local TMDB-ready por conteudo real vindo do cache cliente.
4. Revalidar D-pad no Fire Stick com:
   - Home carregada;
   - cards visiveis;
   - navegacao Hero -> primeira fileira -> sidebar -> voltar.

## 10. Conclusao

Esta alteracao e uma contencao tecnica para impedir que a Home trave o Fire Stick enquanto tenta baixar playlist direta ou executar muitas buscas TMDB. Ela tambem registra a estrategia correta: o app cliente precisa de uma Edge Function propria para leitura de canais autorizados, separada das funcoes administrativas.
