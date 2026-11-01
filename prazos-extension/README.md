# José — Prazos Saipos e iFood

Extensão Chrome Manifest V3, versão 0.2.0. Até **5 fontes/cozinhas Saipos** e **11 IDs iFood**. José é o executor integrado desta nova extensão; não depende do antigo `comando.json`, do Toqan, de IA ou de uma conversa aberta. Não contém tokens, cookies ou dados de clientes. Não instala software no computador por conta própria.

## Estado de validação

Código gerado; testes automatizados do cálculo e do fluxo de recuperação executados no ambiente de desenvolvimento. Ainda **não instalada nem homologada de ponta a ponta no Chrome da loja**. Os adaptadores usam o DOM observado no Saipos e no Portal em 31/10/2026; mudanças na interface podem bloquear a operação. Nenhum prazo real foi alterado durante o desenvolvimento. Iniciar em SIMULAÇÃO, com as fontes vinculadas, e comparar o resultado com as telas antes de habilitar execução.

## Instalar e configurar

1. Baixar este projeto e extrair. Em `chrome://extensions`, ativar Modo do desenvolvedor e usar **Carregar sem compactação**, selecionando a pasta `extension` (a que contém `manifest.json`). O botão Detectar abas Saipos tenta conectar o leitor mesmo em páginas que já estavam abertas antes da instalação. Se o Chrome negar o acesso ao site, libere o acesso nas permissões da extensão ou recarregue o Kanban.
2. Abrir o ícone **José → Configurar e acompanhar**. Vincular cada cozinha ao ID Saipos que aparece no cabeçalho. A P8 está pré-cadastrada com ID `65416`; confirmar antes de usar. Não duplicar fontes para uma cozinha compartilhada.
3. Vincular as abas abertas. Configurar até onze IDs iFood, nomes exatos e a cozinha de origem. Os 11 nomes e IDs foram conferidos no seletor do Portal. Maraponga/Jardim Cearense/Parangaba estão vinculados à P8 e habilitados para simulação; os demais aguardam escolha da cozinha. O monitor geral começa pausado e não há escrita no modo simulado. O limite de onze é por cadastro iFood, não por operação física com múltiplas dark kitchens.
4. Conferir o significado do campo Tempo no Portal: a fórmula atual é **base da faixa + idade do pedido mais antigo em Cozinha**. Não habilitar a confirmação se o campo representar apenas transporte ou se o preparo já estiver sendo acrescido por outro mecanismo. A idade não é multiplicada pelo número de pizzas.
5. Preencher todas as faixas existentes na mesma ordem, como `0.5;19;6.99`. Para um intervalo 7–10 km, usar o limite superior `10`. A faixa 10–20 usa `20`. As faixas não são criadas nem removidas no Portal. A tabela inicial é proposta, não captura da loja. **Ler faixas atuais do Portal** permite importar a tabela exibida após confirmação; se ela já estiver inflada pela demanda, corrigir manualmente a base.
6. Definir limite de prazo, passo e leituras para redução. `120 min` é apenas valor inicial editável, não limite operacional previamente aprovado. Acima do limite, bloquear e informar, sem prometer um prazo menor artificialmente.
7. Escolher dias, início e fim. Exemplo: sexta 14h–02h cobre sábado até 01h59. No fim, para novos ajustes; **não restaura automaticamente valores no fechamento**. O retorno à base ocorre durante a operação quando a demanda cai e as leituras continuam válidas.
8. Salvar em SIMULAÇÃO, habilitar os destinos desejados e usar **Consultar agora**. O modo simulado não seleciona nem escreve no Portal. Compare cada faixa, inclusive balcão na cozinha. Depois da conferência, escolher EXECUÇÃO, confirmar a semântica, habilitar o horário e salvar. A confirmação da tela pede consentimento para as alterações reais.

## Operação e recuperação

- O Chrome consulta periodicamente com `chrome.alarms` (padrão 30 segundos, sujeito a atraso do navegador), mantém configuração e resultados no armazenamento local e recria seu agendamento ao iniciar. Computador e Chrome precisam estar ligados e as sessões, autenticadas. Não acorda um computador suspenso, não inicia o Windows/Chrome e não faz login automaticamente.
- Atua apenas nas abas **deste perfil Chrome**. Não lê outros perfis nem outros computadores. Para fontes em perfis distintos, é necessário instalar e configurar por perfil, ou desenvolver uma ponte central separada; essa ponte não faz parte desta versão.
- Após reiniciar, tenta recuperar a fonte pelo ID Saipos e uma aba de Entrega aberta. Se houver duplicidade, ausência ou mudança de loja, bloqueia. Nunca soma duas cópias do mesmo Kanban.
- Lê os cartões montados no DOM, inclusive fora da área visível; compara com o contador. Lista virtualizada ou carregamento parcial bloqueia o cálculo. Não lê APIs internas ou credenciais. Dados enviados ao executor contêm apenas identificador técnico, data/horário e contagem; nomes, telefone e endereço não são capturados.
- O executor serializa os destinos porque o Portal compartilha a seleção da loja entre abas. Seleciona o ID no seletor, confere nome, raios, campos, limites e ausência de alterações manuais não salvas. Não usar o Portal manualmente durante o envio. Mudança detectada bloqueia a escrita.
- Preserva taxas por padrão. O modo **Aplicar taxa fixa configurada** é explícito e independente da demanda: ela não muda com a fila. Não altera cardápio, promoções, pedidos, abertura de loja ou negociações com clientes.
- Antes de enviar, persiste o comando. Depois de salvar, recarrega a página e relê os valores. Resultado incerto bloqueia novos envios para o destino. **Revalidar envios pendentes** apenas compara valores; não reenvia. Se não conferirem, verificar manualmente a loja e diagnosticar antes de retomar. O histórico local guarda até 250 eventos.
- Pausar impede novos destinos; uma ação já enviada pode terminar. Se houver falha de fonte, conserva o último valor confirmado e reinicia a sequência de leituras para redução. Aumenta imediatamente; reduz em etapas após duas ou mais leituras válidas. Nunca diminui abaixo da base.

## Testes

Requer Node.js 20+; sem dependências externas:

```sh
npm test
npm run check
```

A versão 0.2 adiciona testes do leitor DOM, do cenário sem receptor e da migração das 11 lojas. Os testes não substituem a homologação no Portal real: seleção de loja, controles React, sincronização entre abas, salvamento e persistência precisam ser conferidos no computador da loja. O registro `comando.json` antigo na raiz do repositório permanece intocado; esta extensão não o executa.


## Correções da versão 0.2

- Recuperação do leitor em abas que já estavam abertas, com permissão scripting restrita aos dois sites. Repetir a conexão não duplica os leitores. Resultado incerto de escrita nunca é reenviado automaticamente.
- Botão Detectar abas Saipos, diagnóstico por ID e contadores, painel de fontes lidas e botões para abrir os sites como abas normais. Não usa iframe ou navegação embutida.
- Migração do cadastro para 11 lojas, preservando valores personalizados de IDs existentes e pausando a operação em simulação. IDs antigos de abas podem mudar: detectar novamente depois de atualizar.
- Normalização de espaços (incluindo espaços não separáveis) nos nomes do iFood.
- Fontes ainda não associadas são mostradas como pendência. Não se inventa o ID Saipos das outras cozinhas. Vincular cada destino à fonte correta antes da execução real.

### Catálogo conferido no Portal, 31/10/2026

| Loja | ID iFood | Fonte Saipos pré-vinculada |
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

### Sessões e usuários dedicados

O cadastro de usuários por cozinha/loja ajuda a limitar acesso e identificar ações, mas não isola o login de abas no mesmo perfil. Para telas realmente independentes, usar perfis Chrome separados e sessões próprias. A extensão pode ser instalada por perfil; cada perfil tem sua configuração e seus leitores. Um painel que concentre todos os perfis requer uma ponte local/coordenador ainda NÃO incluído nesta versão. Não cadastrar usuários nem copiar credenciais automaticamente.

### Atualização

Substituir os arquivos da pasta instalada pela pasta extension desta versão, abrir chrome://extensions e clicar Recarregar na extensão José. Fechar as páginas de configuração antigas e abrir novamente pelo ícone. Usar Detectar abas Saipos, conferir ID 65416 e contadores, revisar as cozinhas associadas e testar em simulação. Se o ID da extensão mudar ao carregar outra pasta, a configuração anterior ficará no perfil da instalação antiga; a nova usa o catálogo pré-configurado. Não manter duas versões ativas ao mesmo tempo.
