# U1 — matriz legado → canônico

Os exemplos são estruturais e não contêm fontes ou credenciais reais.

| Origem atual | Campo atual | Campo canônico | Transformação | Obrigatoriedade | Risco | Fase responsável |
|---|---|---|---|---|---|---|
| `IptvChannel` | `id`, `name`, `url` | `id`, `rawName`, `streamUrl` | preservar; normalizar título separadamente | obrigatório | URL operacional | U2 |
| `IptvChannel` | `groupTitle`, `logo`, `tvgId`, `tvgName` | `rawGroupTitle`, `rawLogoUrl`, `tvgId`, `tvgName` | cópia anulável | opcional | URL de logo não confiável | U2 |
| `IptvChannel` | `contentKind` | `contentKind` | `null` vira `unknown` | obrigatório | classificadores divergentes | U2 |
| `LocalCatalogItem` | `sourceId`, `name`, `normalizedName` | `sourceId`, `rawName`, `normalizedTitle` | renomear sem perder bruto | obrigatório | identidade da fonte | U2 |
| `LocalCatalogItem` | `groupTitle`, `tvgLogo` | `rawGroupTitle`, `rawLogoUrl` | cópia anulável | opcional | origem externa | U2 |
| registro remoto | identificadores internos de licença/fonte | `licenseId`, `sourceId` | mapear internamente | licença opcional; fonte obrigatória | segregação entre licenças | U2/U3 |
| registro remoto | nome, grupo, logo, ordem, atividade | campos `raw*`, `sortOrder`, `isActive` | snake_case para camelCase | misto | aliases duplicados | U2 |
| item M3U | atributos `EXTINF` e linha reproduzível | `rawName`, `rawGroupTitle`, `rawLogoUrl`, `tvgId`, `tvgName`, `streamUrl` | preservar metadados e URL; defaults explícitos | URL/nome obrigatórios | URL pode carregar material sensível | U2 |
| item Xtream Live | stream/category IDs, nome, ícone | `streamId`, `externalId`, `rawCategoryId`, `rawCategoryName`, `rawName`, `rawLogoUrl` | converter IDs para string; `contentKind=live` | misto | composição de URL usa credenciais fora do item | U3 |
| item Xtream VOD | stream/category IDs, nome, ícone, extensão | campos equivalentes + `contentKind=movie`, `contentSubtype` | preservar extensão como subtipo | misto | classificação simplificada | U3 |
| futura série Xtream | IDs, série, temporada/episódio | `externalId`, `seriesName`, `seasonNumber`, `episodeNumber` | contrato reservado; sem ingestão atual | opcional | API ainda não integrada | U3 |
| metadados TMDB | ID, media type, status, score e artwork | `UniversalCatalogEnrichedMetadata` | `not_found` → `no_match`; score → confiança | opcional | TMDB não pode bloquear visibilidade | U2/U3 |
| item da Home | título, kind, poster/backdrop, URL | bruto + enriquecimento | remover dependência estrutural de artwork | título/URL obrigatórios | prioridade TMDB atual | U2 |
| item de Filmes | item VOD e grupo estático | `contentKind=movie`, grupo bruto/dinâmico | preservar qualquer grupo | obrigatório | grupos fixos ocultam conteúdo | U2 |
| item de Séries | item VOD agregado por série | `series` ou `series_episode` | separar série de episódio | obrigatório | modelo legado mistura níveis | U2/U3 |
| item de Live TV | `IptvChannel` | `contentKind=live` ou `unknown` | preservar URL e desconhecidos | obrigatório | reclassificação indevida | U2 |

O legado `pending/matched/not_found/ambiguous/skipped/error` mapeia para `pending/matched/no_match/ambiguous/skipped/error`. `processing` nasce canônico e não possui equivalente persistido. Nenhuma migração ocorre na U1.
