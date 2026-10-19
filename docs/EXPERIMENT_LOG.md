# Experiment Log — TCC SearchFly (Versão Monolítica)

Registro contínuo das observações, aprendizados e decisões ao longo do experimento com arquitetura monolítica baseada em DDD para o TCC.

---

## Entrada 1 — 2026-08-23, 10h00

Até aqui, percebi a diferença em ter os contextos bem delimitados e descritos. Eles me ajudaram a organizar o código mesmo usando IA. No entanto, ainda assim, achei complexo entender o que a IA gerou como código, uma vez que:

1. Os domínios ficaram juntos em um mesmo arquivo `.js`;
2. Há um arquivo `handler.js` que mistura contextos também; e
3. Node.js é completamente novo para mim.

Isso foi proposital no meu experimento, dado que minha experiência é essencialmente com C#.

---

## Entrada 2 — 2026-09-12, 16h20

Nesta nova revisão, percebi que o `handler.js` está sim criado dentro do contexto de `billing` e de forma correta.
Revisando o que a IA gerou, no caso, o `Claude Code`, podemos perceber que tudo está seguindo corretamente a Arquitetura Limpa, os princípios de DDD e temos um arquivo `ARCHITECTURE.md` que facilita a compreesão desse padrão.

A partir de agora estou pronto para seguir com a implementação de um novo contexto e posteriormente, separar esse contexto do monólito.

Aprendizados desta data:

1. Clean Architecture que permitiu estruturar e entender a estrutura corretamente.
2. Criação do board de `Event Storming` para simularmos uma sessão desta prática, preparando a aplicação para arquitetura orientada a eventos.
3. Criação de TDD, a partir das aulas práticas de TDD

---

## Entrada 3 — 2026-09-20, 15h30

Comecei hoje a sessão de *Event Storm*. Está sendo bem produtivo porque, com a ajuda do Claude.AI, criei 3 agentes que conversaram entre si e geraram uma série de artefatos.

### Agentes Criados para o *Event Storm*


>**Ana Rocha**
>
> *Business Domain Expert*
>
> Represents the traveler & travel agency perspective. Challenges the domain 
> model from a real-world use-case angle — edge cases in pricing, notification > fatigue, multi-trip scenarios.
>


>**Marcus Vidal**
>
> *DDD Architect*
>
> Validates aggregate roots, invariants, and context boundaries. Will question > whether the right things are entities vs. value objects and whether context > coupling is clean.
> 


>**Lena Osei**
>
> *Platform Egineer*
>
> Focuses on the in-process event bus, retry logic, test strategy, and how the > Node.js implementation maps to the DDD model. Catches what the theory misses.
>


Pontos de atenção que já surgiram na sessão de apresentação dos Contextos Delimitados (*Bounded Contexts*):


1. Os agentes sentiram falta dos Contextos `Billing` e `Ledger`;

2. A Lena, agente de engenharia, notou que podemos ter problema ao usar `Node.JS`, uma vez que ele é **Single Thread**, e no caso do BC `Watch Management`, podemos ter essa necessidade.

    - Ela também levantou pontos relevantes de arquitetura e resiliência como 

3. Marcus, o agente de *DDD Architecture*, sugeriu uma definição mais clara a respeito de `Price History` e `Price Snapshot`. Estou discutindo com ele a respeito dessa definição.


Seguimos com a discussão para mapeamento do fluxo de eventos de domínio desses contextos.


---

## Entrada 4 — 2026-09-21 a 2026-09-23, 23h30

Desde a sessão de *Event Storm* até agora, a evolução usando IA foi absurdamente rápida.
- Conseguimos criar alguns fluxos de caminho feliz (quase todos).
- Os agentes do DDD sugeriram fluxos de caminhos não mapeados.
- A partir deles, criei os diagramas de solução (frontend e backend).
- Criamos um fluxo de *wireframe* para termos ideia das possíveis telas.
- Definimos a solução *frontend* em monorepo 

Até aqui, além dos agentes para o debate do *Event Storm*, foram criados dois novos agentes:

1. Sofia - agente UX
2. Novo skill de frontend para a Lena, responsável pela engenharia de plataforma do projeto

Em relação ao tema do TCC, noto que cada vez a complexidade da aplicação é facilitada pelo claro desenho de contexto.

-

---

## Entrada 5 — 2026-09-24 20h e 2026-09-29 09h30m

Após a sessão de event storming (esse é o termo correto), criamos alguns protótipos e wireframe.
Ajudou muito a tangibilizar o que é o caminho feliz e um dos caminhos tristes (P0: Credit Exhaustion & Reactivation) do cliente.
O modelo de domínios também segue contribuindo com outras etapas do desenvolvimento.
Fiz criamos outros diagramas com base no modelo de domínios, contextos delimitados e linguagem ubíqua.
Novos artefatos gerados com essas infos:
- Frontend Architecture
- Full-stack Architecture
- Solution Architecture

Adicionalmente, seguimos criando o primeiro repo de frontend, um monorepo que codifica as primeiras telas.
Importante ressaltar que a definição de organização do código, mesmo sendo monolito, está fazendo a diferença inclusive agora durante a criação desse código.
A IA contextualizada com o bounded contexts + formato de organização dos repos, tem conseguido resolver com duas ou três interações todo o código.

Próximos passos:
- Criar o código de Billing
- Criar os testes para esses códigos.
- Iniciar a refatoração de um dos contextos para microsserviço.



---

## Entrada 6 — 2026-10-01 9h e 2026-10-02 10h30m

Foi uma sessão exaustiva de aprendizados com github, setup do React (uma tecnologia relativamente nova para mim).
Minha experiência com github é relativamente boa, porém com um uso mais esporádico. Hoje tive uma boa sessão de aprendizado com o apoio do Claude.Code que facilitou muito a vida.
Comandos como git fetch, git checkout e git grep, me fizeram fixar o conhecimento. Realmente muito bom.
Agora com o React, apenas acompanhei o time de desenvolvimento na empresa em que trabalho. Não cheguei a fazer um treinamento específico nem nada.
Mesmo com o pouco tempo de experiência no React, consegui levantar toda a infra necessária (local) para fazer ele funcionar corretamente. Voalá! O Frontend (parcial), está funcionando.
Ferramentas como o Android Studio, YARN, EXPO-GO também foram sugestões do próprio Claude. Todas as sugestões funcionaram perfeitamente para a simulação que eu precisava.
A qualidade com que o frontend foi codificado, está realmente bem aceitável para um projeto possível de ser disponibilizado no mercado.
Faltam obviamente, implementações de login, autenticação segura entre APIs, e que podem ser temas para outro momento da aplicação.


---

## Entrada 7 — 2026-10-02 18h e 2026-10-03 08h30m

Outra sessão bem intensa em geração de código e avaliação de testes unitários e integrados.
Nestas últimas sessões, fizemos quebras importantes. Primeiro, os contextos `ledger` e `billing` estavam intrínssecos no código. Natural, uma vez que se conectam pela sua natureza de cobrança e fluxo de caixa (entrada e saída de créditos para buscas). De toda forma, decidi separar os dois em duas pastas diferentes dentro do próprio monolito.
Isso deixou o código mais organizado, mais limpo, e com mais artefatos, obviamente.
Por fim, estamos terminando a geração do contexto "search-orchestrator" e vamos partir para a refatoração, com métricas pré estabelecidas.


---

## Entrada 8 — 2026-10-03 23h, 2026-10-04 08h30m e 2026-10-04 13h00m

Finalizadas as principais implementações de monólitos, gerando uma boa base de entendimento e novas funcionalidades dentro dos contextos.
Basicamente, dos 8 contextos criados, 6 tiveram implementação de API e APPs, todos em arquitetura monolítica.
Os contextos `Pricing` e `Notification` ficaram *mockados* por questões de infraestrutura e integração com parceiros externos.

Conforme descrito nas documentações [GitHub Pages](https://marcelo-linhares.github.io/Search-Flight-Monolithic/contexts.html) é possível confirmar que os contextos estão devidamente organizados para facilitar a implementação, documentação e eventual *onboarding* de pessoas.

Outro ponto que confere qualidade ao código é a cobertura de testes, com implementações TDD desde o princípio. Isso garante que o código nasça com testes unitários e testes de integração minimiamente evoluídos, podendo ser objeto de execução via esteira de build & deploy.

Pontos que valem o destaque neste ponto da implementação do monólito:

> **What the project has now**
> - Billing, Ledger, Watch Management, Scheduler, Search and Integration are implemented, with a REST API and a server that runs the scheduler timer.
> - All open domain decisions are made, and the refund is two-step.
> - 423 tests pass (6 todo, 34 suites) with 99.3% statement coverage (unit + integration, run on 2026-10-19), and the Pages site is published.

###

> **What's missing**
> - Pricing and Notification contexts. Pricing detects a price drop from PriceSnapshotCaptured and publishes PriceDropDetected. Notification turns events into alerts for the user.
> - Persistence. Everything is in memory, so a real database is the big missing piece.
> - Identity and auth. Auth is still the temporary x-user-id header, and the payment webhook doesn't verify the gateway's signature.
> - Mobile app on the real API. The mobile app still uses its mock server.

---

## Entrada 9 — 2026-10-04 21h

Agora com a aplicação num nível mais elevado de construção e maturidade, foi possível evidenciar alguns pontos a partir dos seguintes experimentos:

### Experimento A: Change Requests Solicitados
* Duas regras de negócios (CR2 e CR3)
* Um requisito de tecnologia (CR1 sobre idempotência)

### Experimento B: Extrair o Ledger para Refatoração em MS
* Como ele já estava devidamente separado em sua estrtura, o Claude teve facilidade para identificar e organizar o novo código.
* Sem eventos ou ajustes cruzados necessário

### Experimento C: Os Vazamentos
Resumo: o Ledger não provocou vazamentos, os códigos estavam bem claros e fácil para letura (até para um leigo na linguagem como eu)
Um ponto importante: exigiu refatoração de consumidores externos.

Conclusão geral sobre esses úlimos experimentos:

| Claim | Strength | Source |
|-------|----------|--------|
| Contexts are decoupled in this code base (0 cross-context imports, enforced by a test). | Strong | architecture test, `context-metrics.json` |
| Rule changes stay inside one context and the touched file has only its own concepts. | Moderate (3 CRs, one author) | Experiment A |
| A context can be extracted with no change to the other contexts. | Moderate (one extraction) | Experiment B |
| Extraction changes consistency, duplicates and failure behaviour. | Strong for this case | Experiment C tests |
| Developers perceive the structure as helpful. | Perception only (survey, n = 23) | survey, not this repository |
| Teams are more productive / onboard faster / ship fewer bugs. | **Not provable here** | would need a team study |