export interface CatalogItem {
  id: string;
  title: string;
  subtitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
}

export interface CatalogSection {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  showSeeAll?: boolean;
  items: CatalogItem[];
}

export const catalogSections: CatalogSection[] = [
  {
    id: 'continue-watching',
    eyebrow: 'Recomendado para voce',
    title: 'Continue de onde parou',
    description:
      'Retome canais e conteudos recentes com acesso rapido para controle remoto.',
    showSeeAll: true,
    items: [
      { id: 'canal-ao-vivo', title: 'Canal ao Vivo', subtitle: 'Retomar agora' },
      {
        id: 'filme-em-destaque',
        title: 'Filme em Destaque',
        subtitle: 'Ultima sessao',
      },
      { id: 'serie-popular', title: 'Serie Popular', subtitle: 'Novo episodio' },
      { id: 'documentario', title: 'Documentario', subtitle: 'Continue assistindo' },
      { id: 'infantil', title: 'Infantil', subtitle: 'Favoritos da familia' },
      { id: 'esportes', title: 'Esportes', subtitle: 'Ao vivo agora' },
      { id: 'noticias', title: 'Noticias', subtitle: 'Atualizacao diaria' },
      { id: 'acao', title: 'Acao', subtitle: 'Catalogo premium' },
      { id: 'comedia', title: 'Comedia', subtitle: 'Sugestoes para hoje' },
      { id: 'drama', title: 'Drama', subtitle: 'Colecao em destaque' },
    ],
  },
  {
    id: 'live-channels',
    eyebrow: 'Ao vivo',
    title: 'Canais em destaque',
    description:
      'Curadoria de canais para uma navegacao mais rapida na sua grade principal.',
    items: [
      { id: 'xande-cine', title: 'Xande Cine', subtitle: 'Cinema 24h' },
      { id: 'xande-series', title: 'Xande Series', subtitle: 'Series populares' },
      { id: 'xande-kids', title: 'Xande Kids', subtitle: 'Conteudo infantil' },
      { id: 'xande-sports', title: 'Xande Sports', subtitle: 'Esporte ao vivo' },
      { id: 'xande-news', title: 'Xande News', subtitle: 'Noticias em tempo real' },
      { id: 'xande-hits', title: 'Xande Hits', subtitle: 'Musica e variedade' },
      { id: 'xande-premium', title: 'Xande Premium', subtitle: 'Selecao premium' },
      { id: 'xande-brasil', title: 'Xande Brasil', subtitle: 'Programacao nacional' },
    ],
  },
  {
    id: 'movies',
    eyebrow: 'Filmes',
    title: 'Filmes para hoje',
    description: 'Titulos organizados para leitura rapida na TV.',
    items: [
      { id: 'filme-1', title: 'Filme 1', subtitle: 'Acao e aventura' },
      { id: 'filme-2', title: 'Filme 2', subtitle: 'Drama em destaque' },
      { id: 'filme-3', title: 'Filme 3', subtitle: 'Suspense noturno' },
      { id: 'filme-4', title: 'Filme 4', subtitle: 'Comedia leve' },
      { id: 'filme-5', title: 'Filme 5', subtitle: 'Classico remasterizado' },
      { id: 'filme-6', title: 'Filme 6', subtitle: 'Lancamento recente' },
      { id: 'filme-7', title: 'Filme 7', subtitle: 'Escolha da semana' },
    ],
  },
];
