# Potygen - Pecuária de Precisão e Gestão Bioclimática

O **Potygen** é uma plataforma web responsiva voltada para a transformação digital, melhoramento genético e gestão reprodutiva da pecuária familiar nos Sertões de Crateús. O sistema substitui as anotações manuais por um controle prático baseado em inteligência artificial, dados climáticos e gestão financeira.

---

## 🛠️ Como a Inteligência Artificial Funciona

O assistente inteligente do Potygen funciona como um **Consultor de Dados Seguro** do rebanho, utilizando o modelo **Gemini** com uma trava de contexto para garantir que ele nunca invente informações:

1. **Resposta Blindada:** O sistema junta esses dados reais com a pergunta do usuário e envia para o Gemini com uma ordem rígida: *"Você é o Potygen. Responda apenas usando estes dados reais da fazenda. É proibido inventar qualquer informação fora deste bloco"*. Isso garante respostas exatas, seguras e baseadas na realidade do produtor.
2. **Análise de Clima Local (Brain.js):** Uma inteligência que roda direto no navegador cruza dados de temperatura e umidade para calcular o risco de estresse térmico antes de uma inseminação, avisando o produtor se há risco de perda do sêmen.

---

## ⚙️ Execução Local (Ambiente de Apresentação)

Para garantir estabilidade na apresentação e contornar erros de servidores de hospedagem na véspera da entrega, a interface roda localmente através do VS Code, mas salva e busca os dados na nuvem normalmente.

### Como rodar:
1. Abra a pasta do projeto no **VS Code**.
2. Certifique-se de ter a extensão **Live Server** instalada.
3. Abra o arquivo `index.html`.
4. Clique em **"Go Live"** na barra inferior do VS Code.
5. A aplicação abrirá no navegador.

---

## 🕹️ Manual de Operação da Solução (Passo a Passo das Telas)

### 1. Acesso e Autenticação
* **Preencher Cadastro:** Na tela inicial, o usuário clica em "Cadastrar" e insere as informações para criar seu perfil de acesso.
* **Fazer Login:** O usuário faz o login com e-mail e senha para acessar o seu painel exclusivo.

### 2. Gestão do Rebanho e Reprodução
* **Cadastrar Animal:** No menu "Rebanho", o usuário clica em "Adicionar", preenche a identificação do animal;
* **Registrar Inseminação:** No menu "Reprodução", escolhe o animal, a data do procedimento e o sêmen utilizado. 

### 3. Análise Preditiva e Alertas
* **Ver o Alerta de Clima:** Ao usar o simulador de cruzamento, é devolvida uma probabilidade de sucesso, bem como o sistema analisa o calor de Crateús. Se a temperatura estiver perigosa para o animal, a tela exibe na hora um alerta, sugerindo adiar o procedimento para não perder o sêmen.

### 4. Gestão Financeira e Relatórios (CSV)
* **Controle Econômico e Produção:** No painel financeiro, registram-se os gastos (vacinas, sêmen, ração) e os ganhos (venda de leite/animais). O sistema calcula o saldo, com possibilidade de exportar relatório em pdf e transações em csv. O mesmo ocorre em controle de produção, onde é possível cadastrar o que foi produzido e o valor daquela produção, com possibilidade de associar uma produção a um animal e também gerar relatórios em pdf e csv.
  
---

## 🔒 Segurança de Dados via RLS (Row Level Security)

A privacidade das informações estratégicas e financeiras das fazendas é garantida direto na raiz do projeto através do mecanismo de **RLS (Segurança em Nível de Linha)** nativo do banco de dados (**Supabase/PostgreSQL**):

* **O que é o RLS:** É uma trava de segurança que funciona direto no banco de dados, e não no visual do site. Ele age como um filtro inteligente em cada linha das tabelas.
* **Isolamento Total:** Quando o produtor faz o login, o banco identifica o seu ID. A partir desse momento, qualquer comando de busca só traz registros onde o dono seja aquele ID específico. 
* **Bloqueio de Invasão:** Mesmo que o sistema esteja rodando em ambiente local na apresentação (via VS Code), a proteção do RLS continua blindada na nuvem. Se um usuário tentar alterar o código para espionar o rebanho ou o faturamento de outro produtor, o banco de dados recusa a requisição na hora. Um produtor é matematicamente incapaz de ler ou modificar os dados de outro, garantindo conformidade com a LGPD.

---

## 🚀 Parceria com a Prefeitura e Infraestrutura (Brevo)

* **Operação com a Prefeitura:** O projeto foi desenhado para a **Secretaria Municipal de Desenvolvimento Agrário e Pecuária de Crateús**. Os técnicos da prefeitura usam o sistema nas sedes dos distritos onde há internet, centralizando os dados coletados nas visitas ao campo.
* **Alertas por E-mail:** O sistema envia e-mails automáticos avisando o dia de checar se o animal ficou prenhe. Usamos o plano gratuito do **Brevo (limite de 300 e-mails/dia)** para a fase de testes do Hackathon.
* **Escala Simples:** Para expandir para todo o município e hospedar em um **domínio oficial** (como `potygen.crateus.ce.gov.br`), a prefeitura só precisa mudar a assinatura do Brevo para um plano maior e subir os arquivos para o servidor público. O código do site já está pronto e não precisa de nenhuma alteração.

---
