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

* Sofia - agente UX
* Novo skill de frontend para a Lena, responsável pela engenharia de plataforma do projeto

Em relação ao tema do TCC, noto que cada vez a complexidade da aplicação é facilitada pelo claro desenho de contexto.

-

---


