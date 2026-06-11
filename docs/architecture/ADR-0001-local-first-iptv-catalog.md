# ADR-0001 — Catálogo IPTV/TMDB local-first

## Status

Aceito para governança.

## Contexto

O Xandeflix 2.0 utiliza Supabase para autenticação, autorização, licenciamento e controle de dispositivos.

Foi identificado desvio arquitetural quando dados de catálogo IPTV/VOD e metadados TMDB vinculados a itens da fonte passaram a ser tratados como catálogo central no Supabase.

Esse modelo aumenta risco de acoplamento, custo operacional, exposição de dados sensíveis da fonte e dificuldade de manter o produto escalável para múltiplas fontes e dispositivos.

## Decisão

O catálogo IPTV/TMDB do usuário deve ser local-first.

O Supabase permanece como camada de controle de acesso e licença.

O dispositivo do usuário passa a ser a fronteira principal para:

- ler fonte IPTV;
- normalizar catálogo;
- armazenar grupos, títulos e URLs de stream;
- enriquecer/cachear TMDB;
- preparar imagens e metadados para UI;
- resolver stream no momento de reprodução.

## Supabase permitido

O Supabase pode persistir:

- usuário;
- sessão;
- licença;
- dispositivo;
- perfil;
- permissões;
- preferências;
- controle parental;
- favoritos/progresso com identificadores neutros e sem catálogo real da fonte.

## Supabase proibido

O Supabase não deve ser usado para persistir ou ampliar:

- catálogo IPTV/VOD central;
- `stream_url` real;
- `playlist_url` real;
- `group_title` real da fonte;
- `tvg_id` real;
- logo real da fonte;
- nomes/títulos reais de itens da fonte;
- metadados TMDB vinculados diretamente ao item IPTV da fonte;
- poster/backdrop centralizados de item IPTV;
- warmup TMDB centralizado para catálogo IPTV/VOD.

## Consequências positivas

- Menor exposição de dados da fonte.
- Menor dependência de backend para navegar catálogo.
- Melhor compatibilidade com fontes diferentes.
- Possibilidade de cache inteligente por dispositivo.
- Redução de custo e risco de processamento centralizado.
- Base mais segura para Fire Stick, tablet e mobile.

## Consequências negativas / trade-offs

- O dispositivo precisa assumir mais responsabilidade de cache e indexação.
- Será necessário criar camada local-first substituta antes de remover legado.
- Haverá fase de transição com fallback legado.
- Testes físicos em Fire Stick continuam obrigatórios quando houver impacto em TV/D-pad.

## Tratamento do legado

Todo legado não conforme deve ser classificado como:

`LEGACY_ALLOWED_BUT_FROZEN`

O legado pode permanecer até existir substituto local-first validado.

O legado não pode ser expandido sem aprovação explícita do Analista Mestre.

## Política de mudança

Qualquer PR que toque catálogo, fonte IPTV, TMDB, Supabase, importação, cache, player ou resolução de stream deve declarar impacto sobre este ADR.

Mudanças fora da governança devem ser bloqueadas pelo guardrail ou reprovadas em revisão.
