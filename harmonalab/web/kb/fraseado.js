// Perfis de fraseado: que nota o solo escolhe para CHEGAR (tempo 1, meio do compasso, notas longas, fim de frase) em cada
// tipo de acorde. É só um arquivo de dados: o gerador (engine/groove.js) lê tudo daqui.
//
// COMO VOLTAR ATRÁS (rollback): mude PERFIL_ATIVO, mais abaixo neste arquivo, de "weimar" para "anterior". É só isso: o perfil
// "anterior" guarda, sem nenhuma alteração, os pesos aprovados antes de usarmos o Weimar Jazz Database. (Também dá para
// voltar o código inteiro pelo branch `fraseado-antes-weimar` do GitHub.) O lo-fi tem perfil próprio (PERFIL_POR_ESTILO) e não
// muda com esse rollback.
//
// Cada perfil tem:
//   pesos[tipo]       tipo = menor | maior | dominante | meio-diminuto; para cada um, { forte, fraco }: peso de cada GRAU
//                     (semitons acima da fundamental: 0 fundamental, 2 = 9ª, 3 = 3ª menor / 9ª aumentada, 4 = 3ª maior,
//                     5 = 11ª, 6 = 11ª aumentada, 7 = 5ª, 8 = 6ª menor / 13ª bemol, 9 = 13ª, 10 = 7ª menor, 11 = 7ª maior).
//                     "forte" vale para a chegada no tempo 1 do acorde; "fraco", para as outras (meio do compasso, notas longas).
//                     Grau que não está na tabela só entra se for nota do acorde. Notas evitadas nunca entram.
//   tensoes           nos dominantes: tensões "características" que a escala do acorde traz (as alteradas 1, 3, 6, 8 e as
//                     naturais 2, 9) ganham este multiplicador; com a escala alterada ou diminuta, as alteradas sobem muito.
//   tercaBlue         nos estilos com blue notes (blues, gospel, rock...), antes de chegar numa 3ª maior o solo toca a 3ª menor
//                     (blue note) com chance própria; sem isto, o blue note dependeria da chegada cair na 3ª maior.
//   repousoNaTensao   multiplicador das tensões de dominante quando a nota é de REPOUSO (dura um tempo ou mais): o solo
//                     gosta de pousar na b13 ou na 9ª aumentada (a "3ª menor" do acorde alterado).
//
// Fonte do perfil "weimar": medidas no Weimar Jazz Database (456 solos de jazz; licença ODbL; citar a fonte), mais as
// preferências do dono do app: nos menores, 9ª e 11ª no tempo forte (frequência mantida); nos maiores que não são
// dominantes, a 7ª maior com frequência; nos dominantes, repouso nas tensões características.

export const PERFIS = {
  // Os pesos de antes do Weimar, exatamente como estavam.
  anterior: {
    rotulo: "Anterior ao Weimar",
    pesos: {
      menor: {
        forte: { 3: 3, 7: 2.6, 2: 2.4, 5: 2.4, 10: 1.4, 9: 0.9, 0: 0.5 },
        fraco: { 2: 3, 5: 3, 3: 1.6, 7: 1.5, 10: 1.8, 9: 1.1, 0: 0.4 },
      },
      dominante: {
        forte: { 4: 3, 10: 2.8, 7: 1.4, 0: 0.8, 2: 0.5, 9: 0.5, 1: 0.4, 3: 0.4, 8: 0.4, 6: 0.3 },
        fraco: { 4: 2.8, 10: 2.8, 7: 1.6, 0: 0.9, 2: 0.6, 9: 0.6, 1: 0.5, 3: 0.5, 8: 0.5, 6: 0.4 },
      },
      "meio-diminuto": {
        forte: { 3: 2.6, 6: 2.4, 10: 2.4, 0: 1, 5: 0.6, 2: 0.4, 8: 0.3 },
        fraco: { 3: 2.6, 6: 2.4, 10: 2.4, 0: 1, 5: 0.6, 2: 0.4, 8: 0.3 },
      },
      maior: {
        forte: { 4: 3, 11: 2.4, 7: 2.2, 0: 1, 9: 0.8, 2: 0.5, 6: 0.3 },
        fraco: { 4: 2.6, 11: 2.4, 7: 2.2, 0: 1, 9: 0.9, 2: 0.6, 6: 0.4 },
      },
    },
    tensoes: { alterada: 1, natural: 1 },
    repousoNaTensao: 1,
    tercaBlue: false,
  },

  // Calibrado com o Weimar e com o gosto do dono do app.
  weimar: {
    rotulo: "Weimar Jazz Database",
    pesos: {
      // Menores: iguais ao perfil anterior (9ª e 11ª no tempo forte, na frequência que o dono gosta).
      menor: {
        forte: { 3: 3, 7: 2.6, 2: 2.4, 5: 2.4, 10: 1.4, 9: 0.9, 0: 0.5 },
        fraco: { 2: 3, 5: 3, 3: 1.6, 7: 1.5, 10: 1.8, 9: 1.1, 0: 0.4 },
      },
      // Dominantes: 3ª e 7ª no centro; fundamental e 5ª; e as tensões (9ª, 13ª, b9, #9, #11, b13) bem mais presentes que
      // antes, como nos solos reais (9ª em 20% e 13ª em 14% dos tempos fortes). O multiplicador de "tensoes" completa.
      dominante: {
        forte: { 4: 2.6, 10: 2.4, 7: 1.4, 0: 0.9, 2: 1.2, 9: 1.2, 1: 0.7, 3: 0.7, 8: 0.7, 6: 0.6 },
        fraco: { 4: 2.4, 10: 2.4, 7: 1.5, 0: 0.9, 2: 1.3, 9: 1.3, 1: 0.8, 3: 0.8, 8: 0.8, 6: 0.6 },
      },
      "meio-diminuto": {
        forte: { 3: 2.4, 6: 2.2, 10: 2.2, 0: 1, 5: 1.5, 2: 0.5, 8: 1 },
        fraco: { 3: 2.4, 6: 2.2, 10: 2.2, 0: 1, 5: 1.5, 2: 0.6, 8: 1 },
      },
      // Maiores que não são dominantes: a 7ª maior (11) é a nota preferida de chegada, ao lado da 3ª e da 5ª; 9ª e 13ª
      // (ou 6ª) também aparecem, e a 11ª aumentada (lídio) de vez em quando.
      maior: {
        forte: { 4: 2.6, 11: 3.2, 7: 2.8, 0: 1.5, 2: 1.6, 9: 1.2, 6: 0.8 },
        fraco: { 4: 2.4, 11: 3, 7: 2.6, 0: 1.2, 2: 1.8, 9: 1.3, 6: 0.8 },
      },
    },
    tensoes: { alterada: 2.4, natural: 1.5 },
    repousoNaTensao: 1.6,
    tercaBlue: true,
  },

  // Lo-fi: o Weimar em dose pequena (meio caminho entre o "anterior" e o "weimar"), sem blue notes. A 7ª maior e a 9ª nos
  // maiores e menores (a cara do Rhodes), tensões de dominante só como cor. Este perfil é fixo: não depende do PERFIL_ATIVO.
  lofi: {
    rotulo: "Lo-fi (Weimar em dose pequena)",
    pesos: {
      menor: {
        forte: { 3: 3, 7: 2.6, 2: 2.4, 5: 2.4, 10: 1.4, 9: 0.9, 0: 0.5 },
        fraco: { 2: 3, 5: 3, 3: 1.6, 7: 1.5, 10: 1.8, 9: 1.1, 0: 0.4 },
      },
      dominante: {
        forte: { 4: 2.8, 10: 2.6, 7: 1.4, 0: 0.85, 2: 0.85, 9: 0.85, 1: 0.55, 3: 0.55, 8: 0.55, 6: 0.45 },
        fraco: { 4: 2.6, 10: 2.6, 7: 1.5, 0: 0.9, 2: 0.9, 9: 0.9, 1: 0.6, 3: 0.6, 8: 0.6, 6: 0.5 },
      },
      "meio-diminuto": {
        forte: { 3: 2.5, 6: 2.3, 10: 2.3, 0: 1, 5: 1, 2: 0.45, 8: 0.65 },
        fraco: { 3: 2.5, 6: 2.3, 10: 2.3, 0: 1, 5: 1, 2: 0.5, 8: 0.65 },
      },
      maior: {
        forte: { 4: 2.6, 11: 3.4, 7: 2.6, 0: 1.4, 2: 1.8, 9: 1.2, 6: 0.6 },
        fraco: { 4: 2.4, 11: 3.2, 7: 2.4, 0: 1.2, 2: 2, 9: 1.3, 6: 0.6 },
      },
    },
    tensoes: { alterada: 1.6, natural: 1.25 },
    repousoNaTensao: 1.25,
    tercaBlue: false,
  },
};

/** O perfil em uso. Para voltar ao fraseado de antes do Weimar, troque "weimar" por "anterior". */
export const PERFIL_ATIVO = "weimar";

/**
 * Estilos com perfil PRÓPRIO: não seguem o PERFIL_ATIVO. Assim, voltar o Weimar para "anterior" (rollback) não mexe no
 * fraseado deles. Para um estilo passar a seguir o perfil ativo, é só tirar a linha dele daqui.
 */
export const PERFIL_POR_ESTILO = { lofi: "lofi" };

/** O perfil de um estilo: o próprio, se tiver; senão o ativo. `id` (opcional) força um perfil, para testes. */
export const perfilDoEstilo = (estiloId, id) => PERFIS[id] ?? PERFIS[PERFIL_POR_ESTILO[estiloId]] ?? PERFIS[PERFIL_ATIVO];

export const perfil = (id = PERFIL_ATIVO) => PERFIS[id] ?? PERFIS[PERFIL_ATIVO];
