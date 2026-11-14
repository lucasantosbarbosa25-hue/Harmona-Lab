<p align="center"><img src="harmonalab/web/icon.svg" alt="Harmona Lab" width="120"></p>

# Harmona Lab

Laboratório de **voicings, reharmonização e condução de vozes** que transforma exatamente as notas que você
discutiu — mão esquerda, mão direita, oitavas, ponta — num arquivo **`.mid`** para arrastar em qualquer DAW
(Studio One, Ableton, Logic, Reaper…) e tocar com qualquer VST (Pianoteq, Kontakt, Rhodes, strings, synth).

> Foco desta primeira versão (MVP): **os voicings exatos que surgem nas conversas de harmonia viram MIDI, sem
> surpresas** — notas, oitavas, durações, BPM e ordem iguais ao que foi digitado.

É um **app web instalável** (PWA): abre no navegador, instala no celular ou no computador como um app, funciona
**sem internet** e **sem login**. Tudo roda no próprio aparelho — nada é enviado para servidor nenhum.

---

## Publicar e instalar no celular

O app é só um conjunto de arquivos estáticos (`harmonalab/web/`). Para ter um endereço `https://` (exigência do
celular para instalar) e poder compartilhar, publique no **Cloudflare Pages** — grátis, sem login para quem usa e com
endereço próprio: **https://harmona-lab.pages.dev**.

**Uma vez só, no painel da Cloudflare:** *Workers & Pages → Create* → escolha **Pages** (não Worker) →
*Import an existing Git repository*. Se o painel abrir direto na criação de um Worker, procure o link para Pages
(“Looking to deploy Pages?”).

| Campo | Valor |
|---|---|
| Repositório | `harmona-lab` |
| Nome do projeto | `harmona-lab` — vira o endereço `harmona-lab.pages.dev` |
| Branch de produção | `main` |
| Framework preset | *None* |
| Build command | *(vazio)* |
| Build output directory | `harmonalab/web` |
| Root directory | *(vazio)* |

Se o repositório não aparecer na lista, o app do GitHub da Cloudflare ainda não tem acesso a ele: o próprio painel
oferece o link para liberar (*Configure GitHub* / *Add repository*). Se o nome `harmona-lab` já estiver em uso por
outra pessoa, a Cloudflare acrescenta um sufixo; o painel mostra o endereço final.

Daí em diante, todo `git push` na `main` publica sozinho (o `wrangler.jsonc` diz o que publicar). Outras branches
ganham um endereço de prévia próprio, bom para testar antes.

Se o painel mostrar *“This project is disconnected from your Git account”* e os deploys pararem, o app do GitHub da
Cloudflare perdeu o acesso: em https://github.com/settings/installations abra *Cloudflare Workers & Pages → Configure*,
liberte o repositório e salve. O próximo `git push` na `main` volta a publicar.

Sem painel, dá para publicar à mão, na pasta do projeto: `npx wrangler login && npx wrangler pages deploy`.

**Endereço próprio (opcional).** Para algo como `harmonalab.app` ou `harmonalab.com.br`, registre o domínio (a
Cloudflare vende a preço de custo; `.com.br` sai no Registro.br) e, no projeto do Pages, use *Custom domains → Set up
a domain*. O custo é só o do domínio, por ano; a hospedagem continua grátis.

**Compartilhar com amigos.** Basta mandar o endereço. Cada pessoa instala no próprio aparelho, e os projetos de cada
um ficam só nesse aparelho: nada vai para servidor e ninguém vê o que o outro criou. Para trocar progressões, use
*Salvar projeto (.json)* e *Abrir* / *Colar JSON*.

**Instalar:** abra o endereço no celular.
- **Android (Chrome):** menu ⋯ do app → *Instalar como app* (ou menu do Chrome → *Instalar app*).
- **iPhone (Safari):** botão Compartilhar → *Adicionar à Tela de Início*.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

Depois disso ele abre pelo ícone, em tela cheia, e funciona offline. Atualizações chegam sozinhas: a versão nova
aparece na próxima vez que o app for aberto com internet.

**E um APK?** Não é necessário: o app instalado já tem ícone, tela cheia e modo offline. Se um dia quiser um APK
(por exemplo, para a Play Store), o [PWABuilder](https://www.pwabuilder.com) gera um a partir do endereço publicado,
sem reescrever nada.

---


### Segurança

O Harmona Lab é só arquivos estáticos: não tem servidor próprio, login, banco de dados nem chaves. Tudo roda no navegador
de quem usa; o projeto fica no aparelho (armazenamento local) e o áudio do microfone nunca sai dele (o app não faz nenhuma
chamada de rede além de baixar os próprios arquivos). O código é público (repositório aberto e, como em todo site, o
JavaScript pode ser lido por quem abre a página): não coloque segredos nele.

- **Cabeçalhos do site** (`web/_headers`, lido pelo Cloudflare Pages; o servidor local manda os mesmos): política de
  conteúdo que só aceita arquivos do próprio endereço (sem scripts de fora e sem `eval`; só o WebAssembly do tocador de
  sons), proibição de embutir o site em outro (contra clickjacking), `nosniff`, sem "referrer", e microfone só para o app.
- **Dados de fora são tratados como texto**: o que vem de um link, de um JSON colado ou de um MIDI nunca vira HTML (a tela
  é montada com `textContent`). Links comprimidos têm limite de tamanho ao abrir (2 MB) e o MIDI importado também (5 MB,
  4.000 tempos, 50.000 notas); há um teste que embaralha arquivos MIDI para garantir que arquivo quebrado não trava o app.
- **Servidor local** (`python -m harmonalab`): escuta só em 127.0.0.1 por padrão e não entrega nada fora de `web/`.

## Usar no computador sem publicar

Precisa de **Python 3.10+**. A única dependência é o [`mido`](https://mido.readthedocs.io).

**Windows** — dê dois cliques em `iniciar-windows.bat`.
**macOS / Linux** — rode `./iniciar-mac-linux.sh`.

Na primeira vez o script cria um ambiente isolado (`.venv`) e instala o `mido`; depois só abre o app.
Se preferir fazer à mão:

```bash
git clone https://github.com/lucasantosbarbosa25-hue/harmona-lab.git
cd harmona-lab
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python -m harmonalab            # abre http://127.0.0.1:8765 no navegador
```

Para encerrar: `Ctrl+C` no terminal.

O servidor local só entrega os arquivos do app (a lógica roda no navegador). Com
`python -m harmonalab serve --host 0.0.0.0` dá para abrir pelo celular na mesma rede Wi‑Fi, mas sem `https` o
celular não instala o app — para isso, publique (seção acima).

---

## Pedir a harmonia à sua IA (texto ou voz)

O app é para **aprender harmonia rebuscada** (Jesús Molina, Dirty Loops, Domi & JD Beck, Stevie Wonder, Ed Motta e afins):
quem monta a progressão e **explica a função de cada acorde** (escala, empréstimo modal, cromatismo, substituição) é a
**sua IA**, no seu chat. O app confere as notas, mostra tom, referências, função e escala em cada acorde, e deixa você
mexer nos voicings. Não há chave de API, servidor nem custo.

**Jeito mais simples (uma vez):** em **Uso sempre a mesma IA**, copie as instruções e cole nas instruções permanentes da
sua IA (no Claude, num Projeto; no ChatGPT, em Personalizar ou num GPT; no Gemini, num Gem). Depois é só pedir no chat,
sem copiar nada: *“8 acordes, 76 BPM, estilo Jesús Molina, ponta descendo de F# até C, baixo em pedal de E”*. A IA responde
com a explicação acorde a acorde e **um link**: toque nele e a progressão abre no app, conferida.

**Sem configurar nada:** escreva ou dite (🎤) o pedido no cartão do topo e use **Copiar pedido para a IA**; cole no chat,
e depois toque no link que ela mandar ou cole a resposta no passo 3. Se a conferência achar problema, o app mostra a lista
e copia o texto de correção para você colar na mesma conversa. Depois que a música existe, o assistente trabalha **por parte** (veja "O assistente por parte", abaixo).

**Links.** O que vem depois do `#` nunca vai para servidor.
- `#t=…&k=Em&bpm=80&p=cifra:notas:duração:função:escala;…`: o formato compacto que qualquer IA consegue escrever
  (descrito em [`/ia.md`](harmonalab/web/ia.md), que também serve para IAs com navegação: “leia …/ia.md e monte…”).
- `#z=…`: a progressão comprimida, o link mais curto. **⋯ → Copiar link da progressão** gera um para você mandar a um amigo.
- `#json=…` (o projeto) e `#pedido=…` (só preenche o pedido; o app nunca gera sozinho ao abrir um link).

**Voicings à mão.** Em cada acorde, **Voicing da mão direita**: Fechado, Aberto, Drop 2, Quartal e Cluster. Os três primeiros só mudam as oitavas; o quartal empilha quartas sob a ponta e o cluster junta segundas sob ela, usando as notas da escala do acorde. Em **Mexer nos voicings de
todos os acordes**, os mesmos botões valem para a progressão inteira, e a **ponta pedal** põe a mesma nota no topo de todos
os acordes (o app avisa em quantos ela não fazia parte do acorde: é a tensão que você vai ouvir). Só mudam as oitavas da
mão direita; tudo pode ser desfeito.

**Ritmo e frases, escritos pelo app.** A sua IA entrega só a **harmonia**: os acordes, a função de cada um e as **notas da
escala** de cada acorde. O pedido fica leve e a resposta, rápida. O interruptor **Pesquisar na internet** (embaixo do pedido,
desligado por padrão) decide se a IA pesquisa os artistas citados antes de compor, o que é mais fiel e mais demorado.
Com a harmonia aberta, o painel **Ritmo e frases** faz o resto na hora, sem IA e sem custo:

- **Cantar uma melodia** (no cartão da IA): em vez de escrever, você canta. Escolha o **BPM** (obrigatório, de 60 a 100, com botão
  para marcar no toque; cantar devagar acerta mais, e a Voz fica em figuras: depois o BPM do projeto pode subir e ela acompanha) e o compasso; um **metrônomo amadeirado** (woodblock) conta um compasso e segue tocando, com um **"tique" leve de chimbal nas colcheias** (liga e desliga), que deixa o pulso contínuo e ajuda a cantar no tempo; o tique não tem altura definida, então não se confunde com a voz. Três modos:
  **com fone** (o clique só no fone: a captação mais limpa; prefira fone com fio, porque o Bluetooth atrasa o som e às vezes
  troca o microfone), **sem fone** (clique baixinho no alto-falante) e **só a contagem** (depois, o pulso aparece só na
  tela). O áudio **não sai do aparelho**: o app acha a altura da voz (algoritmo YIN), separa as notas (o vibrato não quebra
  a nota), corrige quem canta todo um pouco acima ou abaixo **e acompanha quem vai desafinando aos poucos** (até quase um semitom ao longo da frase), descobre o tom provável (que decide as notas duvidosas) e encaixa
  o ritmo no pulso. **Ritmo encaixado em**: automático (padrão: semicolcheias até 75 BPM, quando cada uma dura 200 ms ou
  mais; colcheias de 76 a 100 BPM), ou colcheias ou semicolcheias fixas. **Ajustar à escala do tom** (ligado por padrão):
  toda nota vai para a escala diatônica do tom identificado no canto (no menor, a sensível também vale); pedaços
  mais curtos que a figura escolhida (a voz chegando de baixo na nota, um escorregão, o volume oscilando, o fim da respiração) juntam-se à
  nota que permanece (com o começo do primeiro) ou saem, e a nota repetida de propósito (sílaba nova) continua repetida.
  O clique soa de propósito **entre dois semitons**, então, mesmo vazando para o microfone (e com eco), o
  app o reconhece e não confunde com a voz; os cliques da contagem também medem o atraso entre o som e o microfone, para
  alinhar a voz com o pulso. No resultado: o desenho das notas, o texto, tom e avisos, e ajustes (oitava da melodia inteira,
  meio tom de uma nota, apagar nota). **Usar como Voz** põe a melodia no projeto (campo `voice` do JSON),
  com o BPM e o compasso do canto e compassos vazios se ela não couber. A Voz toca na escuta (com o som da frase, no banco de
  sons) e sai no MIDI numa faixa própria, **"Voz"** (canal 4). O **Mixer** (acima do botão Ouvir, quando a música tem mais de uma parte sonora) liga, desliga e acerta o volume de cada camada só para a escuta: acordes, voz, solo, baixo, pad, bateria e percussão. Desligue a Voz ali para ouvir só o solo do app; ela continua guardada no projeto. **Gerar MIDI** abre uma lista com as partes que o projeto tem (Acordes, Voz cantada, Solo, Baixo, Bateria, Percussão): marque qualquer combinação, ou todas; cada parte sai numa faixa e o BPM, o compasso e os nomes dos acordes vão sempre. A escolha fica lembrada no aparelho e o nome do arquivo diz as partes (ex.: `minha-musica-voz-baixo.mid`). O pedido copiado para a IA leva a melodia (cada nota com compasso, tempo e duração) para ela harmonizar. Próxima fase: o app harmonizar sozinho a partir da Voz.

  **Partes da música (A, B, C...).** Acima da lista de acordes fica a faixa **Partes da música**: um bloco por parte, na
  ordem em que tocam. **Arraste** um bloco para mudar a ordem; **toque** nele para repetir, renomear, juntar à anterior ou
  apagar; o bloco **+** cria uma parte vazia. A melodia (Voz) que está em cima de cada parte vai junto quando o bloco se
  move, é repetido ou apagado, e tudo tem Desfazer. Em cada acorde, "Nova parte aqui" começa uma parte naquele ponto. No
  projeto, a parte é o campo `section` no primeiro acorde dela (lógica em `web/partes.js`).

  **Cantar a parte seguinte.** Com música no projeto, a janela do canto pergunta onde a melodia entra: **Parte nova**
  (depois da que existe) ou **Música toda**. Na parte nova, a contagem tem 2 compassos e o app toca neles os **2 últimos
  compassos da música** (acordes, baixo e voz), para você entrar cantando na sequência; o BPM e o compasso do projeto não
  mudam (a Voz fica em figuras, então dá para cantar mais devagar). O tom é identificado de novo em cada gravação, então
  uma parte que modula é ajustada à escala dela. **Anacruse** (interruptor): a contagem passa a ter 2 compassos e o canto
  já vale no segundo; o atraso do clique é medido só no primeiro. Na parte nova, a anacruse entra por cima do fim da parte
  anterior (com anacruse e sem fone, só o clique toca, para o trecho não vazar por cima da voz).

  **Usar um MIDI no lugar do canto.** O botão "Usar um MIDI" lê um arquivo .mid (`web/engine/midi-read.js`): o BPM e o
  compasso vêm do arquivo, a faixa mais provável é escolhida (dá para trocar), acordes viram a nota mais aguda, e o ritmo é
  encaixado em semicolcheias. O resto é igual ao canto: conferir, ajustar e usar (como música toda ou como parte nova).

  **O assistente por parte.** Com música na tela, o cartão do pedido mostra as partes (**A**, **B**, **+ nova**) e trabalha
  em uma de cada vez; tocar no quadrado de uma parte, na faixa das partes, escolhe a mesma parte no assistente. Cada parte
  guarda **o seu próprio pedido** (o de uma parte nova começa vazio), e o botão diz o que vai acontecer:
  - **Criar a parte B** (parte vazia). Se você cantou a melodia dela, o tamanho é o da melodia e o pedido é opcional. Se a
    parte nasceu do **+** → **Descrever para a IA**, quem decide o tamanho é a IA (as partes seguintes se deslocam, com a
    melodia delas). A IA pode reescrever o último ou os 2 últimos acordes da parte anterior para ligar as duas.
  - **Ajustar a parte B** (parte que já tem harmonia). Só ela muda, e **do mesmo tamanho**; para uma parte de outro
    tamanho, crie uma parte nova.
  O **+** da faixa das partes oferece três jeitos de criar: **Descrever para a IA**, **Cantar a melodia** e **Repetir a
  parte X** (a cópia vai para o fim). Nada disso zera a música: para começar outra, use o menu → **Começar outra música**
  (pede confirmação). A progressão de exemplo, que abre na primeira vez, é a exceção: o primeiro pedido cria a sua música
  no lugar dela.

  **O tom das partes.** Todas as partes ficam no tom da música (o da parte A). O pedido de cada parte diz esse tom à IA
  (use predominantemente a escala dele) e, ao cantar uma parte nova, as notas ficam presas a essa escala. Não há comando
  de modulação: se quiser outra região numa parte, escreva isso no texto do pedido.

  **Cantar por cima da harmonia.** Numa parte que já tem acordes e ainda não tem melodia, a janela de cantar oferece **Na
  parte X**: a harmonia da parte toca enquanto você canta (use fone, para ela não vazar no microfone), a gravação para
  sozinha no fim da parte e as notas ficam na escala do tom dela. A harmonia não muda.

  **Os acordes não mudam de lugar nem de tamanho.** Não há mais mover, duplicar, remover ou acrescentar acorde, e a
  duração de cada acorde é fixa: a melodia cantada depende dela. Continuam editáveis as notas, o voicing, a ponta, o
  ritmo e as frases. Para mudar a estrutura, crie ou ajuste a parte pelo pedido, ou mexa nos blocos (que levam a melodia
  junto).

  O pedido de uma parte é **completo toda vez** (dá para colar na mesma conversa ou numa conversa nova): além da tarefa,
  leva o **mapa da música** (as partes na ordem atual, com o tamanho, o tom e o pedido que criou cada uma), o **ponto de
  ligação** (os dois últimos acordes da parte anterior e o primeiro da seguinte), o **tom da música** e o aviso de que a
  harmonia enviada é a versão atual e vale mais do que a memória da conversa.

  O pedido de uma parte leva só a **harmonia** da música (sem frases, levadas, baixo, bateria nem voz, que são do app), a
  melodia com as notas da parte marcadas (quando há) e a tarefa. A IA devolve **só os acordes novos**, por link
  (`?cont=B&ret=1&p=...`: `ret` = quantos acordes do fim da parte anterior foram reescritos) ou em JSON
  (`{"continuacao": {"parte": "B", "retocados": 1}, "projeto": {"chords": [...]}}`). O app encaixa esses acordes no lugar,
  confere as durações (se não baterem, explica e não mexe em nada) e mantém todo o resto: os outros acordes, com a levada,
  o baixo e as frases deles, e a Voz. O ritmo que estava ligado é escrito também nos acordes novos. Se a resposta trouxer
  uma música inteira quando já existe música, o app pergunta antes de trocar.

  **Melodia e partes num lugar só.** Logo abaixo do pedido à IA fica o cartão **Melodia e partes**: o botão de cantar, os
  blocos das partes (com o desenho da melodia) e os controles de escuta (o que ouvir, Mixer, Repetir e andamento de
  estudo). O botão Ouvir continua na barra fixa de baixo. "Ritmo e frases" e a lista de acordes vêm depois.

  **Desenho das notas com grade, zoom e arrasto.** Na janela do canto, o desenho da melodia tem uma grade discreta de
  quadradinhos do tamanho da quantização (colcheia = quadradinhos largos; semicolcheia = metade), com os tempos e os
  compassos um pouco mais fortes e o número de cada compasso. O desenho mostra uns 2 compassos por vez e rola para os
  lados. Um toque escolhe a nota; arrastar a nota **escolhida** para os lados adianta ou atrasa, de quadradinho em
  quadradinho, sem passar por cima das vizinhas; puxar a **ponta direita** dela estica ou encurta (no mínimo um
  quadradinho, no máximo até a próxima nota). A altura continua nos botões de meio tom e oitava. Arrastar o fundo, ou uma
  nota não escolhida, só rola o desenho. **Editar melodia** (no cartão Melodia e partes, quando há uma Voz) abre o mesmo
  desenho com a melodia do projeto: "Salvar a melodia" grava só o texto dela, sem mexer no BPM nem nos acordes.

  **Sons de verdade em todas as camadas.** O app traz 27 instrumentos do **MuseScore General** (licença MIT), um arquivo
  SF3 por instrumento (`web/sons/ms-*.sf3`, de 20 KB a 1,3 MB; o piano de cauda tem 14 MB), separados do original por
  `design/split_soundfont.mjs`. Cada um é baixado só quando é usado e fica guardado no aparelho. Por padrão, os acordes
  tocam com o piano elétrico, o **baixo com um baixo elétrico**, o **pad com cordas** e a bateria com um kit acústico; em
  "Som da pré-escuta" dá para trocar cada um (teclados, violão e guitarra, sopros e vozes, 4 baixos, cordas e pads, 6
  baterias), usar o timbre simples, ou carregar um banco do aparelho. Se os sons não puderem ser baixados (sem internet na
  primeira vez), a música toca com o timbre simples e o app avisa. Os sons só valem para a escuta: o MIDI não muda.

  **Editor de notas no computador (como numa DAW).** O jeito de editar é escolhido sozinho pelo tipo de ponteiro, sem
  interruptor. Com **mouse** (ou caneta): arrastar uma nota move no tempo (lados) e na altura (cima e baixo, de semitom em
  semitom, tocando a nota para você ouvir); as **duas pontas** esticam e encurtam; **duplo clique** no vazio cria uma nota
  de um tempo; **Delete** apaga; as **setas** movem a nota escolhida (Shift + cima/baixo: uma oitava); **Ctrl+Z** desfaz
  passo a passo (há também o botão Desfazer); **Espaço** ouve; a roda do mouse rola e, com **Ctrl**, dá zoom (também nos
  botões − e +). No computador a janela fica larga e o desenho mais alto, com 4 compassos à vista. Com o **dedo**, vale o
  jeito seguro: um toque escolhe, e só a nota escolhida anda, só para os lados (a altura fica nos botões). Quem quiser o
  jeito completo no toque liga "Edição completa no toque", em "Mais opções".

  **Virtuoso de verdade, em qualquer andamento.** No nível Virtuoso, as corridas são escolhidas pelo **BPM**, com as
  velocidades medidas em solos reais (Weimar Jazz Database: 8.398 corridas em 456 solos). Em qualquer andamento, uma corrida
  de solista tem em torno de 8,5 notas por segundo, 10 a 12,6 nas mais rápidas, e 16 só como exceção. O gerador mira isso e
  escolhe a figura que dá essa velocidade: fusas a 60 BPM, quiálteras de 5 e sextinas a 90-100, semicolcheias a 120,
  tercinas de colcheia e semicolcheias a 160, colcheias e tercinas a 200; nada passa de 12,6 notas por segundo (o teto vale
  também para as células do próprio estilo). O solo fica em corrida perto de 30% do tempo, como os solistas mais rápidos
  do banco, com as chegadas e as respirações de sempre. As corridas longas andam em ondas de escala (4 a 7 graus), sem
  trinados mecânicos nem saltos, e de vez em quando fazem uma **varredura**: correm numa direção só, até duas oitavas, e
  voltam para a chegada (13% das corridas cobrem duas oitavas; nos solos reais, 5%). Tudo entre o Lá 3 e o Sol 6. Contido
  e Equilibrado não mudaram (conferido contra a versão anterior em todos os estilos e andamentos).

  **Riff / ostinato (em todos os estilos).** Uma camada nova, escrita pelo app como as frases (`web/engine/riff.js`): um
  motivo curto que se repete em todos os acordes e acompanha cada um. Ele nasce de três sorteios dentro de uma **família**:
  o ritmo (uma célula de um compasso), o desenho (sobe, desce, vai e volta, quebrado, pedal, motivo melódico) e o material
  (o arpejo do acorde, a escala dele, power chords, oitavas, ataques do acorde, notas-guia). O motivo é sorteado uma vez por
  música e reaplicado em cada acorde; a cada 4 compassos o fim varia; "Outro riff" sorteia outro. Tudo diatônico: só notas
  do acorde e da escala dele. Famílias: Dedilhado, Guitarra com delay (colcheia pontuada), Power chords, Pedal abafado com
  acentos, Galope, Oitavas, Arpejador de synth, Ataques sincopados, Ostinato melódico, Notas-guia e Montuno; cada estilo
  oferece as dele (campo `riffs` em `kb/estilos.js`, que pode trocar ritmos e som). O riff fica no campo `riff` de cada
  acorde (notação da frase, com notas juntas: `E2&B2&E3/8`), sai no MIDI na faixa **"Riff"** (canal 7), tem som próprio
  (automático pelo tipo: guitarra distorcida, limpa, abafada, piano, synth, metais) e entra no mixer e na lista de partes.

  **Rock e metal progressivo (teclado à Jordan Rudess, sem mudar o compasso).** No rock e no metal, a linha entre duas
  chegadas da frase pode usar quatro desenhos novos (`progPath`, em `engine/groove.js`; a chance é o `phrase.prog` do
  estilo: 0,4 no rock, 0,55 no metal): a escala **em terças** (1-3, 2-4, 3-5), **grupos de 4, 5 ou 6 notas** que andam um
  grau por vez (os de 5 e de 6 cruzam o tempo e soam "ímpares" dentro do 4/4), **pedal point** (uma nota fixa alternando com
  uma linha que caminha) e o **arpejo do acorde** correndo até duas oitavas. Nenhum salto passa de uma quinta entre notas
  seguidas. O metal passou a usar a escala inteira (não só a pentatônica) e ganhou sextinas e quiálteras de 5; os dois
  ganharam a célula 3+3+2. Riffs novos nos dois estilos: **Acentos deslocados** (3+3+2, 5+5+6, 3+3+3+3+4 em pedal abafado),
  **Linha em uníssono** (sequências de escala), **Pedal com melodia**, **Melodia em terças (guitarras gêmeas)** e **Arpejo
  largo de teclado** (add9 em sextinas ou quiálteras). Os outros estilos não mudaram.

  **Baterias do rock e do metal: oito em cada (o dobro dos outros estilos), várias com bumbo duplo.** Rock: básico, meio
  tempo, chimbal aberto, **bumbo duplo em semicolcheias**, **bumbo duplo em rajadas**, **galope com bumbo duplo**, levada
  de tons e acentos 3+3+2 (rock progressivo). Metal: galope, **bumbo duplo**, thrash, meio tempo pesado, **bumbo duplo em
  sextinas**, **meio tempo com bumbo duplo**, blast beat e **bumbo duplo com acentos 3+3+2**.

  **Worship, Balada, Metal, Disco / pop e Rock refeito.** Cinco estilos com levadas, baterias (aro e crescendo no worship,
  bumbo duplo, galope e thrash no metal, quatro no chão no disco), baixos, viradas e riffs próprios. O fraseado deles **não
  usa o Weimar**: há dois perfis novos em `kb/fraseado.js`, "Rock e metal (guitarra)" (chegada na fundamental, na quinta
  e na terça; pentatônica; blue notes só no rock) e "Pop, worship e balada" (terça, quinta, fundamental, com nona e quarta
  como cor). Sem cromatismo nem outside por padrão; no rock, no metal e no worship as frases usam **sequências** (grupos de
  3 ou 4 notas que andam um grau de cada vez). As instruções da IA ganharam "Harmonia por estilo": nesses estilos, harmonia
  diatônica e simples (tríades, power chords, sus, add9), em laço e **sem modulação, a menos que o pedido peça**.

  **Um banco de sons do aparelho para cada som.** No painel **Sons**, cada som (acordes, frase, baixo, riff, pad, bateria)
  tem ao lado um botão **SF2**: ele carrega do aparelho um banco `.sf2`/`.sf3` só para aquele som, e os instrumentos do
  banco aparecem no menu dele, em "Banco deste som". O botão fica marcado quando o som tem banco próprio, e o **×** ao lado
  tira o banco. A percussão toca no canal da bateria, então usa o banco dela. O banco geral ("Carregar banco geral do
  aparelho") continua existindo e oferece os instrumentos dele a todos os sons. Cada banco próprio entra no tocador com um
  deslocamento de banco próprio (104 a 124), para não colidir com os outros; todos ficam guardados só no aparelho
  (IndexedDB) e voltam ao reabrir. Vários bancos grandes ao mesmo tempo somam na memória do navegador.

  **O link da IA leva a progressão depois do `?`.** As instruções (no app, em `ia.md` e na skill) agora pedem o link no
  formato `https://harmona-lab.pages.dev/?t=...&p=...` (e `?cont=...` para uma parte, `?z=...` nos scripts da skill). O
  motivo: alguns chats, como o Gemini, passam o link por um redirecionador que corta o que vem depois do `#`, e o app abria
  vazio. O app continua lendo os dois formatos e limpa o endereço depois de abrir. Diferença: com `?`, o endereço (com a
  progressão) chega ao servidor do site ao abrir; o "Copiar link da progressão" do menu continua usando `#`, que fica só no
  aparelho.

  **A caixa de colar a resposta fica sempre à vista.** Não é mais preciso copiar o pedido para ela aparecer: quem abre o
  app com a resposta da IA em mãos cola direto (o guia, no passo 2, tem "Colar a resposta"). Alguns chats, como o Gemini,
  passam o link por um redirecionador que corta o que vem depois do `#`, e o app abre vazio; nesse caso, cole a resposta
  inteira ou o endereço do bloco de código. O app também lê o link quando ele chega embrulhado (`google.com/url?q=...`).

  **Aparência: temas de cores e fundo com músicos.** No menu ⋯ → **Aparência (cores e fundo)**. Temas: **Azul** (o padrão:
  página azul-marinho e cartões claros), **Azul noite** (tudo escuro), **Azul claro** (tudo claro) e **Âmbar** (o tema
  antigo, que segue o claro/escuro do aparelho). Ao fundo, **silhuetas de músicos** (pianista, guitarrista, cantora,
  saxofonista, baterista, contrabaixista; desenhos do próprio app, em `web/fundo/`), pintadas com a cor do tema, que
  **deslizam de lado enquanto a tela rola**. Dá para trocar por **imagens suas** (até 8; são reduzidas e ficam só no
  aparelho) ou ficar **sem imagens**. Quem pede menos movimento ao sistema vê o fundo parado. As escolhas ficam guardadas.

  **Enviar o MIDI direto para outro app.** Na janela de gerar o MIDI, **Enviar para outro app** entrega o arquivo à folha
  de compartilhar do celular (BandLab, Drive, WhatsApp…), sem passar pela pasta de downloads. O botão só aparece onde o
  sistema aceita receber arquivos; se o app de destino aparece na lista depende dele.

  **Passo a passo no guia do topo.** O guia conduz a parte em que você está por seis passos, sempre os mesmos:
  **1 Melodia** (cantar, importar um MIDI ou pular; numa parte que já tem harmonia, cantar por cima), **2 Pedido** (escrever
  o pedido da parte e copiar para a IA), **3 Ritmo** (estilo, levada, bateria, baixo), **4 Sons**, **5 Ouvir** e
  **6 Próxima parte** (ou Gerar MIDI). Ele mostra o primeiro passo que falta e avança sozinho quando o passo é cumprido;
  os números levam a qualquer passo e "Pular" segue adiante. Ritmo e sons valem para a música toda: na parte B o guia já
  os dá por feitos. Sem harmonia na parte, os passos 3 a 6 esperam. O guia só conduz: a tela continua toda à mão.

  **O guia do topo acompanha a rolagem.** O guia (o próximo passo e os botões dele) fica preso no alto da tela enquanto
  você rola, e traz o **play/pause** e o **Gerar MIDI**; por isso a barra fixa de baixo saiu. Preso, ele encolhe: ficam o
  passo e os botões, e a página não muda de tamanho (nada de pulos).

  **Tela mais simples.** Um **guia** no topo diz o próximo passo conforme o que a música já tem (cantar, pedir a
  harmonia, continuar a parte nova, corrigir erros, gerar o MIDI), com os botões que levam até lá. Os **cartões dos acordes
  vêm recolhidos** (nome, função, teclado e frase); "Editar" abre as notas e o resto, "Abrir todos" abre a lista inteira, e
  tocar na divisória de uma parte recolhe os acordes dela. Na faixa das partes, a **melodia aparece desenhada** por cima dos
  blocos, com a nota que soa acesa e uma linha correndo enquanto toca; tocar no desenho ouve a partir daquela parte, e cada
  bloco tem **Ouvir** (só aquela parte; com "Repetir", em laço) e **Ouvir daqui**. O nome da parte é editado no próprio
  campo. Na janela do canto, o que é menos usado fica em "Mais opções". Em telas de toque, os botões pequenos têm 44 px.

  **Segunda voz.** Com uma Voz no projeto, "Ritmo e frases" ganha o campo **Segunda voz** (`web/engine/segunda.js`):
  **Dueto (sexta abaixo)**, a mesma rítmica da Voz, uma sexta da escala do acorde abaixo (nas notas de repouso, de 2 tempos
  ou mais, procura uma nota do acorde); ou **Contracanto**, uma linha própria que segura as notas-guia do acorde (3ª e 7ª)
  enquanto a Voz se mexe e responde, por graus conjuntos, quando a Voz segura uma nota longa ou respira, sempre abaixo dela.
  Cada estilo tem o seu jeito (`SECOND_VOICE_STYLES`): no swing, fusion e lo-fi o dueto não articula as notas rápidas; no
  funk, blues, samba, salsa e ska o contracanto cala enquanto a Voz canta (pergunta e resposta); a figura e o tamanho
  da resposta mudam (semínimas na bossa e no lo-fi, semicolcheias no funk). "Outro contracanto" sorteia outro desenho. No
  **rock e no metal** o contracanto é o das **guitarras gêmeas** (à Iron Maiden): a segunda voz dobra a Voz nota por nota,
  com a mesma rítmica, uma terça da escala acima; nas notas de repouso (dois tempos ou mais), se a terça não for nota do acorde e a quarta for,
  vale a quarta. "Outra" troca o intervalo: terça acima, terça abaixo, sexta acima. A
  segunda voz é reescrita quando a Voz, a harmonia, as partes ou o estilo mudam; fica no campo `voice2` e sai no MIDI na
  faixa **"Voz 2"** (canal 6), um pouco mais leve que a Voz. Entra no mixer e na lista de partes do MIDI.

  **Bateria e percussão separadas no MIDI.** No canal 10, as peças do kit (bumbo, caixa, aro, chimbais, pratos, tons)
  ficam na faixa **"Bateria"**, e cada **instrumento de percussão** sai numa faixa própria, com o nome dele: "Perc
  Cowbell", "Perc Clave", "Perc Pandeirola", "Perc Ganzá", "Perc Congas" (aberta, grave e tapa juntas), "Perc Bongôs",
  "Perc Timbales", "Perc Güiro", "Perc Agogô". Vale a peça, e não o texto em que ela foi escrita (a clave e os timbales da
  bateria de salsa vão para as faixas de percussão). Assim cada faixa vai para o som certo em qualquer VST, sem depender do
  mapa de teclas dele. São **no máximo 6 faixas** de percussão (nenhuma combinação dos estilos passa disso; num projeto
  escrito à mão com mais instrumentos, os últimos dividem a faixa "Perc outras"). Ao gerar o MIDI, a lista mostra os
  instrumentos: dá para exportar todos, alguns ou **um só**, ou **juntar a percussão numa faixa** ("Percussão"). No Python,
  `build_midi(..., percussion_single=True)` junta. As notas continuam as do General MIDI.

  **Viradas.** Com bateria ou baixo ligados, o painel **Viradas** tem, para cada um, **quantas** (Sem, Poucas, Normal,
  Muitas) e a **liberdade** (Contidas, Normal, Soltas). Na bateria: sem viradas; só no fim (e a cada 8 compassos); o costume
  (fim e a cada 4); a cada 2 compassos; contidas usam só as viradas curtas do estilo, soltas preferem as longas e não
  repetem a mesma em seguida. No baixo: a chance da virada na chegada dos acordes; contidas ficam na chegada por semitom,
  de 1 tempo; soltas usam todos os desenhos (subida, descida, arco), 2 tempos e mais agudo. "Normal" é igual ao de antes.

  **Pad.** O interruptor "Pad" (em "Ritmo e frases") acrescenta uma camada de sustentação: cada acorde aberto e parado,
  do começo ao fim dele (a nota mais grave, a quinta acima e as outras notas na oitava seguinte; nota igual no acorde
  seguinte fica ligada). No MIDI sai na faixa **"Pad"** (canal 5), para usar com strings ou pad na DAW; na escuta, toca
  com um timbre de pad do próprio app. Campo `pad: true` no projeto.
- **Estilo:** Jazz swing, Blues, Jazz fusion, Neo-soul, **Lo-fi**, Gospel americano, Funk, Salsa, Samba, Bossa nova, Rock ou Ska.
- **Lo-fi** (70 a 90 BPM): Rhodes com levadas que respiram (acordes soltos, síncope suave, arpejo rolado) e ostinatos de piano;
  **bateria "arrastada"**: caixa, bumbo e contratempos do chimbal tocam um pouquinho depois do tempo (atraso fino, notação `>`
  e `>>`), com o chimbal ainda dinâmico e groovado (boom-bap, swing de colcheias, semicolcheias suaves) e viradas leves;
  shaker e pandeirola na percussão; baixo longo com síncope suave. O **fraseado** é o mais calmo de todos (um nível abaixo da
  intensidade pedida), com os mesmos motivos rítmicos voltando muito e **duetos em oitavas, sextas e tríades** em boa parte
  das notas. Usa o Weimar em dose pequena, num perfil próprio (`lofi`) que **não muda** se você fizer o rollback do Weimar.
- **Levada dos acordes:** três ou quatro levadas por estilo, da mais tradicional à mais experimental (shuffle, montuno,
  teleco-teco, skank, Charleston…), e dois **ostinatos ou riffs** por estilo (boogie-woogie, baixo andando, guajeo, dedilhado
  de violão, riff de baixo…). O ostinato repete o mesmo desenho e segue a escala de cada acorde. Desligada, cada acorde soa
  inteiro, como antes.
- **Bateria:** o beat do estilo (um básico e duas variações, cada um em dois compassos: o segundo varia o chimbal, com
  semicolcheias, notas leves e aberturas), com **dinâmica no chimbal e na condução** (forte, acento, normal, leve e
  fantasma, que variam a cada compasso; no swing, acento no 2 e no 4) e **viradas** cheias, de 1 ou 2 tempos, com bumbo
  por baixo, notas fantasma e rulos, sorteadas no último compasso (sempre uma de dois tempos) e, nas progressões longas,
  a cada quatro. A virada interrompe o beat no fim do compasso e ele volta no tempo 1, com um ataque de prato. "Outra virada" sorteia de novo. No app ela toca com um kit sintético simples; com um banco de sons, usa o kit
  do banco, se houver.
- **Percussão:** camada própria, como o baixo, com duas opções por estilo (congas, bongô e güiro na salsa; tamborim, ganzá e
  agogô no samba; pandeirola e congas no gospel…). No MIDI, faixa "Percussão" no canal 10.
- **Baixo:** três linhas por estilo (walking, shuffle, tumbao, surdo, riff com oitava…), que seguem a levada escolhida.
  Começam na nota de baixo de cada acorde, com "pops" de oitava no gospel, funk, neo-soul e fusion, e muitas vezes terminam
  com uma virada pela pentatônica de 1 ou 2 tempos: chegando ao próximo acorde por semitom, descendo do agudo, subindo
  até uma nota aguda do próximo acorde (perto do C4, e o acorde seguinte cai no grave, como no gospel americano) ou em
  arco. Tudo dentro do **baixo de 4 cordas** (do E1, a corda solta mais grave, ao G4): uma nota que cairia abaixo sobe
  uma oitava, e uma aproximação abaixo do E1 vem por cima. No MIDI, faixa própria (canal 3). Com banco de sons, toca com
  o som dos acordes.
- **Diagramas:** no menu, "Exportar diagramas dos acordes (PDF)" gera um PDF em páginas A4, em duas colunas, com o desenho do teclado, a função e a frase de cada acorde, o cabeçalho de cada parte (A, B…) e os acordes vazios resumidos numa linha. (Antes era uma imagem única, que passava do tamanho que o navegador aguenta quando havia muitos acordes.)
- **Repetir** e **andamento de estudo** (75% ou 50%) valem só para ouvir: o BPM do projeto e o MIDI não mudam.
- **Frases melódicas** (interruptor): o app escreve o solo como um improvisador pensa, **a partir da chegada**. Primeiro
  escolhe os pontos de chegada (o tempo 1 de cada acorde, o meio do compasso, as notas longas, o começo e o fim de cada
  frase) e uma nota boa para cada um, conforme o tipo de acorde: só nos menores a chegada preferida é 9ª ou 11ª (com 3ª e 5ª no
  tempo 1, e a 6ª dórica de vez em quando); nos maiores, dominantes e meio-diminutos, a chegada é nota do acorde (3ª, 7ª,
  5ª), e as tensões aparecem só de vez em quando. Notas
  evitadas (a 4ª sobre terça maior, a b9 fora dos dominantes) nunca ficam no tempo nem sustentadas. Depois liga as
  chegadas grau a grau pela escala, com curvas. **Outra variação** sorteia frases novas.
- **Perfil de fraseado (Weimar) e rollback:** a escolha das notas de chegada por tipo de acorde está num arquivo de dados,
  `harmonalab/web/kb/fraseado.js`, com dois perfis: `weimar` (em uso) e `anterior` (os pesos aprovados antes do Weimar,
  guardados sem nenhuma alteração; o teste automático confere que ele reproduz o fraseado de antes). O perfil `weimar`
  vem de medidas no [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/) (456 solos de jazz, licença ODbL; fonte
  citada aqui) e das preferências do dono do app: nos **menores**, 9ª e 11ª no tempo forte (como antes); nos **maiores que não
  são dominantes**, a 7ª maior bem frequente; nos **dominantes**, 9ª e 13ª bem mais presentes, e o solo **repousa nas
  tensões características** (b9, 9ª aumentada, 11ª aumentada, b13) quando a escala do acorde as traz. **Para voltar ao
  fraseado de antes:** troque `PERFIL_ATIVO = "weimar"` por `"anterior"` no fim desse arquivo (uma palavra). Ou volte o
  código inteiro pelo branch `fraseado-antes-weimar` do GitHub.
- **Cromatismo dosado:** aproximações cromáticas e envolventes só logo antes de uma chegada, e sempre resolvem no tempo.
  Acordes tensos (dominantes, meio-diminutos) aceitam mais; acordes diatônicos sem tensão, pouco.
- **Ritmo do estilo:** as frases usam só as células do próprio estilo e as figuras rápidas dele (tercinas no swing, fusas
  no gospel, semicolcheias e quiálteras no fusion…), sem acelerar nem desacelerar figura nenhuma.
- **Motivos:** o solo é planejado em trechos de 1 a 4 compassos que atravessam os acordes. Cada trecho apresenta um motivo
  rítmico, repete o mesmo ritmo com outras notas, às vezes toca só o começo dele, responde e chega numa nota longa.
- **Intensidade do solo** (Contido, Equilibrado ou Virtuoso): em todos os níveis há partes calmas e mais rápidas, num arco
  que cresce até o clímax (perto de 70% do solo) e resolve; o nível escolhe células mais vazias ou mais cheias do estilo,
  pelo número de notas por segundo (o andamento entra na conta).
- **Notas de repouso** (as chegadas) duram até a próxima nota, sem buracos.
- **Vozes nas notas longas:** oitavas (frequentes na salsa), sextas da escala ou tríades quartais (duas quartas justas
  abaixo, com notas da escala; sem elas, tríade do acorde em terças), com o peso de cada estilo. Só nas notas longas
  (oitavas e sextas a partir de 0,35 s; tríades a partir de 0,45 s); passagens e cromatismos ficam numa voz só.
- **Sem nota repetida:** nas frases que o app escreve, nunca a mesma nota duas vezes seguidas (uma pausa de até um tempo
  no meio não conta como fim de frase). De um acorde para o outro, pode. Baixo e levadas não seguem essa regra.
- **Tags das frases:** estilos combinados (as células rítmicas de todos os marcados), escalas de origem (escala do acorde,
  pentatônica, blues, arpejo; mais de uma ao mesmo tempo) e a **cor geral** (estilo, dentro, cromático ou outside). Cada
  acorde tem o seu submenu de cor, que vale mais que a geral. O **outside** é tensão antes de uma chegada: um motivo de um
  tempo dentro, o mesmo motivo meio tom acima ou abaixo, e a resolução por semitom (ou perto) num tempo forte: no tempo 3
  do mesmo acorde ou no tempo 1 do acorde seguinte.
- **Cor pedida no prompt:** se o pedido falar em frases cromáticas ou *outside* (até "só nos dominantes"), a IA marca esses
  acordes (`phrase_color`) e o app obedece: `dentro` fica na escala, `cromatico` reforça as aproximações, `outside` desloca um
  trecho meio tom e resolve no alvo.

Tudo vem da **base de conhecimento** em [`kb/estilos.js`](harmonalab/web/kb/estilos.js): células rítmicas, levadas, costumes e
influências de cada estilo, destilados de aulas e artigos abertos (as fontes estão no próprio arquivo), sem transcrição de
música nenhuma. O que o app escreve passa pela mesma conferência das frases escritas à mão: o alvo cai num tempo e é nota do
acorde, a aproximação resolve por semitom, as notas são da escala. Em **ouvir e exportar** você escolhe *acorde + frase*,
*mão esquerda + frase* ou *só acorde*; no `.mid`, os acordes (com a levada) ficam no canal 1 e a frase no **canal 2**.
Frases e levadas também podem ser escritas ou editadas à mão em *Mais*.

**Banco de sons (.sf2).** Em *Som da pré-escuta* (acima dos acordes), escolha um dos bancos que vêm com o app (lista em
[`kb/sons.js`](harmonalab/web/kb/sons.js), arquivos em `web/sons/`, baixados só na primeira vez que alguém os escolhe) ou
carregue um SoundFont do aparelho. Escolha o instrumento dos acordes, o da frase e o kit da **bateria** (por exemplo, Rhodes nos acordes e piano na frase). O app toca
**exatamente o arquivo MIDI que exporta** (no modo de frase escolhido), só com o instrumento travado em cada canal. O tocador é
o [SpessaSynth](https://github.com/spessasus/spessasynth_lib) (Apache-2.0), incluído em `web/vendor/spessasynth/` e carregado
só quando alguém usa um banco. O banco fica guardado só no aparelho (IndexedDB); arquivos cortados ou que não são bancos de
sons são recusados antes de chegar ao tocador. Bancos de até algumas dezenas de MB vão bem no celular; acima de 200 MB o app
pergunta antes, porque o arquivo inteiro vai para a memória.

**Skill para o Claude.** A pasta [`skill/harmona-harmonia`](skill/harmona-harmonia) (e o `.zip` em
`harmonalab/web/harmona-harmonia.zip`, que o app oferece para baixar) é uma skill: instruções, vocabulário de harmonia no
estilo de livros-texto (modos da menor melódica, tensões, substituições, upper structures, voicings), pistas por artista,
um exemplo completo de resposta e dois scripts (`validar.py` confere as notas e a ponta; `gerar_link.py` gera o link).
Para acrescentar material de estudo próprio (apostilas, anotações de aula), coloque em `references/` e cite no `SKILL.md`.

O ditado usa o reconhecimento de voz do próprio navegador (Chrome, Edge, Safari recentes; precisa de internet).

## Como usar

1. Ajuste **BPM**, **compasso**, **velocity padrão** e a convenção do **dó central**.
2. Em cada acorde, digite as notas da **mão direita** e da **mão esquerda** com oitava: `D4 Eb4 G4 C5`.
   O teclado e as fichas logo abaixo mostram, em tempo real, exatamente o que vai para o MIDI
   (do grave ao agudo, com o número MIDI de cada nota e a **ponta** destacada).
3. Escolha a duração (`½`, `1` ou `2` compassos, ou qualquer número de tempos).
4. **▶ Ouvir** faz uma pré‑escuta simples no navegador (só para conferir; o som de verdade é o do seu VST).
5. **Gerar MIDI** salva o `.mid`. Arraste o arquivo para uma faixa de instrumento na DAW.

Outras coisas na tela:

| Recurso | O que faz |
|---|---|
| **Ponta travada** | Declara a nota que *precisa* ser a mais aguda (a ponta, ou soprano). Se outra nota ficar acima (ou ela faltar), aparece um aviso. O botão **Travar** fixa o soprano atual. |
| **Strum** | Em vez de todas as notas juntas, cada nota entra uma após a outra: **grave → agudo** ou **agudo → grave**, com **10, 20 ou 30 ms** (ou outro valor, de 1 a 250) entre elas. A 1ª nota entra no tempo e o acorde termina no mesmo instante, então nada se desloca. Fica **desligado** por padrão: assim o MIDI sai exatamente como digitado. Vale para o projeto todo, e cada acorde pode trocar em **Mais → Strum deste acorde**. A pré‑escuta (**▶**) usa os mesmos atrasos. |
| **Mais: baixo/pedal, notas sem mão** | Notas extras que soam junto (ex.: pedal de `E1` sob o acorde, ou notas sem mão definida). |
| **Notas omitidas / comentário** | Só anotação (não vão para o MIDI). |
| **Estrutura fixa** | Os acordes não mudam de lugar nem de duração (a melodia depende deles). A estrutura muda pelas partes: criar, ajustar, repetir, mover ou apagar um bloco. Trocar de projeto tem **Desfazer**. |
| **Menu ⋯** | Abrir/salvar projeto `.json`, **colar JSON** (ex.: resposta do ChatGPT), exemplo, **Começar outra música**. |

O trabalho fica salvo automaticamente no aparelho (rascunho); para guardar de verdade ou levar para outro aparelho,
use **Salvar projeto**.

**Do celular para a DAW:** o `.mid` vai para a pasta Downloads; mande para o computador como preferir (Drive,
WhatsApp, e‑mail, cabo). Quando o sistema permite compartilhar o arquivo, aparece o botão **Enviar** logo após gerar.

### Erros e avisos

- **Erro** (vermelho) impede gerar o MIDI: nota que não existe (`H3`), nota sem oitava (`Eb`), fora de 0–127,
  BPM/duração/velocity inválidos.
- **Aviso** (amarelo) e **nota** (cinza) nunca bloqueiam: ponta travada que não é a nota mais aguda, mesma tecla
  digitada duas vezes, mãos cruzadas, mão abrindo mais que uma 10ª, nota fora do piano de 88 teclas.

**Notas explícitas sempre mandam.** Clusters, semitons, baixos inesperados, acordes sem nome: tudo é exportado
exatamente como digitado. O nome do acorde é só um rótulo (vai como marcador no MIDI) — o programa não depende de
reconhecê‑lo.

---

## Convenção de oitavas (importante)

Internamente tudo é **número MIDI** (0–127). Na tela, o padrão é o **científico: MIDI 60 = C4** (dó central).

| Tecla | MIDI | Científico (padrão) | Ableton / Studio One / Cubase |
|---|---|---|---|
| Dó central | 60 | **C4** | **C3** |
| Lá 440 Hz | 69 | A4 | A3 |

Ableton Live e Studio One costumam **chamar a mesma tecla de C3**. Ou seja: você digita `C4` aqui e a DAW mostra
`C3` — é a mesma nota. Se preferir ver os nomes como na DAW, troque **Dó central** para `C3`: o app reescreve todos
os nomes e **as teclas exportadas continuam idênticas** (há teste automático garantindo isso).

Grafia: `C#4` e `Db4` viram o mesmo número (61), mas a grafia que você escreveu é preservada na tela e no JSON.
Também valem `B#3` (= C4), `Cb4` (= B3), dobrados (`C##4`, `Cx4`, `Dbb4`), símbolos `♯ ♭` e o número MIDI direto (`60`).

---

## Na DAW

- O arquivo é MIDI **tipo 0** (uma faixa), canal 1, **480 ticks por semínima**, com BPM e fórmula de compasso.
- Cada acorde vira *note on* no início e *note off* exatamente no fim. Nota comum entre dois acordes é
  re‑articulada (o *note off* vem antes do *note on* no mesmo instante — nada fica cortado ou pendurado).
- **BPM:** algumas DAWs não mudam o andamento do projeto ao importar um `.mid`. As notas estão em tempos musicais,
  então ficam certas nos compassos; ajuste o BPM do projeto se quiser o andamento do arquivo.
- Para conferir um `.mid` sem abrir a DAW: `python -m harmonalab inspect arquivo.mid` (use `--middle-c C3` para ver
  os nomes como no Ableton/Studio One).

---

## Formato do projeto (JSON)

A interface, a linha de comando e o gerador MIDI usam este mesmo modelo:

```json
{
  "title": "Resolução B7alt para Em com F# na ponta",
  "tempo": 80,
  "time_signature": "4/4",
  "middle_c": "C4",
  "default_velocity": 80,
  "chords": [
    {
      "symbol": "B7alt",
      "duration_beats": 4,
      "left_hand": ["B2", "A3"],
      "right_hand": ["D4", "Eb4", "G4", "C5"],
      "top_note": "C5",
      "velocity": 82,
      "comment": "C menor melódica a partir de B"
    }
  ]
}
```

| Campo | Obrigatório | Significado |
|---|---|---|
| `tempo` | não (80) | BPM (semínima), aceita decimais. |
| `time_signature` | não (`"4/4"`) | `"3/4"`, `"6/8"`, `"7/8"`… |
| `middle_c` | não (`"C4"`) | Como se chama o MIDI 60: `"C4"` ou `"C3"`. |
| `default_velocity` | não (80) | Usada quando o acorde não tem `velocity`. |
| `strum` | não (desligado) | `{"direction": "up", "delay_ms": 20}`. `direction`: `"off"`, `"up"` (grave → agudo) ou `"down"` (agudo → grave). `delay_ms`: 1 a 250 (padrão 20). Atalho: `"strum": "up"`. |
| `chords[].left_hand`, `right_hand` | não | Lista (`["B2","A3"]`) **ou** texto (`"B2 A3"`). Nomes com oitava ou números MIDI. |
| `chords[].bass`, `notes` | não | Baixo/pedal e notas sem mão definida. Também soam. |
| `chords[].duration_beats` | não (1 compasso) | Em tempos de semínima (4 = 1 compasso em 4/4; 3 = 1 compasso em 6/8). Ou use `duration_bars`. |
| `chords[].top_note` | não | Ponta travada (validação: deve ser a nota mais aguda). |
| `chords[].velocity` | não | 1–127. |
| `chords[].strum` | não (segue o projeto) | `"off"`, `"up"` ou `"down"`: troca o strum só neste acorde. O atraso é o do projeto. |
| `key`, `references` | não | Tom (`"Em"`) e artistas ou músicas de referência (lista): aparecem em destaque na progressão. |
| `chords[].function`, `scale` | não | Função em graus (`"V7alt"`) e escala ou modo: aparecem sob o nome do acorde. |
| `chords[].comment` | não (a IA sempre preenche) | A frase de função do acorde: o que ele faz ali e por quê. Aparece sob o nome do acorde. |
| `chords[].phrase` | não | Frase melódica: notas em ordem, cada uma `NOTA/DURAÇÃO` e, se quiser, um papel depois de `*`. Ex.: `"G5/8 F5/8 Eb5/4*alvo D5/8 C5/8 B4/4*alvo"`. Duração = valor da figura (4 semínima, 8 colcheia, 16 semicolcheia, 32 fusa; `t` tercina, `q` quiáltera de 5, `.` ponto, `+` ligadura, como em `8+4`); `r/8` é pausa. O início de cada nota é a soma das durações anteriores e a soma não pode passar do acorde. Dueto: duas notas ligadas por `&` soam juntas (`C5&A4/8`). |
| `chords[].phrase_scale` | não (a IA sempre preenche) | Notas da escala do acorde, sem oitava (`"B C D Eb F G A"`): o app escreve e confere as frases com ela, e avisa se ela não contém as notas do acorde. |
| `chords[].riff` | não | O **riff** ou ostinato do acorde, na notação da frase, com notas juntas ligadas por `&` (ex.: `"E2&B2/8 E2/8 G3/4"`). Não pode durar mais que o acorde. Sai no MIDI na faixa "Riff" (canal 7). O app o escreve sozinho. |
| `chords[].section` | não | Começa aqui uma **parte** da música com este nome (`"A"`, `"B"`, `"Refrão"`); vale até a próxima marca. Só o primeiro acorde de cada parte leva. |
| `chords[].phrase_color` | não | Cor da frase pedida para o acorde: `"dentro"`, `"cromatico"` ou `"outside"`. Vazio = costume do estilo. |
| `chords[].comp` | não | Levada: o ritmo em que o voicing é tocado. Toques `PARTE/DURAÇÃO` (T = todas as notas, E = esquerda e baixo, D = direita, B = a mais grave, P = a ponta, 1 a 9 = a enésima nota, S1 a S9 = graus da escala a partir do baixo, M1 a M9 = graus da escala a partir da mão direita; `!` acento, `?` leve, `r` pausa); camadas separadas por `;` soam juntas. Ex.: `"B/4. B/8+2 ; r/8 D/8 r/4 D/4. D/8"`. Cada camada se repete até o fim do acorde. |
| `style` | não | Nome do estilo do ritmo e das frases (`"Blues"`): aparece em destaque na progressão. |
| `drums` | não | Bateria da progressão: compassos separados por `|`, camadas separadas por `;`, fichas `PEÇA/DURAÇÃO` (dinâmica opcional depois da peça: `!!` forte, `!` acento, `?` leve, `??` fantasma; e, depois dela, atraso fino opcional: `>` toca um pouquinho depois do tempo, ≈ 19 ms a 80 BPM, e `>>` um pouco mais, ≈ 38 ms; ex.: `S!>/4`). Peças (General MIDI): K bumbo, S caixa, X aro, H/O/P chimbal fechado, aberto e de pé, R condução, E cúpula, C ataque, T/M/F tons, B cowbell, L clave, A pandeirola, Q ganzá, G/N congas. Ex.: `"H/8 H/8 H/8 H/8 H/8 H/8 H/8 H/8 ; K/4 r/4 K/4 r/4 ; r/4 S!/4 r/4 S!/4"`. Os compassos se repetem até o fim. |
| `voice2` | não | A **segunda voz** (dueto ou contracanto da Voz), na mesma notação e com as mesmas regras de `voice`. Sai no MIDI na faixa "Voz 2" (canal 6). O app a escreve sozinho. |
| `pad` | não | `true` liga o **pad**: cada acorde aberto e parado, numa faixa própria ("Pad", canal 5). |
| `voice` | não | A **Voz**: uma melodia (por exemplo, a que você cantou) para a música inteira, a partir do tempo 0, na notação da frase (`NOTA/DURAÇÃO`, `r/` pausa). Ex.: `"r/4 A4/4 C5/8 D5/8 E5/2"`. Não pode durar mais que a progressão. Sai no MIDI numa faixa própria, "Voz". |
| `percussion` | não | Percussão da progressão, na mesma notação da bateria, em faixa própria. Peças extras: U conga muda, V/W bongô agudo e grave, Y/Z timbal agudo e grave, J/I güiro curto e longo, D agogô. |
| `chords[].symbol`, `omitted` | não | Informativos. |

**Papéis das notas da frase.** `*alvo` (nota de chegada: cai num tempo e é nota do acorde) e `*aprox` (aproximação: resolve por
semitom na nota seguinte, ou no próximo acorde se for a última) são conferidos. Qualquer outro papel (`*passagem`, `*blue`,
`*tensao`… o que a IA quiser explicar) é livre e não é conferido; `*aprox`, `*passagem`, `*cromatica` e `*blue` podem sair da escala.

**Como crescer.** A base de conhecimento é um arquivo de dados, [`kb/estilos.js`](harmonalab/web/kb/estilos.js): um estilo
novo, mais levadas, mais células rítmicas, mais influências ou fontes entram acrescentando linhas ali (um teste confere que
toda levada fecha compassos inteiros e toda célula, tempos inteiros). O gerador fica em
[`engine/groove.js`](harmonalab/web/engine/groove.js); durações, papéis e partes da levada têm tabelas em `phrase.py` /
`engine/phrase.js`; as conferências musicais ficam em `phrase_issues` (`analysis.py` / `analysis.js`).

Acorde sem nenhuma nota = pausa. Um exemplo completo está em
[`examples/resolucao_em_fsharp_ponta.json`](examples/resolucao_em_fsharp_ponta.json) (e o `.mid` gerado ao lado,
pronto para arrastar na DAW).

### Usando com o ChatGPT

O jeito mais fácil é o modo **Grátis, pelo seu chat** (seção “Descrever a progressão”), que monta o pedido
completo e confere a resposta. Para pedir à mão, peça a resposta já no formato do Harmona Lab, por exemplo:

> Responda só com um bloco JSON no formato Harmona Lab: `tempo`, `time_signature`, `middle_c: "C4"` e uma lista
> `chords`, cada um com `symbol`, `duration_beats`, `left_hand`, `right_hand` (notas com oitava, MIDI 60 = C4),
> `top_note` e `comment`.

Depois use **⋯ → Colar JSON**: o app aceita o JSON puro ou dentro de um bloco ```` ```json ```` com texto em volta.

---

## Linha de comando

```bash
python -m harmonalab                              # abre o app no navegador (igual a "serve")
python -m harmonalab serve --port 9000 --no-browser
python -m harmonalab export projeto.json          # gera projeto.mid (ou -o outro.mid)
python -m harmonalab check projeto.json           # mostra notas grave→agudo, MIDI, ponta, baixo e avisos
python -m harmonalab inspect arquivo.mid          # lista as notas de qualquer .mid
```

---

## Arquitetura

```
 linguagem natural / ChatGPT   (futuro: parser de texto livre — Fase 5)
              │
              ▼
   JSON do projeto  ◄──── interface web (web/app.js)        linha de comando (cli.py)
              │                                                     │
   ┌──────────┴─────── motor (mesmas camadas nos dois lados) ───────┴──────────┐
   │  model      projeto → acordes (notas concretas), leitura com lista de erros │
   │  analysis   ponta, baixo, espaçamento, avisos                               │
   │  pitch      nota = número MIDI + grafia original                            │
   │  midi       projeto → bytes do .mid                                         │
   └──────────────────────────────────────────────────────────────────────────────┘
      web/engine/*.js  (roda no navegador:            harmonalab/*.py  (referência, CLI
      app offline, sem servidor)          ◄── teste ──►  e testes; usa o mido)
                                          de paridade
```

Cada camada só conhece as de baixo. O gerador MIDI **não sabe nada** de interface, de texto livre nem de nomes de
acordes: recebe um projeto com notas concretas. Por isso dá para trocar a interface ou acrescentar um parser de
linguagem natural sem tocar no motor MIDI.

**Dois motores, um resultado.** O app roda o motor em JavaScript (`web/engine/`) para funcionar no celular, offline
e sem servidor. O motor em Python (`harmonalab/*.py`, com `mido`) continua sendo a referência testada e a base da
linha de comando. O teste `tests/test_js_parity.py` roda o motor JS no Node e exige, em dezenas de casos (inclusive
erros e casos de borda), **a mesma análise, as mesmas mensagens e os mesmos bytes de `.mid`** que o Python.

### Decisões e por quê

| Decisão | Motivo |
|---|---|
| **`mido`** para MIDI | Maduro, puro Python, controle direto de ticks e mensagens. O `pretty_midi` trabalha em segundos (ponto flutuante) e puxa `numpy`; aqui a fonte da verdade é o tempo musical. |
| **App web instalável (PWA)** em vez de APK | Mesmo código no celular e no computador, instala pelo navegador, atualiza sozinho, sem loja e sem login. |
| **Motor também em JavaScript**, conferido byte a byte com o Python | Funciona offline e sem servidor; o teste de paridade impede que as duas versões divirjam. |
| **HTML/CSS/JS puros** (sem build, sem npm) | Arquivos estáticos publicáveis em qualquer lugar; celular primeiro, tema claro/escuro automático. |
| **Servidor da biblioteca padrão** (`http.server`) | Só para usar no computador sem publicar: não precisa de Flask/FastAPI, banco de dados nem login. |
| **MIDI tipo 0, 480 ticks/♩, posições em ticks inteiros** | Importa igual em qualquer DAW; somar ticks inteiros evita deriva (4 tempos = 1920 ticks em qualquer BPM). |
| **Número MIDI canônico + grafia guardada à parte** | `C#4`/`Db4` soam igual mas aparecem como você escreveu. |

### Estrutura de diretórios

```
harmona-lab/
├── harmonalab/
│   ├── pitch.py        notas ↔ MIDI, convenções de oitava, grafia enarmônica
│   ├── model.py        Project / ChordEvent, leitura tolerante do JSON com lista de erros
│   ├── analysis.py     ponta, baixo, espaçamento, dobras, avisos musicais e conferência das frases
│   ├── phrase.py       frases melódicas: notação NOTA/DURAÇÃO*papel → notas com tempo (ticks)
│   ├── midi_io.py      gera .mid e lê de volta (conferência/testes)
│   ├── voicing.py      geradores automáticos — hoje: voicing fechado sob ponta travada
│   ├── server.py       servidor local que entrega o app (uso no computador)
│   ├── cli.py          linha de comando
│   └── web/            o app publicado (arquivos estáticos)
│       ├── index.html, styles.css, app.js   interface
│       ├── keyboard.js, audio.js            teclado visual e pré‑escuta (timbre simples)
│       ├── sound.js    pré‑escuta com banco de sons (.sf2): carrega, guarda no aparelho e toca o MIDI exportado
│       ├── vendor/spessasynth/   o tocador de SF2 (gerado por design/vendor_spessasynth.sh, versões fixas, Apache-2.0)
│       ├── engine/     motor em JS: pitch, model, analysis, midi, phrase (espelho do Python), voicing e groove (gerador de levada e frases)
│       ├── kb/         base de conhecimento dos estilos (estilos.js): levadas, células rítmicas, influências e fontes
│       ├── ai/         assistente: instruções (prompt.js), pedido e resposta (chat.js), links (link.js),
│       │               conferência (check.js), ditado (speech.js) e tela (ui.js)
│       ├── ia.md       instruções para IAs (gerado por design/ia.mjs)
│       ├── harmona-harmonia.zip   a skill, para baixar (gerado por design/build_skill.py)
│       ├── manifest.webmanifest, sw.js, icons/   instalação e modo offline
│       └── example.json                    exemplo (cópia de examples/, conferida por teste)
├── design/             logo.mjs (ícones), ia.mjs (ia.md e SKILL.md), build_skill.py (cópia do motor e .zip da skill),
│                       vendor_spessasynth.sh (traz o tocador de SF2 com versões fixas)
├── skill/harmona-harmonia/   a skill do Claude: SKILL.md, scripts, referências e exemplo
├── examples/           projeto de exemplo (.json) e o .mid gerado
├── tests/              testes automatizados (pytest) + js_engine_runner.mjs (paridade)
│   └── js/             testes do assistente (node --test), com a API da Anthropic simulada
├── wrangler.jsonc      publicação no Cloudflare Pages (só estáticos)
├── iniciar-windows.bat / iniciar-mac-linux.sh
├── requirements.txt    mido
└── requirements-dev.txt  + pytest
```

---

## Testes

```bash
pip install -r requirements-dev.txt
python -m pytest
```

Cobrem, entre outros: `C4 = 60`, `C#4 = Db4 = 61`, `B3 = 59`, `B#3`/`Cb4`, convenção C3; preservação da grafia;
leitura tolerante do JSON (todos os erros de uma vez); **top note**: com ponta `F#5`, nenhum voicing gerado
automaticamente passa de `F#5` (testado em todas as combinações de até 6 classes de altura); **duração**: 4 tempos em
4/4 = exatamente 1 compasso em vários BPMs, e outras fórmulas (3/4, 6/8, 5/4, 7/8); **MIDI relido do disco**:
pitches, note on/off, velocity, duração, ordem temporal, tempo, compasso, marcadores, nota comum re‑articulada,
pausas; **paridade JS × Python** (análise, mensagens e bytes do `.mid`, se houver Node.js instalado; sem Node o
teste é pulado); servidor local (inclusive bloqueio de caminhos fora da pasta do app); arquivos do modo offline e do
manifesto; linha de comando; **links** (formato compacto, `#json=` e `#z=` comprimido, links colados no meio de uma
resposta, links quebrados), **voicings** (fechado, aberto, drop 2, drop 3, ponta pedal, com propriedades sobre 400
acordes aleatórios), conferência da resposta da IA, ditado, e **a skill** (cópia do motor e `.zip` em dia, scripts, links
gerados em Python abrindo igual no app). Os testes em JavaScript rodam com `node --test tests/js` (e também pelo pytest).

---

## Próximas fases (onde cada coisa se encaixa)

Regra geral: recursos que o app usa entram no motor JS (`web/engine/`); o que também fizer sentido na linha de
comando entra no Python, e o teste de paridade ganha casos novos. Os nomes de arquivo abaixo valem para os dois lados.

**Fase 2 — projetos e comparação.** Abrir/salvar `.json` já existe. Falta: **comparação A/B** (função em `midi_io` ou
um módulo `arrange.py` que monta `contexto → alternativa → pausa`, repetindo N vezes, a partir de vários
`ChordEvent`), exportar várias alternativas de uma vez, e um banco de experimentos (pasta de `.json` com `name`,
`tags`, comentários e o `.mid` gerado — sem banco de dados).

**Fase 3 — voicings automáticos.** `voicing.py` já tem `voice_under_top()` (ponta travada garantida). Os botões de voicing do app (fechado, aberto, drop 2, drop 3, ponta pedal) estão em `web/engine/voicing.js`. Próximos:
inversões, drop 2/3, posição aberta/fechada, faixas por região (baixo C1–B2, ME C2–C4, MD C3–C6, ponta até C7) e
**condução de vozes** — busca de oitavas/inversões minimizando uma função de custo (movimento total em semitons,
penalidade por saltos, bônus por notas comuns, ponta e baixo preservados, distância confortável entre vozes).
Regra: o gerador só atua quando pedido; notas explícitas continuam intocadas.

**Fase 4 — humanização e playback.** O **strum** (grave→agudo ou agudo→grave, 10/20/30 ms) **já existe**, na tela, no
MIDI e na pré‑escuta, e mostra o caminho: opções em `build_midi`, desligadas por padrão para que o MIDI continue exato.
Falta a **humanização** (velocity, atraso e duração aleatórios pequenos, sempre com “Humanization OFF” como padrão) e o
**arpejo**. Ambos entram em `midi_io.py`/`web/engine/midi.js` e na pré‑escuta (`web/audio.js`), com casos novos no teste
de paridade.

**Fase 5 — texto livre e sugestões.** Um parser (`textparse.py`) para entradas como
`1. F#m7b5 LH: F#2 C3 RH: E3 A3 C4 E4 Duration: 4` produzindo o mesmo JSON; depois o modo **harmonic alternatives**
(alvo `Em9`, contexto `B7alt`, ponta `F#` → várias alternativas como `Cmaj7(#11)/E`, estruturas suspensas,
cromáticas, por condução de vozes), cada uma exportável. Tudo entra **antes** do `model.py`; o motor MIDI não muda.

---

## Limitações conhecidas desta versão

- A ponta travada é **validada** (aviso); o app só reorganiza voicings quando você pede, pelos botões (fechado, aberto, drop 2, drop 3, ponta pedal).
- MIDI: só com acordes, o arquivo tem uma faixa (tipo 0). Com frase ou bateria, tem uma faixa para cada coisa (tipo 1): acordes no canal 1, frase no canal 2 e bateria no canal 10. As mãos não são separadas em faixas.
- A bateria do app é um kit sintético simples, para conferir o ritmo. Os beats foram escritos para 4/4 e saem na grade, sem a variação de um baterista.
- As frases e levadas do app seguem regras e a base de conhecimento: saem corretas e com o ritmo do estilo, como bons exercícios, não como um solo inspirado. O app confere o que dá para medir (tempos, notas do acorde, semitom, escala, tamanho); se soa mesmo a salsa ou a neo-soul, só o seu ouvido diz. As levadas foram escritas para 4/4: em outros compassos elas se repetem e são cortadas no fim do acorde. Há tercinas e quiálteras de 5; outras divisões (setinas) não. O atraso proposital do neo-soul ("atrás do tempo") não é imitado: o MIDI sai na grade.
- Sem banco de sons, a pré‑escuta é um timbre simples, só para conferir notas. Com um `.sf2`, o banco inteiro vai para a memória: bancos de centenas de MB podem travar o celular (o app pergunta antes). O tocador de SF2 foi testado com um banco gerado nos testes e no Chromium; o timbre de cada banco de verdade só o seu ouvido julga.
- A DAW pode ignorar o BPM do arquivo ao importar (veja "Na DAW").
- Os projetos ficam no aparelho (rascunho automático) ou em arquivos `.json`; não há sincronização entre aparelhos.
- No Android, o Chrome costuma não permitir compartilhar `.mid` direto (sem botão "Enviar"); o arquivo vai para Downloads.
- O fluxo com a IA foi testado com respostas simuladas e conferido no navegador; a qualidade musical depende da IA usada
  (o app garante o formato e a conferência das notas). As pistas sobre cada artista são generalizações a confirmar.
