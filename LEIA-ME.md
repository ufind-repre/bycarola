# Roteiros para explorar o protótipo

Abra index.html. Os exemplos são fictícios e as operações permanecem neste navegador.

## Produção até o estoque

1. Entre como Vinícius na unidade Fábrica e abra Produção.
2. Use as abas locais para Quadro, Finalizadas, Pessoas, Etiquetas e Matérias-primas.
3. Abra uma peça existente e escolha Copiar. Confira a referência e a grade preenchidas; escolha nova cor e lote. A nova produção começa no Desenvolvimento.
4. Atualize responsável, status e observações da etapa. Nas etapas com anexos, inclua os arquivos pedidos; na Ampliação, inclua um molde por tamanho.
5. Em Aviamento, vincule a etiqueta de composição. Em Costura, vincule o código de barras.
6. No Controle de qualidade, classifique toda a grade em normal, segunda linha e rejeitada. A soma por tamanho deve corresponder ao previsto.
7. Finalize. Abra Estoque e confira as variantes normais e de segunda linha. Rejeitadas ficam apenas no histórico da avaliação.
8. Nas variantes com preço pendente, clique em Definir preço. Depois transfira para uma loja se quiser vendê-las no PDV daquela unidade.

A produção demonstra entradas aprovadas logo na base inicial. Reabrir ou recarregar o módulo não repete essas entradas.

## Composição, símbolos e rendimento

1. Em Produção > Matérias-primas, crie ou edite um material.
2. Cadastre, por exemplo, 80% de uma fibra e 90% de outra. O total de 170% é aceito e preservado.
3. Na seção Rendimento, preencha 12,5 kg e 3,2 metros por kg. O resultado calculado é 40 metros.
4. Escolha se essa quantidade deve ser registrada como uma entrada. Ao editar o material, essa opção não é marcada automaticamente.
5. Em Etiquetas, crie uma etiqueta de composição com os percentuais desejados, inclusive acima de 100%.
6. Escolha lavagem, alvejamento, secadora, secagem natural, passadoria e limpeza profissional. Os símbolos e descrições aparecem na prévia e na impressão.
7. Etiquetas já vinculadas à produção continuam preservadas: use Duplicar modelo para fazer outra versão.

## Painel e consulta de estoque

1. No Painel, altere um período rápido ou escolha manualmente a data inicial e a final.
2. Selecione uma unidade ou Todas as unidades autorizadas.
3. Aplique e confira indicadores, gráfico, canais e resultado por unidade.
4. Abra o Relatório do período ou exporte o resumo.
5. Em Estoque, use Consulta por período. Confira saldo inicial, entradas, saídas, saldo final e valores.
6. Em Relatórios, experimente Vendas, Clientes por estado/cidade, Produtos e Produção. Use os mesmos filtros para comparar as unidades.

## Simular o alerta de estoque baixo

Na unidade **Fábrica**, abra **Estoque** e localize **Blusa Brisa · exemplo de estoque baixo**, cor **Oliva**, tamanho **M**, referência **DEMO-EST-010**. O saldo inicial de demonstração é de **10 peças** e o card mostra a flag **Estoque baixo**.

A flag aparece para peças com **10 unidades disponíveis ou menos**, ou um mínimo cadastrado maior. Peças em consignação aparecem separadas e não aumentam o saldo disponível. A aba **Estoque baixo**, o aviso da página e o indicador do painel usam a mesma regra. Ao repor o saldo acima do limite, a flag desaparece; saídas que deixam o saldo no limite ou abaixo dele fazem o alerta aparecer. Recarregar a página não recria o saldo inicial do exemplo.

## Orçamento, faturamento e nota

1. Em Pedidos e vendas, crie um orçamento. Não há baixa nem reserva de estoque.
2. Ao confirmar o faturamento, o estoque é baixado e o recebível é criado uma vez. A situação passa a Faturamento.
3. Emita a nota demonstrativa. A situação fiscal passa a Pedido faturado, sem nova baixa de estoque.
4. Confira o documento no Fiscal e o título no Financeiro.
5. Experimente devolver parte de uma venda. O estoque recebe a peça e o financeiro registra o crédito correspondente.

Em pedidos online, o estado fiscal fica separado da entrega: Em separação, Enviado e Entregue.

## Nota de serviço para contas a pagar

1. Abra **Notas fiscais → Notas de serviço** e clique em **Registrar nota de serviço**.
2. Informe o prestador, número da nota, data de emissão, valor total e descrição do serviço. CPF/CNPJ, série e observações são opcionais.
3. Preencha o vencimento, a forma de pagamento e a conta financeira. Não há seleção de produto, quantidade ou armazenador.
4. Confirme em **Registrar nota e gerar conta a pagar**. A nota é registrada no Fiscal e uma única conta em aberto é criada no Financeiro, com o mesmo valor e vínculo à nota.
5. Use **Consultar** para conferir os dados e a situação da conta. **Ver conta a pagar** abre o lançamento no Financeiro, sem efetuar pagamento automaticamente.
6. Quando quiser registrar o pagamento, utilize a ação **Pagar** do Financeiro. A consulta da nota passa a mostrar Pago, preservando os dados originais do documento.

A entrada de nota de serviço não altera produtos, estoque, produção, pedidos, consignações, caixas ou cheques. Repetir o registro do mesmo prestador, número, série e unidade é bloqueado para evitar outra conta a pagar. Os filtros permitem consultar por prestador, número, descrição, emissão e situação do pagamento.

## PDV e resultado por loja

1. Abra Ambientes, no canto inferior direito, e selecione PDV das lojas.
2. Escolha a loja. Entre com gerente / gerente123 ou vendedor / vendedor123.
3. Adicione produtos ao carrinho. Selecione cliente, cidade/estado, vendedor e pagamento.
4. Para Cartão ou Boleto, escolha o número de parcelas. Para os demais meios, o campo permanece em uma parcela.
5. Finalize a venda e confira o recibo, o estoque, o caixa e o financeiro da loja.
6. Abra Relatórios dentro do PDV para consultar apenas a loja autenticada e filtrar vendedor/período.
7. Em Trocas e devoluções, escolha uma venda. Troque por outra peça e confira a aplicação do crédito.
8. Na troca de uma peça de R$ 289 por outra de R$ 379, a diferença é R$ 90. Se o pagamento da diferença for em dinheiro, somente esse valor aumenta o caixa.
9. Use Gestão By Carola para retornar ao sistema principal.

Os acessos e lojas podem ser cadastrados/alterados em Lojas. Cada venda guarda a identificação da unidade e do vendedor.

## Consultar caixas fechados por data

1. Em Caixas, abra **Histórico de caixas fechados** ou a aba **Histórico de fechamentos**.
2. Escolha Data inicial e Data final. As duas datas são inclusivas e consideram o dia em que o caixa foi fechado.
3. Selecione um caixa ou todos os caixas da unidade e clique em Consultar. Use **Todo o histórico** para consultar sem limite de datas.
4. Clique em Consultar na linha de um fechamento para ver responsável, sessão, valor inicial, dinheiro esperado, dinheiro conferido, diferença e observações.
5. Nos novos fechamentos, os detalhes também preservam as vendas, os pagamentos e as movimentações daquela sessão.
6. O botão Histórico de cada card abre a consulta já filtrada para aquele caixa. A opção Movimentações do caixa mantém a consulta dos eventos de abertura, fechamento, reforço e sangria.

Reabrir o caixa não substitui o fechamento anterior. Dois fechamentos no mesmo dia são registros separados. O histórico segue a unidade selecionada e as permissões do usuário. Registros antigos são recuperados sem inventar os valores que não foram registrados; nesses campos aparece —.

## E-commerce do carrinho à entrega

1. Abra Ambientes > E-commerce.
2. Explore as categorias, abra o produto e adicione à sacola.
3. Ajuste as quantidades e avance para o checkout.
4. Preencha identificação, endereço, cidade, estado, CEP e pagamento. Confirme a compra demonstrativa.
5. O pedido aparece em Em separação; o estoque é baixado uma única vez.
6. Retorne à Gestão e abra Pedidos e vendas. Emita a nota e registre o envio, incluindo o código de acompanhamento.
7. Volte ao e-commerce e use Meus pedidos/Acompanhar para consultar o progresso e confirmar a entrega.

O pedido online inicial da demonstração também permite explorar o acompanhamento.

## Consignação no mesmo romaneio

1. Em Consignações, abra um romaneio existente.
2. Use Movimentar/Alterar romaneio para adicionar uma peça ou registrar devolução. Informe o motivo.
3. Confira a mudança de saldo do representante e o movimento no estoque de origem.
4. Faça uma correção da quantidade devolvida. O histórico mantém o lançamento anterior e o movimento compensatório.
5. Registre um acerto parcial: vendidas geram fatura e recebível líquido da comissão; devolvidas retornam à origem.
6. Consulte os detalhes do romaneio para conferir autor, data e quantidades de cada operação.

## Cheques recebidos de representantes

1. Abra **Cheques**. A carteira aparece em uma tabela, com número, banco, emitente, representante, romaneio, datas, valor e situação.
2. Clique em **Registrar cheque**, preencha os dados do cheque e escolha o representante que o entregou. O representante pode ser diferente do emitente.
3. Se quiser, vincule também um romaneio. O seletor mostra os romaneios daquele representante na unidade selecionada. A foto permanece opcional.
4. Para vincular um cheque que já estava cadastrado, use **Editar / vincular** na linha correspondente.
5. Consulte por situação, representante, número, banco, emitente ou romaneio. Para datas, escolha se o período se refere ao recebimento ou ao campo **Bom para / vencimento**.
6. Use **Situação** para atualizar o cheque. As opções são **Em carteira, Depositado, Compensado, Substituído, Cancelado e Descontado**. Ao substituir, cancelar ou descontar, informe o motivo.
7. Em **Histórico**, acompanhe os dados do cheque, a foto e as alterações com data, responsável e valores anteriores/novos, incluindo mudanças de representante e romaneio.
8. A exportação CSV utiliza os filtros aplicados à tabela. O histórico segue as unidades autorizadas e as permissões do usuário.

O vínculo identifica de quem o cheque foi recebido. Cadastrar, vincular ou mudar a situação de um cheque não quita automaticamente um acerto de consignação ou uma conta financeira. Registros antigos são preservados; datas e responsáveis não registrados na época aparecem como não informados.

## Usuários e metas

1. Em Usuários, clique em Editar e RH. Preencha funcionário, matrícula, nascimento, admissão, cargo/setor, meta individual e observações de acessos.
2. Confira os aniversariantes do mês. Em Permissões, mantenha ou altere os acessos por módulo, ação e unidade.
3. Em Metas, selecione o período, unidade e base de valorização. Calcule a prévia.
4. Confira 40% do estoque de referência mais 70% das entradas registradas no período.
5. Ajuste os quatro níveis e salve. O histórico preserva a memória do cálculo.
6. Para o próximo período, o estoque de referência será o fechamento da última meta anterior. Na primeira meta, usa-se o saldo do dia anterior ao início.

## Backup e reinício

Em Configurações, Exportar backup integrado inclui gestão, produção, etiquetas, anexos e históricos. Restaurar pede confirmação antes de substituir dados. Reiniciar demonstração reinicia os dois módulos.

O zip e o html originais no Desktop foram preservados. Este protótipo tem sua própria pasta e chave de dados de gestão.

## Validação e limites

Os testes em tests/ exercitam regras, views e handlers reais com Node e um DOM mínimo: integração idempotente, qualidade, composição, rendimento, cópia, permissões, lojas, vendas, parcelas, trocas, romaneios, relatórios e metas.

A prévia visual no navegador do ambiente apresentou timeout; não houve inspeção visual completa. Os arquivos foram verificados por sintaxe e execução dos testes, sem afirmar que essa verificação equivale a um teste visual.

Pagamentos, senhas, notas, boletos, remessas, expedição e entrega são demonstrativos locais. Não há comunicação com bancos, SEFAZ, transportadoras ou plataformas externas.
