# José — Tempo e taxa Saipos/iFood · v0.10.0

Extensão Chrome Manifest V3. Cálculo local, sem IA, OpenRouter, Toqan ou consumo de tokens. O executor José é integrado; não usa o antigo comando.json da raiz do repositório. Catálogo de 11 lojas iFood e até 5 cozinhas Saipos, com regras independentes por loja.

## Ambiente recomendado

**Um perfil do Chrome por loja, com uma aba iFood em Configurações de entrega da unidade e uma aba Saipos no Kanban da cozinha correspondente.** Usar sessões autorizadas próprias em cada perfil. Diferentes contas/lojas em abas do mesmo perfil compartilham a sessão e não ficam isoladas. A extensão não cria perfis, usuários nem logins.

Escolher a loja em “Loja exclusiva deste perfil Chrome”. Apenas essa loja pode estar habilitada. Antes de importar, executar ou revalidar, o leitor confere o nome da loja atualmente aberta; se divergir, bloqueia antes de abrir o seletor ou preencher campos. Na execução, confirma também o ID no seletor do Portal, selecionando o mesmo cadastro. O diagnóstico somente de leitura confere o nome e informa o ID **esperado**, pois o cabeçalho não expõe diretamente o ID selecionado.

O papel padrão “Saipos + iFood neste perfil” executa o fluxo local. O papel leitor só simula; o papel executor isolado só permite testes, pois a ponte entre perfis não está implementada. Cada perfil guarda configuração e histórico próprios, com separação adicional entre ambiente normal e anônimo. Não há painel central entre perfis nesta versão.

## Instalação e atualização

1. Extrair o ZIP do projeto. A pasta para carregar é `prazos-extension/extension`, que contém manifest.json.
2. Em chrome://extensions, ativar modo desenvolvedor e carregar sem compactação. Se já instalado, substituir os arquivos da pasta instalada e clicar **Recarregar**. Não manter duas versões ativas. Carregar outra pasta pode criar outro ID e outro armazenamento.
3. Recarregar Saipos e iFood, fechar a configuração antiga e abrir o painel pelo ícone José. A atualização preserva bases e parâmetros, separa patamares de taxa dos de tempo, desativa o pico e pausa em simulação. Na atualização da 0.7 para 0.8, entrega média e adicionais de distância editados são preservados exatamente. O antigo modo combinado é substituído por Pedido mais antigo, com execução pausada para revisão. Patamares, taxas e bases de entrega são preservados; revisar a regra antes de salvar. As bases por km viram média comum + adicional por distância, sem alterar os valores-base efetivos. Maraponga é a loja inicial quando não há escolha de perfil anterior.
4. Escolher a loja do perfil e vincular a cozinha e as duas abas. P8 já tem ID Saipos 65416, ligado a Maraponga/Jardim Cearense/Parangaba. As demais cozinhas aguardam os IDs corretos.
5. Executar os dois testes de leitura antes de ativar. Falhas podem ser exportadas em **Exportar diagnóstico**.

## Parâmetros por loja

O painel mostra apenas a loja escolhida para o perfil, com tabelas editáveis:

- **Faixas por km:** limite superior da faixa, adicional de distância em minutos e taxa-base em reais. O adicional se soma à média de entrega informada, sem duplicar uma base completa. Cadastrar todas as faixas existentes na mesma ordem do Portal. Para 7–10 km, usar 10. Não cria nem remove faixas no iFood.
- **Patamares de preparo:** “a partir de X pedidos”, minutos de preparo. São independentes dos patamares de taxa de pico. Os limites X não foram definidos pelo usuário e começam vazios. Adicionar linhas não ativa a execução; revisar e salvar.
- **Métrica de volume:** Cozinha, ou Cozinha + Aguardando entrega. Inclui todos os canais da cozinha, inclusive balcão. Pedidos que já saíram para entrega não entram nesses patamares. Em cozinha compartilhada, a fila inteira alimenta cada loja vinculada, e cada loja aplica suas próprias regras.
- **Taxa de pico opcional:** chave própria para ativar/desativar, com patamares exclusivos de pedidos em Cozinha → acréscimo em R$. A taxa normal pode ser preservada ou mantida na base cadastrada. O pico exige taxa-base em todas as faixas e pelo menos um patamar com acréscimo positivo.
- **Tetos e retorno:** prazo máximo, taxa máxima e redução da taxa por etapa. O teto de taxa inicial de R$30 e o teto de prazo de 120 min são propostas editáveis, não parâmetros aprovados para a operação. Se a configuração exceder o teto, é rejeitada, sem cortar artificialmente valores.

O patamar mais alto atingido determina os acréscimos. Os patamares **não se somam**:

O painel mostra exatamente duas regras de ajuste:

| Regra | Origem do preparo |
|---|---|
| Quantidade de pedidos | Conta pedidos na fila escolhida e consulta os minutos de preparo do patamar atingido. Não trata número de pedidos como minutos. |
| Tempo do pedido mais antigo | Usa o maior tempo do campo Desde dos cartões da fila escolhida. Não soma os minutos dos patamares. |

Em ambas, escolher **Somente Cozinha** ou **Cozinha + Aguardando entrega**. Na segunda opção por idade, lê os cartões das duas etapas e usa o maior tempo Desde. Este campo mede permanência **na etapa atual**, não o tempo total desde a compra. Não é possível inferir o tempo anterior na cozinha de um cartão já aguardando; esta versão não inventa esse histórico.

A leitura incompleta dos cartões Aguardando bloqueia a regra de idade combinada. A regra por quantidade pode usar seu contador validado mesmo sem todos esses cartões montados; a leitura da cozinha continua exigindo cartões completos e relógios válidos.

Preencher **Tempo médio de entrega · X minutos** e **Ajustar cada distância em até X min por ciclo**. A média vale para ambas as regras. O adicional por distância é zero se a média já cobrir a faixa.

`Meta = preparo da regra escolhida + entrega média + adicional da faixa`

Exemplos ilustrativos: 30 min de idade + 15 min de entrega + 0 da faixa = meta de **45 min**. Se a faixa acrescentar 5 min, a meta é **50 min**. Por quantidade: patamar atingido com 20 min de preparo + 15 min de entrega + 5 da faixa = meta de **40 min**, sem somar a idade dos pedidos.

O próximo envio aproxima o tempo realmente lido no iFood da meta em **até X minutos por ciclo**, tanto na subida como na descida, sem ultrapassar a meta. Ex.: tela 25, meta 45, passo 5 → próximo envio 30, depois 35 nos ciclos válidos. A descida também respeita as leituras consecutivas e o passo de redução geral. Queda de demanda não causa aumento para perseguir uma meta antiga retida. Se o valor do Portal mudar entre leitura e envio, o executor recusa um salto que ultrapasse o passo configurado e aguarda novo cálculo.

No modo por quantidade, definir pelo menos um patamar com minutos positivos. Abaixo do primeiro, o preparo por quantidade é zero. O tempo médio de entrega é informado manualmente, não inferido do histórico de rotas.

## Taxa de pico · opcional para demanda extrema

Em Parâmetros, usar a seção separada **Taxa de pico**. A chave **Ativar aumento automático da taxa por volume em Cozinha** começa desativada. Não depende do modo ou da fila escolhidos para o ajuste de tempo.

Cadastrar patamares próprios de **X pedidos em Cozinha → acrescentar R$ Y**, com X e Y editáveis por loja. Conta somente Cozinha, incluindo todos os canais; não soma Aguardando entrega. O maior patamar atingido define o acréscimo total em reais, aplicado sobre a taxa-base de cada faixa de km.

`Taxa de pico = taxa-base da faixa + acréscimo do patamar de taxa`

Ativar a chave e salvar habilita o comportamento nos ciclos de execução autorizados; não altera o Portal no modo simulado/pausado. O tempo continua funcionando independentemente. A subida do acréscimo é imediata no próximo ciclo válido; a descida por queda da fila exige leituras consecutivas e reduz em passos configurados até a base. Não acumula sobre o último valor salvo.

Desativar a chave e salvar seleciona a taxa-base cadastrada, restaurada no próximo ciclo de execução válido. Se o monitor estiver pausado, fora do horário ou em simulação, os valores reais permanecem até a execução. Para não mexer em taxas, o modo normal Preservar taxa do Portal mantém o valor existente; escolhê-lo explicitamente não restaura uma base.

A atualização não habilita a taxa de pico automaticamente. Os patamares monetários antigos são copiados para a tabela independente, quando disponíveis, para revisão. O painel Operação indica ATIVADA/DESATIVADA, volume de Cozinha e acréscimo calculado. Nenhuma venda é pausada por esta função.



Exemplo apenas ilustrativo, não pré-configurado: base R$6,99; patamar de 10 pedidos acrescenta R$1; patamar de 20 acrescenta R$2. Com 20 pedidos, a taxa é R$8,99. Não vira R$9,99 e não cresce novamente a cada ciclo. O mesmo acréscimo em reais é aplicado às taxas-base das faixas da loja.

Aumentos de tempo avançam no ciclo válido, limitados ao passo máximo por faixa; o acréscimo de taxa sobe para o patamar atingido. Reduções precisam de duas ou mais leituras consecutivas, com passos independentes para tempo e taxa, até voltar exatamente à base. A leitura inválida mantém o último ajuste confirmado e reinicia as contagens de redução. Valores não acumulam sobre o preço/prazo atual do Portal. O monitor não pausa a loja.

**Confirmar a semântica de “Tempo” antes de habilitar a escrita:** o cálculo escolhido pressupõe prazo total, sem duplicar um preparo já somado por outro mecanismo. A idade não é multiplicada pela quantidade de pizzas. O tempo usado é o decorrido desde a entrada em Cozinha, e não o pedido mais recente. “Ler faixas atuais do Portal” importa o que está exibido; se já houver reajuste, corrigir a base antes de salvar.

## Painel e horário

O painel tem três áreas:

1. **Operação:** cartões Monitoramento, Saipos, iFood e Última alteração confirmada; tabela com tempo/taxa lidos no iFood, meta calculada, próximo ajuste, tempo anterior à última edição, tempo salvo e horário. O painel detalha a origem de cada parcela da conta. Falta de leitura e cálculo são exibidos como ausentes, sem inventar valores. Leituras vencidas perdem o estado Conectado. Valores iguais não significam que houve escrita.
2. **Cadastro:** único local para loja/ID, perfil, cozinha Saipos e abas vinculadas. Os testes usam os mesmos vínculos salvos, sem seletores duplicados.
3. **Parâmetros:** faixas de km, bases de tempo/taxa, patamares, limites, horário e redução. O botão Salvar e aplicar opções marcadas grava todas as áreas; a atualização automática não redesenha nem sobrescreve os campos em edição.

Com o painel visível, a extensão lê a aba iFood a cada 5 segundos, somente leitura. O botão **Ler iFood agora** faz a mesma conferência imediatamente. Essa frequência é de leitura, não de alteração: o ciclo de ajuste continua com mínimo de 30 segundos. Com o painel fechado, a leitura iFood ocorre nos ciclos de monitoramento habilitados. As frequências são nominais e dependem do navegador/computador ativos.

Inspeção, importação de faixas e revalidação agora leem diretamente a tabela aberta, sem clicar no seletor nem trocar loja. A escrita real mantém a conferência do ID no seletor antes de preencher, e relê a tabela depois de recarregar. Leitura/simulação não conta como alteração: só salvamentos confirmados aparecem no cartão Última alteração confirmada. Por faixa, guarda separadamente a última mudança de minutos (antes/depois/horário), mesmo que os 250 eventos técnicos sejam renovados. Mudança somente de taxa não substitui o histórico de tempo. O histórico registra ações desta extensão; não identifica autoria de alterações manuais ou anteriores à instalação. O histórico técnico e testes ficam recolhidos em Diagnóstico e histórico.

Os campos de taxa aceitam até duas casas decimais.

Configurar dias, início/fim e intervalo (mínimo 30 segundos). Um expediente de sexta 14h–02h inclui sábado até 01h59. O fim do horário interrompe novos ajustes e **mantém os últimos valores**, sem restauração automática no fechamento. O retorno à base ocorre durante a operação com leituras válidas e queda de demanda.

Chrome, computador e sessões precisam estar ativos; alarmes podem atrasar. A extensão não inicia o Windows/Chrome, não acorda o computador e não faz login. “Consultar agora” simula enquanto pausado; modo real pausado não escreve. Depois de conferir os cálculos, confirmar a semântica, selecionar execução, habilitar a loja e o horário e salvar.

## Segurança e recuperação operacional

- Lê o DOM, sem credenciais ou APIs internas. Captura somente IDs técnicos, horários e contagens; não coleta nome, telefone ou endereço dos clientes.
- Leitura parcial, filtros ativos, relógio desatualizado, aba ausente/ambígua, loja diferente, tabela divergente ou rascunho manual não salvo bloqueiam ajustes. Não somar abas duplicadas da mesma cozinha.
- O leitor iFood antigo é atualizado por uma inspeção sem efeitos antes de comandos, para evitar aplicar regras novas com código antigo.
- Antes de enviar, persiste o comando; após salvar, recarrega e relê. Resultado incerto bloqueia novos envios. **Revalidar envios pendentes** apenas compara, sem reenviar. Recuperação preserva também o estado de redução da taxa.
- Pausar interrompe novas operações; uma operação já enviada pode terminar. Não usar manualmente o Portal durante os ajustes. Histórico local de até 250 eventos.
- Não altera pedidos, cardápio, promoções, abertura/pausa da loja nem negociações com clientes.

## Catálogo

| Loja | ID iFood | Fonte inicial |
|---|---|---|
| Aquiraz | 3469536 | Pendente |
| Jardim Cearense | 3450370 | P8, 65416 |
| Jardins da Serra | 3446641 | Pendente |
| João XXIII | 4164721 | Pendente |
| Maracanaú | 3288741 | Pendente |
| Maraponga | 3148479 | P8, 65416 |
| Oficial | 3801484 | Pendente |
| Pajuçara | 3325340 | Pendente |
| Parangaba | 3179932 | P8, 65416 |
| Porto das Dunas | 3521123 | Pendente |
| Prainha | 3521126 | Pendente |

Nomes e IDs conferidos no Portal em 31/10/2026. A tabela-base inicial é uma proposta; não foi importada de todas as lojas.

## Validação

Requer Node.js 20+, sem dependências externas:

```sh
npm test
npm run check
```

121 testes automatizados passaram nesta versão. Testes de cálculo, DOM simulado, leitura, migração, isolamento por perfil, teto, redução gradual, recuperação e atualização do protocolo. Não substituem homologação com as sessões reais: testar leitura, simulação, preenchimento React, salvamento e persistência na instalação atualizada. Nenhum prazo ou taxa real foi alterado durante o desenvolvimento desta versão. O navegador automatizado não pode inspecionar páginas chrome-extension://; não foi contornado esse bloqueio.

## Vincular as duas abas em um clique

Com as duas sessões já logadas no mesmo perfil, escolher a loja e clicar **Vincular Saipos + iFood**, no topo. O botão identifica a cozinha pelo ID, confere a loja iFood pelo nome e associa as duas abas, de forma atômica, preservando o modo e o monitoramento quando a loja é a mesma; troca de loja fica pausada/em simulação. Não inicia login, não cria conta, não troca a unidade iFood e não altera prazos ou taxas. O diagnóstico informa ID iFood esperado, não um ID diretamente lido do cabeçalho.

Deixar apenas uma aba da cozinha Saipos e uma aba iFood na tela de entrega. Duplicidade, ausência, loja diferente e envio pendente impedem a vinculação; não deixa apenas metade do vínculo salva. Cozinha nova precisa ser cadastrada e salva antes. Os valores do formulário em edição são mantidos e só entram na operação após Salvar e aplicar opções marcadas.

## Modo anônimo e botão único de login · 0.9

Manifest configurado com incognito: split. A extensão identifica o ambiente com chrome.extension.inIncognitoContext. O painel e o popup mostram NORMAL ou ANÔNIMO. A página do painel é aberta explicitamente em uma janela do mesmo ambiente do popup.

Atualizar os arquivos, recarregar o José em chrome://extensions, abrir Detalhes e ativar **Permitir em modo anônimo**. O código não habilita essa permissão por conta própria. Abrir uma janela anônima e acessar o painel pelo ícone José.

Na primeira tela, **Abrir Saipos + iFood · Login**, ao lado de Vincular, abre as duas páginas no ambiente do painel. Havendo uma aba de cada site já aberta, reaproveita, sem duplicar. Se houver várias abas do mesmo site, informa que é preciso resolver a duplicidade. Quando não houver janela do ambiente solicitado, cria uma janela explicitamente normal ou anônima. Não preenche credenciais, não autentica e não muda a loja. Depois dos logins manuais, usar **Vincular Saipos + iFood**.

### Dados e execução separados

- Normal: mantém os dados existentes em chrome.storage.local. Na atualização, o monitor é pausado para conferência.
- Anônimo: usa chrome.storage.session, em memória, com chaves exclusivas jose:incognito:. Começa com cadastro padrão, monitor pausado e taxa de pico desligada, sem importar dados normais automaticamente. Os dados temporários são apagados ao reiniciar o navegador ou desativar/recarregar/atualizar a extensão. Não há promessa de persistência após encerrar o Chrome. Exportar a configuração manualmente se quiser reutilizá-la, depois importar e vincular novamente.
- Configuração, vínculos, estado de execução, testes, resultados, logs e histórico de alterações usam o armazenamento correspondente ao ambiente. O código não faz fallback do anônimo para armazenamento persistente.
- Todas as buscas filtram o ambiente; acesso direto a aba de outro ambiente é bloqueado, inclusive antes de recarregar ou enviar comandos. Os alarmes têm nomes separados. Pausar e salvar valem apenas para o ambiente do painel.
- O armazenamento em memória não é purgado só porque a última janela anônima fechou; pode permanecer enquanto a extensão estiver carregada nessa sessão do navegador. Ao reabrir, verificar vínculos e manter pausado até conferir os logins.

O suporte anônimo não cria uma sessão por janela: janelas anônimas do mesmo perfil continuam compartilhando os logins dos sites. Isso não substitui o isolamento por perfis quando são necessárias várias lojas independentes. Instalação real e login anônimo ainda precisam ser homologados; os testes utilizam APIs/DOM simulados, sem alterar prazos ou taxas reais.

## Correção 0.9.1 — vinculação Saipos

O aviso anterior tratava ausência, duplicidade, falha do leitor e cozinha diferente como se todos fossem abas duplicadas. A escolha explícita da aba em Cadastro também era ignorada na vinculação conjunta.

A vinculação agora usa os seletores de abas do formulário sem exigir salvar todos os parâmetros antes; valida ambiente e ID antes de associar. Com duplicatas, exige escolha explícita. Se a aba anterior foi fechada e há uma única nova aba válida da cozinha correta, reconecta. Ausência no ambiente normal/anônimo, filtros, leitura incompleta, acesso negado e ID divergente mostram razões distintas. A falha fica no cartão Saipos e em Exportar diagnóstico com IDs técnicos das abas, sem dados de clientes.

A reconexão do listener Saipos remove e registra novamente seu receptor, mesmo quando o número da versão é o mesmo. Isso evita que uma referência antiga impeça nova instalação do leitor. A leitura continua sem efeitos em pedidos e sem alteração de prazos/taxas.

No computador do usuário, foi possível conferir uma aba HTTPS Saipos com P8 65416, estrutura Kanban esperada e sem filtros; isso não comprova que seja a mesma aba acessível ao processo anônimo do José. A instalação atualizada em modo anônimo ainda precisa ser conferida pelo botão Vincular e pelos contadores lidos. Não houve acesso ao dashboard instalado por caminhos alternativos e não foram alterados dados de produção.

## Correção 0.9.2 — ID no próprio elemento do cabeçalho

Na aba 1668804538 relatada pelo usuário foi observado diretamente um span com name=current-store-name-header-button e uib-tooltip="Pizza Pizza 08 [65416]" no próprio elemento. O leitor anterior buscava esse atributo apenas em um descendente. Em outra apresentação do Saipos, o elemento externo é um link e o atributo de fato fica em um filho; por isso a conferência anterior de outra aba não reproduziu o erro.

O leitor agora aceita ambos os formatos observados, sem inferir ID por nome ou por pedidos do Kanban. O protocolo Saipos passa de 3 para 4, para que o executor reconecte automaticamente o leitor antigo e não continue usando o código com a busca incorreta. Foram adicionadas regressões para o span direto e para um ID divergente, que continua divergente e é bloqueado pela vinculação.

Na conferência somente de leitura da aba relatada, a expressão corrigida retornou ID 65416, Cozinha 0, Aguardando entrega 0 e Saiu para entrega 2. Isso confirma o formato e a identificação no DOM real; o botão da extensão atualizada ainda deve ser testado após instalação. Nenhum pedido, prazo ou taxa foi alterado.

## Correção 0.9.3 — reconectar não desmarca monitoramento

O botão Vincular desativava enabled e trocava mode para simulate tanto no executor quanto no formulário, mesmo após o usuário salvar a ativação. Agora, ao reconectar a mesma loja, apenas os vínculos de abas e as leituras são atualizados. O modo salvo, o estado ligado/pausado, os controles do formulário e as sequências de redução de tempo/taxa são mantidos. Clicar Vincular não inicia nem pausa monitoramento.

Se a loja escolhida for diferente da loja anteriormente salva, a operação continua sendo pausada em simulação, exigindo revisão. Vinculação com erro não altera a ativação. O comando Pausar durante a leitura tem prioridade; a vinculação relê a ativação salva antes de gravar. Pendências de envio continuam bloqueando a troca de vínculos. Vincular apenas lê as páginas; as alterações reais seguem ocorrendo nos ciclos autorizados.

Após instalar esta atualização, o evento de atualização ainda pausa a operação para conferência. Ativar e salvar uma vez no painel atualizado; reconectar a mesma loja depois disso não desmarca a opção. Testes automatizados cobrem executor e preservação dos campos na interface; a instalação real precisa ser conferida.

## Correção 0.9.4 — ativação explícita e verificação de salvamento

As capturas do usuário mostraram o formulário em Execução/Monitorar marcado, mas o estado salvo ainda Pausado; o teste Saipos de uma tentativa anterior permanecia exibido como bloqueado mesmo após uma nova leitura bem-sucedida. Não foi possível determinar somente pelas capturas se o salvamento foi cancelado, rejeitado por uma validação ou ainda não aplicado.

- **Iniciar monitoramento** no topo habilita a loja escolhida e o monitor, valida os parâmetros, solicita confirmação de escrita real no modo Execução, salva, relê o estado e pede o primeiro ciclo dentro das regras de horário. O modo escolhido é mantido; o botão não troca Simulação por Execução.
- **Salvar e aplicar opções marcadas** também verifica o estado efetivamente salvo, distinguindo formulário de operação. Nenhuma ativação é anunciada sem confirmação de armazenamento.
- Validação pendente, confirmação cancelada e erro de salvamento aparecem tanto no topo quanto junto ao botão inferior. A confirmação do significado do campo Tempo continua necessária para escrita.
- Aviso de opções não salvas explica por que o checkbox marcado ainda não representa monitor ativo. A leitura automática não sobrescreve os campos em edição; aguarda o término da leitura em andamento antes de salvar.
- Nova vinculação bem-sucedida substitui o erro antigo dos testes por um diagnóstico atual. Primeiro ciclo com erro é informado como ajuste bloqueado; conexão por si só não é tratada como salvamento de prazo.
- Ativação sem nenhuma loja habilitada é rejeitada. O botão Iniciar habilita a loja selecionada; salvamento comum não habilita destinos ocultamente.

Testes cobrem os fluxos da interface e do executor com APIs simuladas. A instalação atualizada ainda precisa ser conferida no computador da loja. Não houve alteração real de tempo ou taxa durante o desenvolvimento.

## Correção 0.9.5 — recuperar aba iFood fechada

O diagnóstico enviado mostrou sucesso na última leitura Saipos e erro No tab with id para o ID iFood anteriormente vinculado. A pré-leitura do Portal só buscava nova aba quando não havia ID cadastrado; um ID inteiro de aba já fechada bloqueava o ciclo antes da recuperação existente no executor.

A leitura agora verifica se a aba vinculada ainda existe e está na tela de entrega. Quando necessário, procura uma única aba de Entrega no mesmo ambiente normal/anônimo, confere nome e tabela e só então atualiza o vínculo. Preserva modo, ativação e parâmetros. Não abre seletor de lojas, não faz login, não cria comandos de alteração durante a recuperação e não aceita uma loja diferente. Sem candidatos ou com ambiguidade, mostra a ação necessária.

Exportar diagnóstico agora inclui versão, ambiente, ativação/modo efetivamente salvos, parâmetros da loja escolhida, faixas, estado do último ciclo, leitura resumida da fonte, existência de envio pendente e últimos 20 registros da loja, além dos testes de conexão. Não inclui credenciais nem copia os cartões brutos da última leitura para o relatório. Isso permite identificar bloqueios de execução sem confundir teste de conexão com estado de monitoramento.

Após atualizar, abrir Entrega da loja correta no mesmo ambiente e iniciar o monitoramento no horário configurado. Uma única aba válida pode ser reconectada automaticamente. A instalação real e o salvamento iFood continuam pendentes de homologação; os testes não alteraram prazos/taxas reais.


## Correção 0.9.6 — revalidar envio após fechar a aba

A revalidação usava o ID histórico da aba do comando pendente, mesmo quando a leitura já havia reconectado outra aba. Agora usa o vínculo atual da mesma loja ou recupera uma única aba Entrega do mesmo ambiente, confere o nome original do comando, tabela e ausência de alterações não salvas. Recarrega essa aba e verifica os valores persistidos, sem reenviar JOSE_EXECUTE, preencher campos ou trocar loja.

Loja diferente, outro ambiente, abas ambíguas, formulário não salvo e valores divergentes mantêm a pendência. A configuração continua bloqueada para edição enquanto houver resultado incerto. Uma resposta incerta que inclui valores esperados passa a preservá-los antes de tratar o erro. Sucesso de revalidação é registrado no histórico; o próximo ciclo atualiza o cartão de operação.

Para atualizar uma instalação existente, recarregar a mesma extensão sem removê-la, preservando os dados normais. Atualizações pausam o monitoramento. Abrir Entrega da mesma loja, revalidar a pendência e só então iniciar monitoramento novamente. No ambiente anônimo, dados temporários podem ser perdidos ao recarregar a extensão. Testes simulados não substituem a validação do salvamento no Portal real.


## Correção 0.9.7 — confirmação automática e diagnóstico acionável

Os diagnósticos da operação demonstraram uma alteração confirmada por recarga, seguida de novos timeouts na espera pelo botão Salvar. Conexão, preenchimento, clique e persistência são etapas diferentes. O tempo limite do botão não prova que a gravação falhou, portanto não autoriza repetir o comando.

- Enquanto ativo e no horário, um ciclo com pendência tenta apenas conferir esse comando. Não calcula/envia outro ajuste no mesmo ciclo em que o confirma.
- A conferência usa a identidade e os valores originais, recupera a aba correta do mesmo ambiente, exige formulário sem edições não salvas, recarrega e compara os valores persistidos. Nunca salva, troca loja ou reenvia o comando durante a recuperação.
- Se falhar, mantém a pendência com motivo e nova tentativa de conferência em no mínimo 60 segundos. O botão Revalidar permite conferir imediatamente, inclusive pausado. Valores divergentes e formulários sujos continuam exigindo revisão.
- Respostas do executor preservam antes/depois e um resumo do botão/validação quando o salvamento fica incerto. O protocolo iFood passou a 8 para atualizar leitores de abas já abertas.
- Revalidação confirmada aparece como última alteração e registra antes/depois quando disponíveis. O painel distingue ciclo bloqueado de ciclo concluído.
- Erro de faixas informa quais distâncias existem somente no cadastro e quais faltam nele; não remove ou inventa raios automaticamente.
- Diagnóstico inclui estágio, horário e erro da conferência, valores antes/esperados e estado do envio, sem credenciais ou cartões brutos.

Atualize os arquivos e recarregue a mesma extensão sem remover a instalação. Atualização pausa o monitoramento. No ambiente normal, os parâmetros e pendências permanecem. Se houver envio pendente, revalide primeiro; se não puder confirmar, mantenha pausado e confira o Portal. Somente depois inicie o monitoramento. Os testes são simulados; a homologação de operação contínua na loja permanece pendente.


## Correção 0.9.8 — menu da loja e janelas ocultas

Na inspeção somente de leitura do Portal em 01/11/2026, o menu de status da Maraponga estava aberto sobre a tela Tempo e taxa, com Salvar habilitado. O Portal mantém vários diálogos fechados no DOM: eles possuem retângulos de layout, mas visibility:hidden e opacity:0. O leitor anterior usava apenas getClientRects, confundindo presença no layout com visibilidade.

O leitor agora considera visibility/display/opacity. Antes de abrir o seletor de ID, fecha um menu de status já aberto pelo fundo específico desse menu, sem salvar, cancelar campos ou trocar loja. Depois de selecionar o mesmo ID, fecha novamente o menu caso ele permaneça aberto e exige que não haja diálogo visível antes de preencher ou salvar. Outra janela/modal desconhecida causa interrupção antes dos efeitos. O tratamento de erro não clica Cancelar se houver diálogo aberto.

A verificação do ID continua em cada execução; não foi removida em favor de confiar apenas no nome. Inspeção e revalidação continuam sem cliques no seletor. Protocolo iFood 9 força a atualização do leitor nas abas antigas.

Testes simulam diálogo com visibility:hidden mas retângulo de layout, menu remanescente após selecionar ID, menu aberto no início do ciclo, fundo ausente e janela desconhecida. Não foram alterados tempos ou taxas no Portal durante esta inspeção. A correção de DOM ainda precisa de validação instalada com ciclos consecutivos. Atualizar a mesma instalação sem remover; atualização pausa a operação e preserva dados normais.


## Correção 0.9.9 — mensagem real de sucesso, não apenas botão desabilitado

O diagnóstico 0.9.8 mostrou envio tentado, campos válidos, botão Salvar ainda habilitado e um diálogo ativo. Na validação assistida do Portal, a tabela coincidiu integralmente com o comando pendente. Após fechar o menu pelo fundo e clicar Salvar, o Portal exibiu Taxa e tempo alterados com sucesso!, porém o botão permaneceu habilitado. A exigência de botão desabilitado era, portanto, insuficiente e produzia timeout mesmo diante de sucesso. Recarregamos a página e conferimos as dez faixas e taxas persistidas; nesse estado o botão ficou desabilitado.

A extensão agora aceita uma nova mensagem de sucesso visível em status/alert como confirmação de submissão, além do estado desabilitado. Uma notificação anterior não confirma o novo comando. O worker continua obrigatoriamente recarregando e comparando todos os valores antes de registrar confirmação, sem duplicar o envio. Protocolo do leitor iFood 10.

O fechamento do menu espera visibility:hidden/display:none, não apenas opacity:0, para respeitar a animação. Se o menu reaparecer após o clique Salvar, fecha apenas esse menu conhecido sem clicar Salvar outra vez. Janelas desconhecidas não são aceitas/canceladas automaticamente.

Testes novos reproduzem sucesso com botão habilitado e notificação antiga incapaz de confirmar novo comando. O teste assistido confirmou o salvamento pendente; não equivale à validação contínua da extensão 0.9.9 instalada. Atualize a mesma instalação, sem removê-la. Atualização pausa a operação; preserve configurações e pendências normais.


## Atualização 0.10.0 — excluir retirada/consumo de Aguardando e esperar 3 segundos por clique

Quando a regra usa Cozinha + Aguardando entrega, a parcela Cozinha continua completa. Somente os cartões classificados como entrega entram na parcela Aguardando, tanto na contagem para patamares quanto na maior permanência na etapa. Retirada/balcão e consumo interno são excluídos somente dessa parcela. Somente Cozinha e a taxa de pico (sempre apenas Cozinha) mantêm a contagem de todos os pedidos da cozinha.

O DOM real do Saipos mostrou que o ícone Delivery também aparece em Balcão; o leitor não usa esse ícone como prova. Identifica condições exatas de elementos renderizados: sale.id_sale_type == 1 para entrega e == 2 para retirada/balcão, além de rótulos explícitos de retirada e consumo interno/mesa. Não lê estado Angular, credenciais nem dados pessoais. Tipo desconhecido em Aguardando bloqueia somente o cálculo combinado, em vez de assumir entrega ou ignorar silenciosamente. A quantidade agora também exige leitura completa dos cartões de Aguardando para conseguir classificá-los. Protocolo Saipos 5.

Todos os cliques automáticos no iFood passam por uma espera fixa de 3000 ms antes do clique: abrir menu, trocar loja, escolher o ID, fechar menu, Salvar e Cancelar do próprio preenchimento quando aplicável. Após esperar, o controle é localizado novamente para não clicar em um elemento antigo. A ação rola até o controle e o focaliza quando suportado. A identidade e validade do cálculo são verificadas novamente nas ações normais. O intervalo de 30 segundos não dispara ciclos concorrentes caso um ciclo demore mais; a validade da fonte não é estendida artificialmente. Protocolo iFood 11.

Dashboard explica a soma e mostra quantos pedidos de Aguardando foram incluídos/excluídos. Diagnóstico registra a espera e o resumo por tipo. O atraso foi solicitado para testar a hipótese de interface ainda em atualização; não há evidência suficiente para atribuir todos os bloqueios à velocidade. A instalação e os salvamentos contínuos continuam pendentes de validação.

Atualize os arquivos na mesma pasta já carregada, sem remover a extensão. A atualização pausa a operação. Revise a opção Cozinha + Aguardando, revalide eventual pendência e depois inicie. Dados normais existentes são preservados; dados anônimos são temporários. Não houve alteração de prazo/taxa no iFood durante o desenvolvimento desta versão.
