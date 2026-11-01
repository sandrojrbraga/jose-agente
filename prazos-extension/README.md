# José — Tempo e taxa Saipos/iFood · v0.4.0

Extensão Chrome Manifest V3. Cálculo local, sem IA, OpenRouter, Toqan ou consumo de tokens. O executor José é integrado; não usa o antigo comando.json da raiz do repositório. Catálogo de 11 lojas iFood e até 5 cozinhas Saipos, com regras independentes por loja.

## Ambiente recomendado

**Um perfil do Chrome por loja, com uma aba iFood em Configurações de entrega da unidade e uma aba Saipos no Kanban da cozinha correspondente.** Usar sessões autorizadas próprias em cada perfil. Diferentes contas/lojas em abas do mesmo perfil compartilham a sessão e não ficam isoladas. A extensão não cria perfis, usuários nem logins.

Escolher a loja em “Loja exclusiva deste perfil Chrome”. Apenas essa loja pode estar habilitada. Antes de importar, executar ou revalidar, o leitor confere o nome da loja atualmente aberta; se divergir, bloqueia antes de abrir o seletor ou preencher campos. Na execução, confirma também o ID no seletor do Portal, selecionando o mesmo cadastro. O diagnóstico somente de leitura confere o nome e informa o ID **esperado**, pois o cabeçalho não expõe diretamente o ID selecionado.

O papel padrão “Saipos + iFood neste perfil” executa o fluxo local. O papel leitor só simula; o papel executor isolado só permite testes, pois a ponte entre perfis não está implementada. Cada perfil guarda configuração e histórico próprios. Não há painel central entre perfis nesta versão.

## Instalação e atualização

1. Extrair o ZIP do projeto. A pasta para carregar é `prazos-extension/extension`, que contém manifest.json.
2. Em chrome://extensions, ativar modo desenvolvedor e carregar sem compactação. Se já instalado, substituir os arquivos da pasta instalada e clicar **Recarregar**. Não manter duas versões ativas. Carregar outra pasta pode criar outro ID e outro armazenamento.
3. Recarregar Saipos e iFood, fechar a configuração antiga e abrir o painel pelo ícone José. A atualização de configurações anteriores preserva bases personalizadas, adiciona os novos campos e pausa em simulação. Maraponga é a loja inicial quando não há escolha de perfil anterior.
4. Escolher a loja do perfil e vincular a cozinha e as duas abas. P8 já tem ID Saipos 65416, ligado a Maraponga/Jardim Cearense/Parangaba. As demais cozinhas aguardam os IDs corretos.
5. Executar os dois testes de leitura antes de ativar. Falhas podem ser exportadas em **Exportar diagnóstico**.

## Parâmetros por loja

O painel mostra apenas a loja escolhida para o perfil, com tabelas editáveis:

- **Faixas por km:** limite superior da faixa, tempo-base inteiro em minutos e taxa-base em reais. Cadastrar todas as faixas existentes na mesma ordem do Portal. Para 7–10 km, usar 10. Não cria nem remove faixas no iFood.
- **Patamares de volume:** “a partir de X pedidos”, acréscimo de minutos e acréscimo de taxa. Os limites X não foram definidos pelo usuário e começam vazios. Adicionar linhas não ativa a execução; revisar e salvar.
- **Métrica de volume:** Cozinha, ou Cozinha + Aguardando entrega. Inclui todos os canais da cozinha, inclusive balcão. Pedidos que já saíram para entrega não entram nesses patamares. Em cozinha compartilhada, a fila inteira alimenta cada loja vinculada, e cada loja aplica suas próprias regras.
- **Taxas:** preservar a existente (padrão), usar taxa-base fixa, ou taxa-base + acréscimo por volume. O modo por demanda exige taxa-base em todas as faixas e pelo menos um patamar.
- **Tetos e retorno:** prazo máximo, taxa máxima e redução da taxa por etapa. O teto de taxa inicial de R$30 e o teto de prazo de 120 min são propostas editáveis, não parâmetros aprovados para a operação. Se a configuração exceder o teto, é rejeitada, sem cortar artificialmente valores.

O patamar mais alto atingido determina os acréscimos. Os patamares **não se somam**:

`Tempo = base da faixa + idade do pedido mais antigo em Cozinha + acréscimo do patamar`

`Taxa por demanda = taxa-base da faixa + acréscimo do patamar`

Exemplo apenas ilustrativo, não pré-configurado: base R$6,99; patamar de 10 pedidos acrescenta R$1; patamar de 20 acrescenta R$2. Com 20 pedidos, a taxa é R$8,99. Não vira R$9,99 e não cresce novamente a cada ciclo. O mesmo acréscimo em reais é aplicado às taxas-base das faixas da loja.

Aumentos são imediatos no ciclo válido. Reduções precisam de duas ou mais leituras consecutivas, com passos independentes para tempo e taxa, até voltar exatamente à base. A leitura inválida mantém o último ajuste confirmado e reinicia as contagens de redução. Valores não acumulam sobre o preço/prazo atual do Portal. O monitor não pausa a loja.

**Confirmar a semântica de “Tempo” antes de habilitar a escrita:** a fórmula pressupõe prazo total, sem duplicar um preparo já somado por outro mecanismo. A idade não é multiplicada pela quantidade de pizzas. “Ler faixas atuais do Portal” importa o que está exibido; se já houver reajuste, corrigir a base antes de salvar.

## Painel e horário

A navegação organiza visão da operação, perfil e conexão, parâmetros, horário/retorno, testes e salvamento. O ciclo mostra volume, patamar, produção, acréscimo de taxa e valores por km. Os campos de taxa aceitam até duas casas decimais.

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

Testes de cálculo, DOM simulado, leitura, migração, isolamento por perfil, teto, redução gradual, recuperação e atualização do protocolo. Não substituem homologação com as sessões reais: testar leitura, simulação, preenchimento React, salvamento e persistência na instalação atualizada. Nenhum prazo ou taxa real foi alterado durante o desenvolvimento desta versão. O navegador automatizado não pode inspecionar páginas chrome-extension://; não foi contornado esse bloqueio.
