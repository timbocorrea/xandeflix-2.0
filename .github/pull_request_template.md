## Objetivo

Descreva o objetivo desta PR.

## Escopo alterado

Liste os arquivos e áreas alteradas.

## Checklist de governança local-first

- [ ] Esta PR respeita a decisão: Supabase controla acesso; dispositivo controla catálogo.
- [ ] Esta PR não amplia catálogo IPTV/VOD centralizado no Supabase.
- [ ] Esta PR não introduz `stream_url`, `playlist_url`, `group_title`, `tvg_id`, `logo_url`, `poster_path`, `backdrop_path` ou campos `tmdb_*` fora do escopo aprovado.
- [ ] Esta PR não executa warmup/enrichment TMDB centralizado.
- [ ] Esta PR não cria migration Supabase sem aprovação explícita.
- [ ] Esta PR não altera player nativo sem demanda específica.
- [ ] Esta PR não altera Android nativo sem demanda específica.
- [ ] Esta PR não altera D-pad sem validação física quando aplicável.
- [ ] Legado não conforme permanece como `LEGACY_ALLOWED_BUT_FROZEN` até inventário e substituto local-first.

## Impacto por superfície

- Catálogo IPTV/VOD: <!-- sim/não + explicação -->
- Supabase: <!-- sim/não + explicação -->
- TMDB: <!-- sim/não + explicação -->
- Player: <!-- sim/não + explicação -->
- Android nativo: <!-- sim/não + explicação -->
- D-pad/TV: <!-- sim/não + explicação -->
- Mobile/tablet: <!-- sim/não + explicação -->

## Validações

- [ ] `npm run governance:check`
- [ ] `npm run build --if-present`
- [ ] `git diff --check`
- [ ] Validação visual/navegação quando aplicável
- [ ] Fire Stick quando envolver TV/D-pad

## Fora de escopo

Liste explicitamente o que esta PR não altera.

## Aprovação necessária

- [ ] Analista Mestre aprovou exceção, se houver.
- [ ] Esta PR deve permanecer Draft até revisão controlada, quando aplicável.
