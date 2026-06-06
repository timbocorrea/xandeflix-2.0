# PR #99 — Pendência futura: Ranking TOP 10 em Filmes

## Contexto

Durante a validação visual mobile da página interna de Filmes, o bloco "TOP 10 / Destaque em filmes" foi removido da interface porque ainda não existe uma regra de negócio definida para ranking de filmes.

## Decisão atual

O campo não deve aparecer visualmente enquanto não houver lógica real de ranking.

## Pendência futura

Criar uma fase específica para implementar o ranking de filmes, definindo antes:

- Critério de ranqueamento.
- Fonte dos dados.
- Se o ranking será por licença, por categoria, por visualização, por nota TMDB, por popularidade ou por regra combinada.
- Se haverá cache.
- Como o ranking será validado em Home, categoria Filmes e detalhe de filme.
- Como o ranking será exibido em mobile, tablet, desktop e TV.

## Restrições

Não implementar ranking TOP 10 dentro da PR #99 sem fase própria e validação do Analista Mestre.
