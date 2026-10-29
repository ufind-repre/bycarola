# Especificação do protótipo integrado

O protótipo reúne o sistema de gestão do zip e o fluxo especializado de produção do html. Os rascunhos da reunião serviram como contexto. A solicitação mais recente orienta as alterações descritas abaixo.

## Produção

| Área | Comportamento |
|---|---|
| Composição da matéria-prima | Cada fibra recebe um percentual livre. Não existe teto de 100% nem exigência de soma igual a 100%. |
| Composição da etiqueta | A participação de cada matéria-prima também é livre. Os valores são mantidos e o cálculo não normaliza a soma. |
| Exemplo | 80% + 90% é aceito e o total informado é 170%. |
| Cuidados | Seis seletores: lavagem, alvejamento, secadora, secagem natural, passadoria e limpeza profissional. A prévia e a impressão mostram símbolos e descrições. |
| Rendimento | Quilos × metros por quilo = metros disponíveis. Os três valores ficam salvos no material. Há opção de registrar a quantidade como entrada; editar o rendimento não repete essa entrada automaticamente. |
| Cópia de peça | Reutiliza referência, ficha, grade e etiquetas; permite nova cor e lote, com novo registro e histórico próprio. A cópia começa em Desenvolvimento e não herda a finalização ou os anexos de etapas anteriores. |
| Permissões | A consulta permite abrir cards e histórico; edição, anexos e exportações respeitam os acessos concedidos no sistema principal. |

Sequência preservada: Desenvolvimento → Modelagem → Plotagem → Corte da piloto → Costura da piloto → Prova → Ampliação → Plotagem Produção → Corte → Aviamento → Costura → Controle de qualidade.

Os responsáveis, anexos obrigatórios, moldes por tamanho, etiquetas, histórico, arquivamento e retorno para retrabalho continuam no fluxo.

As opções de conservação têm como referência a [tabela de símbolos GINETEX / ISO 3758](https://www.ginetex.net/share/article/4201/care-symbols). Os símbolos do protótipo são representações SVG para explorar a interação; a escolha de cuidados é feita por quem cadastra a etiqueta.

## Integração com estoque

1. A produção classifica cada tamanho em normal, segunda linha ou rejeitada.
2. Normais e segunda linha geram variantes distintas, mantendo referência de origem, cor, tamanho e lote.
3. Rejeitadas permanecem na avaliação e não geram saldo de estoque.
4. Cada registro de finalização é importado uma única vez, mesmo após recarregar a página ou reenviar a sincronização.
5. Novos lotes da mesma variante acumulam saldo sem duplicar o cadastro.
6. Matérias-primas e suas entradas também são sincronizadas, incluindo composição, rendimento e histórico de custos.
7. Peças da produção sem preço informado ficam com preço pendente. O preço deve ser cadastrado no Estoque antes da venda.

O menu passa a se chamar **Estoque**. Entradas manuais, transferências, balanços, impressão de etiquetas, publicação de produtos e entrada por XML continuam disponíveis. O estoque físico é reconstruído por movimentos, com armazenadores separados para fábrica, lojas e consignação.

## Painel e relatórios

O painel mantém os períodos rápidos e acrescenta início/fim livres, unidade selecionada ou consolidação das unidades autorizadas. Indicadores, gráfico e resumo por unidade seguem o período aplicado. O relatório pode ser aberto ou exportado a partir dessa seleção.

| Relatório | Conteúdo |
|---|---|
| Estoque por período | Saldo inicial, entradas, saídas, saldo final, custo e valor de venda por variante e unidade |
| Vendas | Documentos, clientes, loja, vendedor, canal, pagamento, status e devoluções na data do retorno |
| Clientes | Clientes agrupados por estado e cidade, unidades atendidas, quantidade de vendas e valor líquido |
| Produtos | Vendas, devoluções, peças líquidas e valor por produto/variante/classificação |
| Produção | Referências, cores, etapas, grade, prazo e situação do fluxo do html |

As consultas usam os limites do histórico demonstrativo. A abertura do estoque corresponde ao fim do dia anterior ao início; o fechamento inclui o último dia. Relatórios têm impressão e CSV. A consolidação considera somente as unidades autorizadas ao usuário.

## Pedidos, vendas e nota

| Estado | Regra |
|---|---|
| Orçamento | Não reserva nem baixa estoque; não gera recebível. |
| Faturamento | Venda confirmada e pronta para emitir nota. O estoque e o financeiro são registrados uma única vez. |
| Pedido faturado | Nota demonstrativa emitida. Emitir a nota não baixa o estoque novamente. |
| Consignado | Peças vinculadas a romaneio e em posse do representante. O envio não é contado como venda concluída. |
| Devolução de produtos | Retorno de venda, reposição do estoque e crédito. A troca pode aplicar o crédito em nova peça no PDV. |
| Em separação | Pedido online confirmado, com estoque já baixado. |
| Enviado | Pedido online expedido, com nota emitida e dados de envio. |
| Entregue | Pedido previamente enviado, com entrega confirmada. |

Nos pedidos online, a situação fiscal e a etapa de entrega ficam separadas: emitir nota não apaga a informação de separação, envio ou entrega. Não é possível enviar um pedido totalmente devolvido. Devoluções parciais preservam o saldo que pode seguir no fluxo.

## Consignações

O mesmo romaneio aceita adição de peças, devolução e correção de devoluções. Cada alteração exige motivo e registra autor, data, quantidades e movimentos. Uma correção produz lançamento compensatório; não apaga o registro anterior.

O acerto parcial ou final continua a apurar vendidas/devolvidas, comissão, fatura e conta a receber. Os limites de peças em posse e estoque disponível são verificados antes da conclusão; operações inválidas são revertidas integralmente.

## Lojas e ambientes comerciais

O cadastro de **Lojas** relaciona nome, cidade, estado, endereço, unidade de estoque e acessos de gerente/vendedor. Uma nova unidade recebe armazenador e caixa. Vendas guardam loja e vendedor para os relatórios.

PDV e e-commerce saem do menu lateral e passam a abrir pelo botão **Ambientes**, no canto inferior direito. A barra de retorno e a aparência de cada ambiente deixam explícita a mudança.

| PDV | E-commerce |
|---|---|
| Login da loja e perfil | Vitrine e detalhe do produto |
| Carrinho e quantidades | Sacola e quantidades |
| Cliente, cidade/estado e vendedor | Identificação e endereço de entrega |
| Pagamento, desconto e parcelas | Pagamento demonstrativo e parcelas |
| Venda, recibo e movimentação de estoque/financeiro/caixa | Confirmação de pedido e movimentação de estoque/financeiro |
| Relatório individual da loja | Acompanhamento por pedido até entrega |
| Devolução e troca com crédito | Etapas de separação, envio e confirmação de entrega |

O vendedor é identificado na operação. Descontos acima do limite demonstrativo exigem perfil de gerente. Nas trocas em dinheiro, o caixa recebe somente a diferença após aplicar o crédito; os registros de venda e devolução permanecem no histórico.

## Usuários e recursos humanos

No mesmo formulário de usuário há seção de RH: funcionário, matrícula, nascimento, admissão, cargo/setor, meta individual e observações de acessos/responsabilidades. A lista de aniversariantes do mês é calculada pelas datas de nascimento. As permissões individuais por área/ação e unidade permanecem disponíveis.

## Metas

**Meta-base = 40% do estoque de referência + 70% das entradas do período.**

O formulário permite selecionar início, fim, unidade e valorização por preço de venda ou custo. A meta não depende de um valor de novidades previsto digitado manualmente.

- Se existir uma meta anterior à data inicial, o estoque de referência é o snapshot ao fim da última meta anterior.
- Na primeira meta, usa-se o estoque ao fim do dia anterior ao início selecionado.
- Entradas externas e da produção contam no período. Devoluções, saldos de implantação e transferências internas ao escopo não aumentam artificialmente a base.
- A transferência para outra unidade pode representar entrada para a unidade de destino; na consolidação, a transferência entre unidades do mesmo escopo não é novidade.
- Os quatro níveis percentuais editáveis do zip continuam disponíveis.
- O histórico guarda período, base, entradas, meta e fechamento. Uma revisão do mesmo período é registrada; períodos distintos sobrepostos são bloqueados.

## Preservação e limites

Caixas, financeiro, fiscal demonstrativo, cadastros, formação de preço, cheques, ponto, autoatendimento, permissões e configurações continuam na base do zip. O menu Produção usa o fluxo do html.

A aplicação funciona localmente sem bibliotecas externas. Credenciais, dados pessoais fictícios e operações são demonstrativos. Não há autenticação de servidor, sincronização entre computadores, processamento real de pagamento, emissão fiscal válida, integração bancária ou transportadora.

Os originais no Desktop não foram alterados. As bases locais da gestão e da produção integradas são separadas das utilizadas pelos protótipos originais. Para preservar os dados, use o backup integrado em Configurações.
