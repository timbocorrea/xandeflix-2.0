import type { CatalogSection } from '../types';

export const catalogSections: CatalogSection[] = [
  {
    id: 'tmdb-list-highlights',
    eyebrow: 'Filmes da sua lista',
    title: 'Destaques com capas TMDB',
    description:
      'Vitrine visual temporaria com titulos detectados na lista autorizada enquanto o cache cliente definitivo e preparado.',
    items: [
      {
        id: 'list-gladiador-2',
        title: 'Gladiador 2',
        subtitle: 'Acao epica',
        posterPath: '/342bly9MqveL65TnEFzx8TTUxcL.jpg',
        backdropPath: '/tOqIwliWMovSIZ9DyvHcHI7p2im.jpg',
        tmdbId: 558449,
        year: 2024,
        rating: 6.6,
        genres: ['Acao', 'Aventura'],
        overview:
          'Lucius e forcado a lutar no Coliseu e precisa reencontrar honra e forca para desafiar o futuro de Roma.',
        mediaType: 'movie',
      },
      {
        id: 'list-venom-a-ultima-rodada',
        title: 'Venom: A Ultima Rodada',
        subtitle: 'Anti-heroi em fuga',
        posterPath: '/eZIIPjL7oGqfmF7Gw5ZnbDjH6yu.jpg',
        backdropPath: '/3V4kLQg0kSqPLctI5ziYWabAZYF.jpg',
        tmdbId: 912649,
        year: 2024,
        rating: 6.7,
        genres: ['Acao', 'Ficcao'],
        overview:
          'Eddie e Venom sao perseguidos por dois mundos e precisam tomar uma decisao devastadora.',
        mediaType: 'movie',
      },
      {
        id: 'list-perseguicao-em-taipei',
        title: 'Perseguicao em Taipei',
        subtitle: 'Missao em alta velocidade',
        posterPath: '/2CQIo4IWQTsRwuFrp3PW1G1vkHB.jpg',
        backdropPath: '/9n2gwsUiCmDVLjaIkbaOSHxcEsI.jpg',
        tmdbId: 1167271,
        year: 2024,
        rating: 6.3,
        genres: ['Acao', 'Crime'],
        overview:
          'Um ex-agente e uma espia retomam uma missao decisiva para derrubar um magnata das drogas.',
        mediaType: 'movie',
      },
      {
        id: 'list-operacao-natal',
        title: 'Operacao Natal',
        subtitle: 'Acao natalina',
        posterPath: '/zX2UeAmF8XDBJM3sZ0RS0jLQ8Gg.jpg',
        backdropPath: '/rOmUuQEZfPXglwFs5ELLLUDKodL.jpg',
        tmdbId: 845781,
        year: 2024,
        rating: 7,
        genres: ['Acao', 'Comedia'],
        overview:
          'Depois que o Papai Noel e sequestrado, uma dupla improvavel parte em uma missao global para salvar o Natal.',
        mediaType: 'movie',
      },
      {
        id: 'list-ataque-terrorista',
        title: 'Ataque Terrorista',
        subtitle: 'Drama policial',
        posterPath: '/s2q2BIcVRXheJHZpdi6CYDlCGGX.jpg',
        tmdbId: 14076,
        year: 2007,
        rating: 6.2,
        genres: ['Drama', 'Suspense'],
        overview:
          'A policia inglesa enfrenta uma crise apos a ordem de atirar em suspeitos depois dos atentados de Londres.',
        mediaType: 'movie',
      },
    ],
  },
  {
    id: 'tmdb-action-list',
    eyebrow: 'Acao da lista',
    title: 'Filmes com visual de cinema',
    description:
      'Capas e backdrops prontos para a Home enquanto a integracao cliente owner-aware do cache e fechada.',
    items: [
      {
        id: 'list-alvo-duplo',
        title: 'Alvo Duplo',
        subtitle: 'Crime e honra',
        posterPath: '/av56EQACR1wLQIUB6avvFHrmdNz.jpg',
        backdropPath: '/o3NOUSFVCHjQFUUvS6OYPvC4sBE.jpg',
        tmdbId: 11471,
        year: 1986,
        rating: 7.4,
        genres: ['Acao', 'Crime'],
        overview:
          'Dois irmaos em lados opostos da lei sao arrastados para um conflito entre lealdade, crime e familia.',
        mediaType: 'movie',
      },
      {
        id: 'list-avatar',
        title: 'Avatar: Fogo e Cinzas',
        subtitle: 'Aventura em Pandora',
        posterPath: '/9k2zKeUfcKkAz1dGt5MP6dZMm4G.jpg',
        backdropPath: '/iN41Ccw4DctL8npfmYg1j5Tr1eb.jpg',
        tmdbId: 83533,
        year: 2025,
        rating: 7.5,
        genres: ['Ficcao', 'Aventura'],
        overview:
          'Jake Sully e Neytiri enfrentam uma nova ameaca em Pandora em uma jornada pelos limites de sua familia.',
        mediaType: 'movie',
      },
      {
        id: 'list-rastro-mortal',
        title: 'Rastro Mortal',
        subtitle: 'Suspense da lista',
        posterPath: '/qci9am94Atnlqwm0BlMqbme1bbB.jpg',
        tmdbId: 1202816,
        year: 2023,
        genres: ['Suspense'],
        overview:
          'Um suspense encontrado na lista autorizada, exibido com capa TMDB quando o cache cliente ainda nao esta disponivel.',
        mediaType: 'movie',
      },
    ],
  },
];
