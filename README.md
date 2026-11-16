# Fluxo Moda · By Carola

Protótipo local integrado de produção, estoque, lojas, vendas e gestão.

**Abra [index.html](index.html) em um navegador atualizado.** Mantenha todos os arquivos desta pasta juntos. Não há instalação de dependências nem compilação.

Para usar um servidor estático, execute `python -m http.server 8765` nesta pasta e abra `http://localhost:8765`. Se o navegador restringir armazenamento em arquivos locais, use essa opção.

## Primeiros passos

1. No painel, escolha o início, fim e a unidade ou a visão consolidada.
2. Abra **Produção**: o fluxo do HTML agora ocupa esse menu, com as 12 etapas e seus cadastros de apoio.
3. Em **Peças finalizadas**, confira as classificações. As aprovadas chegam ao **Estoque** por cor, tamanho e qualidade, sem duplicação.
4. No Estoque, use **Definir preço** nas variantes novas antes de vendê-las. O protótipo não inventa o preço de peças que chegam da produção.
5. Abra **Ambientes**, no canto inferior direito, para entrar no **PDV das lojas** ou no **E-commerce**.

## Acessos demonstrativos do PDV

| Perfil | Login | Senha |
|---|---|---|
| Gerente | gerente | gerente123 |
| Vendedor | vendedor | vendedor123 |

Escolha a loja no login. As credenciais podem ser alteradas no cadastro de **Lojas**. São dados locais de demonstração, sem autenticação de servidor.

## Onde está cada entrega

| Arquivo | Finalidade |
|---|---|
| `index.html` | Entrada do sistema integrado |
| `producao.html` | Produção de 12 etapas, etiquetas, composição e rendimento |
| `core.js` e `app.js` | Base preservada do projeto zip |
| `integration-core.js` | Regras de integração, estoque, lojas, vendas e metas |
| `workspace-ui.js` e `workspace.css` | Painel, estoque, relatórios, RH, metas e integração visual |
| `commerce-ui.js` e `commerce.css` | Lojas, PDV, e-commerce, pedidos e consignações |
| `cash-history-core.js` e `cash-history-ui.js` | Fechamentos preservados e consulta de caixas fechados por período |
| `checks-core.js`, `checks-ui.js` e `checks.css` | Tabela filtrável de cheques, representantes, romaneios e histórico |
| `stock-alerts.js` | Alerta de estoque baixo e peça de demonstração com 10 unidades |
| `service-notes-core.js` e `service-notes-ui.js` | Notas de serviço recebidas que geram somente contas a pagar |
| `ESPECIFICACAO.md` | Requisitos organizados e regras de funcionamento |
| `LEIA-ME.md` | Roteiros para explorar os fluxos completos |
| `tests/` | Testes automatizados de domínio e interação |

## Dados e continuidade

Os dados da gestão ficam no `localStorage`, em uma chave própria do protótipo integrado. A produção e seus anexos ficam no IndexedDB, também em uma base própria da versão integrada. A sincronização inicia automaticamente ao abrir o sistema.

Em **Caixas → Histórico de fechamentos**, selecione as datas e o caixa para consultar conferências anteriores. **Todo o histórico** remove o limite do período. Cada fechamento preserva os valores da sessão, mesmo após reabrir o caixa; registros antigos mostram apenas os dados que foram salvos na época.

Em **Cheques**, consulte a tabela por situação, representante, texto e período de recebimento ou vencimento. Cada cheque pode ter um representante e um romaneio vinculados, mantendo o emitente identificado separadamente. O histórico registra as alterações de dados, vínculo e situação com data e responsável.

Em **Estoque**, a flag **Estoque baixo** sinaliza peças com até 10 unidades disponíveis, respeitando um mínimo cadastrado maior. A aba **Estoque baixo** e o painel usam a mesma regra. A **Blusa Brisa · Oliva / M** exemplifica o alerta com 10 unidades na Fábrica; o exemplo é cadastrado uma única vez e não repõe o saldo após vendas.

Em **Notas fiscais → Notas de serviço**, registre prestador, número, emissão, valor, descrição e vencimento. A confirmação gera uma única conta a pagar vinculada à nota. Essa operação não movimenta estoque, produção, vendas ou consignações. O pagamento é registrado posteriormente no Financeiro.

Em **Configurações**, **Exportar backup integrado** inclui a gestão e a produção, com seus anexos. A restauração pede confirmação e substitui os dados locais. **Reiniciar demonstração** reinicia os dois módulos.

Os documentos fiscais, pagamentos, boletos, remessas e entregas permanecem simulações. Nenhum dado é enviado à SEFAZ, a bancos ou a plataformas de venda. O cadastro de lojas e as permissões ilustram o fluxo solicitado; não implementam segurança de um sistema em produção.

## Validação

Nesta versão, 113 testes automatizados passaram. Os testes podem ser executados com Node.js:

```powershell
node --test tests/*.test.cjs
```

Os testes verificam regras, renderizações e handlers reais com um DOM mínimo. Não substituem inspeção visual em um navegador. A prévia do navegador disponível no ambiente de desenvolvimento apresentou timeout, portanto a validação visual não foi concluída nessa sessão.
